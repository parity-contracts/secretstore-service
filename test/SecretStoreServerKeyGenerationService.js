const Promise = require("bluebird");
const SetOwnedWithMigration = artifacts.require("./OwnedKeyServerSetWithMigration.sol");
const ServerKeyGenerationService = artifacts.require("./SecretStoreServerKeyGenerationService.sol");

import {recoverPublic} from './helpers/crypto';

require('chai/register-expect');
require('truffle-test-utils').init();

contract('ServerKeyGenerationService', function(accounts) {
  let nonKeyServer = accounts[3];

  // Key servers data.
  let server1 = { ip: '127.0.0.1:12000' };
  let server2 = { ip: '127.0.0.1:12001' };
  let server3 = { ip: '127.0.0.1:12002' };

  function initializeKeyServerSet(contract) {
    server1.address = accounts[0];
    server1.public = recoverPublic(accounts[0]);
    server2.address = accounts[1];
    server2.public = recoverPublic(accounts[1]);
    server3.address = accounts[2];
    server3.public = recoverPublic(accounts[2]);

    return Promise.try(() => contract.addKeyServer(server1.public, server1.ip))
      .then(() => contract.addKeyServer(server2.public, server2.ip))
      .then(() => Promise.resolve(contract));
  }

  function initializeKeyServerSetSingle(contract) {
    server1.address = accounts[0];
    server1.public = recoverPublic(accounts[0]);

    return Promise.try(() => contract.addKeyServer(server1.public, server1.ip))
      .then(() => Promise.resolve(contract));
  }

  describe("ServerKeyGenerationService", () => {
    let setContract;
    let serviceContract;

    beforeEach(() => SetOwnedWithMigration.new()
      .then(_contract => setContract = _contract)
      .then(() => ServerKeyGenerationService.new(setContract.address))
      .then(_contract => serviceContract = _contract)
    );

    // SecretStoreServiceBase tests

    it("should reject direct payments", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.sendTransaction({ value: 100 }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should return correct value from keyServersCount", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.keyServersCount())
      .then(c => assert.equal(2, c))
      .then(() => setContract.addKeyServer(server3.public, server3.ip))
      .then(() => serviceContract.keyServersCount())
      .then(c => assert.equal(3, c))
    );

    it("should return correct index from requireKeyServer", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.requireKeyServer(server1.address))
      .then(i => assert.equal(0, i))
      .then(() => serviceContract.requireKeyServer(server2.address))
      .then(i => assert.equal(1, i))
      .then(() => serviceContract.requireKeyServer(server3.address))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should not drain zero balance", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.drain())
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should drain the balance of key server", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.drain({ from: server2.address }))
      .then(() => web3.eth.getBalance(server2.address))
      .then(b => assert(b.toNumber() > 100000000000000000000))
    );

    // ServerKeyGenerationServiceClientApi tests

    it("should accept server key generation request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyGenerationRequested',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          author: accounts[0],
          threshold: 1
        }
      }, 'Event is emitted'))
    );

    it("should reject server key generation request when fee is not paid", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001", 1))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should reject server key generation request when not enough fee paid", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(100, 'finney') }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should reject server key generation request when threshold is too large", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        2, { value: web3.toWei(200, 'finney') }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should reject server key generation request when there are too many pending requests", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        0, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        0, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000003",
        0, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000004",
        0, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000005",
        0, { value: web3.toWei(200, 'finney') }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should reject duplicated server key generation request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        0, { value: web3.toWei(200, 'finney') }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    // ServerKeyGenerationServiceKeyServerApi tests

    it("should publish generated server key", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server2.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyGenerated',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        }
      }, 'Event is emitted'))
    );

    it("should not accept generated server key when it is not a valid public", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x01", { from: server1.address }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should ignore generated server key when there's no request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
    );

    it("should not accept generated server key from non key server", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x01", { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should not publish server key if got second response from same key server", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
    );

    it("should raise generation error if two key servers are not agreed about generated server key", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003",
        { from: server2.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyGenerationError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should raise generation error if three key servers are not agreed about generated server key", () => initializeKeyServerSet(setContract)
      .then(() => setContract.addKeyServer(server3.public, server3.ip))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server2.address }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003",
        { from: server3.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyGenerationError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should raise generation error if at least one key server has reported an error", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerationError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server1.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyGenerationError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should raise generation error if at least one key server has reported an error with 0-threshold", () => initializeKeyServerSetSingle(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        0, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerationError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server1.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyGenerationError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should fail if generation error is reported be a non key server", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerationError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should not raise generation error if no request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.serverKeyGenerationError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
    );

    it("should return pending requests", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.serverKeyGenerationRequestsCount())
      .then(c => assert.equal(c, 0))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { from: server1.address, value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        0, { from: server2.address, value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerationRequestsCount())
      .then(c => assert.equal(c, 2))
      .then(() => serviceContract.getServerKeyGenerationRequest(0))
      .then(request => {
        assert.equal(request[0], "0x0000000000000000000000000000000000000000000000000000000000000001");
        assert.equal(request[1], server1.address);
        assert.equal(request[2], 1);
      })
      .then(() => serviceContract.getServerKeyGenerationRequest(1))
      .then(request => {
        assert.equal(request[0], "0x0000000000000000000000000000000000000000000000000000000000000002");
        assert.equal(request[1], server2.address);
        assert.equal(request[2], 0);
      })
    );

    it("should return if response is required", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.isServerKeyGenerationResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
      .then(() => serviceContract.isServerKeyGenerationResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server2.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(() => serviceContract.isServerKeyGenerationResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, false))
      .then(() => serviceContract.isServerKeyGenerationResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server2.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
    );

    it("should reset existing responses when servers set changes", () => initializeKeyServerSet(setContract)
      // request is created and single key server responds
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(() => serviceContract.isServerKeyGenerationResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, false))
      // then we're starting && completing the migration
      .then(() => setContract.completeInitialization())
      .then(() => setContract.addKeyServer(server3.public, server3.ip))
      .then(() => setContract.startMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server1.address}))
      .then(() => setContract.confirmMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server1.address}))
      .then(() => setContract.confirmMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server2.address}))
      .then(() => setContract.confirmMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server3.address}))
      // let's check that response is now required key server 1
      .then(() => serviceContract.isServerKeyGenerationResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
      // now we're receiving response from KS2 && KS3 and still response from KS1 is required
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server2.address }))
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server3.address }))
      .then(() => serviceContract.isServerKeyGenerationResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
      // now we're receiving response from KS1 and key generated event is fired
      .then(() => serviceContract.serverKeyGenerated("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        { from: server1.address }))
      .then(receipt => assert.web3Event(receipt, {
          event: 'ServerKeyGenerated',
          args: {
            serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
            serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
          }
        }, 'Event is emitted'))
    );

    // Administrative API tests

    it("should be able to change owner by current owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setOwner(nonKeyServer))
      .then(() => serviceContract.setServerKeyGenerationFee(10, { from: nonKeyServer }))
      .then(() => serviceContract.setServerKeyGenerationFee(20))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should not be able to change owner by non-current owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setOwner(nonKeyServer, { from: server2.address }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should be able to change fee", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setServerKeyGenerationFee(10))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(10, 'finney') }))
    );

    it("should not be able to change fee by a non-owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setServerKeyGenerationFee(10, { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should be able to change requests limit", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setMaxServerKeyGenerationRequests(5))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000003",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000004",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000005",
        1, { value: web3.toWei(200, 'finney') }))
    );

    it("should not be able to change requests limit by a non-owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setMaxServerKeyGenerationRequests(5, { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should be able to delete request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyGenerationRequestsCount())
      .then(c => assert.equal(c, 2))
      .then(() => serviceContract.deleteServerKeyGenerationRequest("0x0000000000000000000000000000000000000000000000000000000000000002"))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyGenerationError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000002"
        }
      }, 'Event is emitted'))
      .then(() => serviceContract.serverKeyGenerationRequestsCount())
      .then(c => assert.equal(c, 1))
    );

    it("should not be able to delete request by a non-owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.generateServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        1, { value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.deleteServerKeyGenerationRequest("0x0000000000000000000000000000000000000000000000000000000000000001",
        {from: nonKeyServer}))
      .then(() => assert(false, "supposed to fail"), () => {})
    );
  });
});
