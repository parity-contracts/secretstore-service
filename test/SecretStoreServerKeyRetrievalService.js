const Promise = require("bluebird");
const SetOwnedWithMigration = artifacts.require("./OwnedKeyServerSetWithMigration.sol");
const ServerKeyRetrievalService = artifacts.require("./SecretStoreServerKeyRetrievalService.sol");

import {recoverPublic} from './helpers/crypto';

require('chai/register-expect');
require('truffle-test-utils').init();

contract('ServerKeyRetrievalService', function(accounts) {
  let nonKeyServer = accounts[5];

  // Key servers data.
  let server1 = { ip: '127.0.0.1:12000' };
  let server2 = { ip: '127.0.0.1:12001' };
  let server3 = { ip: '127.0.0.1:12002' };
  let server4 = { ip: '127.0.0.1:12003' };
  let server5 = { ip: '127.0.0.1:12004' };

  function initializeKeyServerSet(contract) {
    server1.address = accounts[0];
    server1.public = recoverPublic(accounts[0]);
    server2.address = accounts[1];
    server2.public = recoverPublic(accounts[1]);
    server3.address = accounts[2];
    server3.public = recoverPublic(accounts[2]);
    server4.address = accounts[3];
    server4.public = recoverPublic(accounts[3]);
    server5.address = accounts[4];
    server5.public = recoverPublic(accounts[4]);

    return Promise.try(() => contract.addKeyServer(server1.public, server1.ip))
      .then(() => contract.addKeyServer(server2.public, server2.ip))
      .then(() => contract.addKeyServer(server3.public, server3.ip))
      .then(() => contract.addKeyServer(server4.public, server4.ip))
      .then(() => contract.addKeyServer(server5.public, server5.ip))
      .then(() => Promise.resolve(contract));
  }

  describe("ServerKeyRetrievalService", () => {
    let setContract;
    let serviceContract;

    beforeEach(() => SetOwnedWithMigration.new()
      .then(_contract => setContract = _contract)
      .then(() => ServerKeyRetrievalService.new(setContract.address))
      .then(_contract => serviceContract = _contract)
    );

    // SecretStoreServiceBase tests

    it("should reject direct payments", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.sendTransaction({ value: 100 }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should return correct value from keyServersCount", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.keyServersCount())
      .then(c => assert.equal(5, c))
      .then(() => setContract.removeKeyServer(server3.address))
      .then(() => serviceContract.keyServersCount())
      .then(c => assert.equal(4, c))
    );

    it("should return correct index from requireKeyServer", () => initializeKeyServerSet(setContract)
      .then(() => setContract.removeKeyServer(server3.public, server3.ip))
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
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.drain({ from: server2.address }))
      .then(() => web3.eth.getBalance(server2.address))
      .then(b => assert(b.toNumber() > 100000000000000000000))
    );

    // ServerKeyRetrievalServiceClientApi tests

    it("should accept server key retriveal request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrievalRequested',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should reject server key retrieval request when fee is not paid", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001"))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should reject server key retrieval request when not enough fee paid", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(50, 'finney') }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should reject server key retrieval request when there are too many pending requests", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000003",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000004",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000005",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000006",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000007",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000008",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000009",
        { value: web3.toWei(100, 'finney') }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should reject duplicated server key retrieval request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    // ServerKeyRetrievalServiceKeyServerApi tests

    it("should publish retrieved server key if all servers respond with same value", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value:
      // 1) 3-of-5 servers are responding with the same threshold value
      // 2) by that time last response already have support of 3 (when only 2 is required) => retrieved
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server2.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server3.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        }
      }, 'Event is emitted'))
    );

    it("should publish retrieved server key if some servers respond with different public values", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value:
      // 1) KS1 responds with (P1, 3). 3-threshold support is 1
      // 2) KS2 responds with (P2, 3). 3-threshold support is 2
      // 3) KS3 responds with (P1, 3). 3-threshold support is 3 => threshold is 3. (P1, 3) support is 2
      // 4) KS4 responds with (P1, 3). (P1, 3) support is 3
      // 5) KS5 responds with (P1, 3). (P1, 3) support is 4
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server1.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003", 3,
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server3.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server4.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server5.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        }
      }, 'Event is emitted'))
    );

    it("should publish retrieved server key if some servers respond with different threshold values", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value:
      // 1) KS1 responds with (P1, 3). 3-threshold support is 1
      // 2) KS2 responds with (P1, 10). 3-threshold support is 1
      // 3) KS3 responds with (P1, 3). 3-threshold support is 2
      // 4) KS4 responds with (P1, 3). (P1, 3) support is 3 => threshold is 3. (P1, 3) support is 3
      // 5) KS5 responds with (P1, 3). (P1, 3) support is 4
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server1.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 10,
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server3.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server4.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server5.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        }
      }, 'Event is emitted'))
    );

    it("should publish retrieved server key if public is stabilized before threshold", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value:
      // 1) KS1 responds with (P1, 1). 1-threshold support is 1
      // 2) KS2 responds with (P1, 1). 1-threshold support is 2. (P1, 1) support is 2, enough for 1-threshold
      // 3) KS3 responds with (P2, 1). 1-threshold support is 3 => threshold is 1. P1 already has enough support && we publish it
      //  even though KS3 has responded with P2 && at the end P2 could end having more confirmations than P1
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003", 1,
        { from: server3.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        }
      }, 'Event is emitted'))
    );

    it("should ignore response if responded twice", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value => let's check if 3 responses from single server won't work
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
    );

    it("should fail if key server responds with invalid public", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0xdeadbeef", 3, { from: server1.address }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should raise retrieval error if many servers respond with different public values before threshold stabilized", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value:
      // 1) KS1 responds with (P1, 3). 3-threshold support is 1
      // 2) KS2 responds with (P2, 3). 3-threshold support is 2
      // 3) KS3 responds with (P3, 3). 3-threshold support is 3 => threshold is 3 => we need 4 nodes to agree upon same public value
      //   => max public support is 1 and there are only 2 nodes left to vote => agreement is impossible
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003", 3,
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000004", 3,
        { from: server3.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should raise retrieval error if many servers respond with different public values after threshold stabilized", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value:
      // 1) KS1 responds with (P1, 2). 2-threshold support is 1
      // 2) KS2 responds with (P2, 2). 2-threshold support is 2
      // 3) KS3 responds with (P3, 2). 2-threshold support is 3 => threshold is 2 => we need 3 nodes to agree upon same public value
      // 4) KS4 responds with (P4, 2). max public support is 1 and there are only 1 node left to vote => agreement is impossible
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 2,
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003", 2,
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000004", 2,
        { from: server3.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000005", 2,
        { from: server4.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should raise retrieval error if many servers respond with different threshold values", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      // 3-of-5 servers are required to respond with the same threshold value:
      // 1) KS1 responds with (P1, 1). 2-threshold support is 1
      // 2) KS2 responds with (P1, 2). 2-threshold support is 2
      // 3) KS3 responds with (P1, 3). 2-threshold support is 3 => threshold is 2 => we need 3 nodes to agree upon same public value
      // 4) KS4 responds with (P1, 4). max threshold support is 1 and there is only 1 node left to vote => threshold agreement is impossible
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 2,
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 3,
        { from: server3.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 4,
        { from: server4.address }))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
        }
      }, 'Event is emitted'))
    );

    it("should ignore response if no active request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
    );

    it("should fail if response is reported by non key-server", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should ignore error if no active request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server1.address }))
    );

    it("should fail if error is reported by non key-server", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should raise an error if 50%+1 servers have reported an error", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server3.address }))
      .then(receipt => assert.web3Event(receipt, {
          event: 'ServerKeyRetrievalError',
          args: {
            serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
          }
        }, 'Event is emitted'))
    );

    it("should publish retrieved server key even though some key servers has responded with an error", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server3.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server4.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003", 1,
        { from: server5.address }))
      .then(receipt => assert.web3Event(receipt, {
          event: 'ServerKeyRetrieved',
          args: {
            serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
            serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
          }
        }, 'Event is emitted'))
    );

    it("should raise an error even though some servers have responded", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 4,
        { from: server1.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 4,
        { from: server2.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server3.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      // possible optimization:
      // at this moment we already have (4-threshold support of 2) and (256-threshold support of 1)
      // => even though the rest of KS will resppnd with 4-threshold, we won't be able to agree upon public because 1 node has failed to agree
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server4.address }))
      .then(receipt => assert.equal(receipt.logs.length, 0))
      .then(() => serviceContract.serverKeyRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server5.address }))
      .then(receipt => assert.web3Event(receipt, {
          event: 'ServerKeyRetrievalError',
          args: {
            serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001"
          }
        }, 'Event is emitted'))
    );

    it("should return pending requests", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.serverKeyRetrievalRequestsCount())
      .then(c => assert.equal(c, 0))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: server1.address, value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        { from: server2.address, value: web3.toWei(200, 'finney') }))
      .then(() => serviceContract.serverKeyRetrievalRequestsCount())
      .then(c => assert.equal(c, 2))
      .then(() => serviceContract.getServerKeyRetrievalRequest(0))
      .then(request => assert.equal(request, "0x0000000000000000000000000000000000000000000000000000000000000001"))
      .then(() => serviceContract.getServerKeyRetrievalRequest(1))
      .then(request => assert.equal(request, "0x0000000000000000000000000000000000000000000000000000000000000002"))
    );

    it("should return if response is required", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.isServerKeyRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
      .then(() => serviceContract.isServerKeyRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server2.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(() => serviceContract.isServerKeyRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, false))
      .then(() => serviceContract.isServerKeyRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server2.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
    );

    it("should reset existing responses when servers set changes", () => initializeKeyServerSet(setContract)
      // request is created and single key server responds
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server1.address }))
      .then(() => serviceContract.isServerKeyRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, false))
      // then we're starting && completing the migration
      .then(() => setContract.completeInitialization())
      .then(() => setContract.removeKeyServer(server3.address))
      .then(() => setContract.startMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server1.address}))
      .then(() => setContract.confirmMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server1.address}))
      .then(() => setContract.confirmMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server2.address}))
      .then(() => setContract.confirmMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server4.address}))
      .then(() => setContract.confirmMigration("0x0000000000000000000000000000000000000000000000000000000000000001", {from: server5.address}))
      // let's check that response is now required key server 1
      .then(() => serviceContract.isServerKeyRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
      // now we're receiving response from KS2 && KS4 and still response from KS1 is required
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server2.address }))
      .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
        { from: server4.address }))
      .then(() => serviceContract.isServerKeyRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
        server1.address))
      .then(isResponseRequired => assert.equal(isResponseRequired, true))
    // now we're receiving response from KS1 and key retrieval event is fired
    .then(() => serviceContract.serverKeyRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002", 1,
      { from: server1.address }))
    .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          serverKeyPublic: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        }
      }, 'Event is emitted'))
    );

    // Administrative API tests

    it("should be able to change owner by current owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setOwner(nonKeyServer))
      .then(() => serviceContract.setServerKeyRetrievalFee(10, { from: nonKeyServer }))
      .then(() => serviceContract.setServerKeyRetrievalFee(20))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should not be able to change owner by non-current owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setOwner(nonKeyServer, { from: server2.address }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should be able to change fee", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setServerKeyRetrievalFee(10))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(10, 'finney') }))
    );

    it("should not be able to change fee by a non-owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setServerKeyRetrievalFee(10, { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should be able to change requests limit", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setMaxServerKeyRetrievalRequests(9))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000003",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000004",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000005",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000006",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000007",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000008",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000009",
        { value: web3.toWei(100, 'finney') }))
    );

    it("should not be able to change requests limit by a non-owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.setMaxServerKeyRetrievalRequests(5, { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );

    it("should be able to delete request", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000002",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.serverKeyRetrievalRequestsCount())
      .then(c => assert.equal(c, 2))
      .then(() => serviceContract.deleteServerKeyRetrievalRequest("0x0000000000000000000000000000000000000000000000000000000000000002"))
      .then(receipt => assert.web3Event(receipt, {
        event: 'ServerKeyRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000002"
        }
      }, 'Event is emitted'))
      .then(() => serviceContract.serverKeyRetrievalRequestsCount())
      .then(c => assert.equal(c, 1))
    );

    it("should not be able to delete request by a non-owner", () => initializeKeyServerSet(setContract)
      .then(() => serviceContract.retrieveServerKey("0x0000000000000000000000000000000000000000000000000000000000000001",
        { value: web3.toWei(100, 'finney') }))
      .then(() => serviceContract.deleteServerKeyRetrievalRequest("0x0000000000000000000000000000000000000000000000000000000000000001",
        { from: nonKeyServer }))
      .then(() => assert(false, "supposed to fail"), () => {})
    );
  });
});
