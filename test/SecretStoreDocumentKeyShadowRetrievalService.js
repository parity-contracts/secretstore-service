const Promise = require("bluebird");
const SetOwnedWithMigration = artifacts.require("./OwnedKeyServerSetWithMigration.sol");
const DocumentKeyShadowRetrievalService = artifacts.require("./SecretStoreDocumentKeyShadowRetrievalService.sol");

import {recoverPublic} from './helpers/crypto';

require('chai/register-expect');
require('truffle-test-utils').init();

contract('DocumentKeyShadowRetrievalService', function(accounts) {
  let nonKeyServer = accounts[6];

  // Key servers data.
  let server1 = { ip: '127.0.0.1:12000' };
  let server2 = { ip: '127.0.0.1:12001' };
  let server3 = { ip: '127.0.0.1:12002' };
  let server4 = { ip: '127.0.0.1:12003' };
  let server5 = { ip: '127.0.0.1:12004' };
  let commonPoint1 = "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002";
  let decryptedSecret1 = "0x00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000004";
  let commonPoint2 = "0x00000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000006";
  let shadow1 = "0xdeadbeef01";
  let shadow2 = "0xdeadbeef02";
  let participants1 = "0x0000000000000000000000000000000000000000000000000000000000000003";

  let requester1 = "";
  let requesterAddress1 = "";
  let requesterPublic1 = "";

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

    requester1 = requesterAddress1 = accounts[5];
    requesterPublic1 = recoverPublic(accounts[5]);

    return Promise.try(() => contract.addKeyServer(server1.public, server1.ip))
      .then(() => contract.addKeyServer(server2.public, server2.ip))
      .then(() => contract.addKeyServer(server3.public, server3.ip))
      .then(() => contract.addKeyServer(server4.public, server4.ip))
      .then(() => contract.addKeyServer(server5.public, server5.ip))
      .then(() => Promise.resolve(contract));
  }

  describe("DocumentKeyShadowRetrievalService", () => {
    let setContract;
    let serviceContract;

    beforeEach(() => SetOwnedWithMigration.new()
      .then(_contract => setContract = _contract)
      .then(() => DocumentKeyShadowRetrievalService.new(setContract.address))
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
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.drain({ from: server2.address }))
    .then(() => web3.eth.getBalance(server2.address))
    .then(b => assert(b.toNumber() > 100000000000000000000))
  );

  // DocumentKeyShadowRetrievalServiceClientApi tests

  it("should accept document key shadow retriveal request", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(receipt => assert.web3Event(receipt, {
      event: 'DocumentKeyCommonRetrievalRequested',
      args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requester1
        }
    }, 'Event is emitted'))
  );

  it("should reject document key shadow retrieval request with invalid public", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      "0xFF", { from: server1.address }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should reject document key shadow retrieval request with non-owned public", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: server1.address, value: web3.toWei(200, 'finney') }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should reject document key shadow retrieval request when fee is not paid", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1 }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should reject document key shadow retrieval request when not enough fee paid", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(100, 'finney') }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should reject document key shadow retrieval request when there are too many pending requests", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      server1.public, { from: server1.address, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      server2.public, { from: server2.address, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      server3.public, { from: server3.address, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      server4.public, { from: server4.address, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      server5.public, { from: server5.address, value: web3.toWei(200, 'finney') }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should reject duplicated document key shadow retrieval request", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  // DocumentKeyShadowRetrievalServiceKeyServerApi tests

  it("should publish retrieved document key shadow if all servers respond with same value", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    // 3-of-5 servers are required to respond with the same threshold value:
    // 1) 3-of-5 servers are responding with the same threshold value
    // 2) by that time last common response already have support of 3 (when only 2 is required) => common is retrieved
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    .then(receipt => assert.web3Events(receipt, [{
        event: 'DocumentKeyCommonRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1,
          commonPoint: commonPoint1,
          threshold: 1
        }
      }, {
        event: 'DocumentKeyPersonalRetrievalRequested',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requesterPublic: requesterPublic1,
        }
      }], 'Events are emitted'
    ))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow1, { from: server1.address }))
    .then(receipt => assert.web3Event(receipt, {
        event: 'DocumentKeyPersonalRetrieved',
        args: {
            serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
            requester: requesterAddress1,
            decryptedSecret: decryptedSecret1,
            shadow: shadow1
          }
      }, 'Event is emitted'))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow2, { from: server2.address }))
    .then(receipt => assert.web3Event(receipt, {
      event: 'DocumentKeyPersonalRetrieved',
      args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1,
          decryptedSecret: decryptedSecret1,
          shadow: shadow2
        }
      }, 'Event is emitted'))
    .then(() => serviceContract.documentKeyShadowRetrievalRequestsCount())
    .then(c => assert.equal(c, 0))
  );

  it("should publish retrieved document key common only once", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    // there are 5 servers => we'll wait for 5/2+1 servers to respond with the same value before publishing common data
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    .then(receipt => assert.web3Events(receipt, [{
        event: 'DocumentKeyCommonRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1,
          commonPoint: commonPoint1,
          threshold: 1
        }
      }, {
        event: 'DocumentKeyPersonalRetrievalRequested',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requesterPublic: requesterPublic1,
        }
      }], 'Events are emitted'
    ))
    // now let's check that when 4th server responds with the same common data, no events are fired
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server4.address }))
    .then(receipt => assert.equal(receipt.logs.length, 0))
  );

  it("should publish retrieved document key common if some servers respond with different common values", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 2, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint2, 1, { from: server3.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server4.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server5.address }))
    .then(receipt => assert.web3Events(receipt, [{
        event: 'DocumentKeyCommonRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1,
          commonPoint: commonPoint1,
          threshold: 1
        }
      }, {
        event: 'DocumentKeyPersonalRetrievalRequested',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requesterPublic: requesterPublic1,
        }
      }], 'Events are emitted'
    ))
  );

  it("should fail document key common retrieval if no agreement on common values possible", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 2, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint2, 1, { from: server3.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint2, 3, { from: server4.address }))
    .then(receipt => assert.web3Event(receipt, {
        event: 'DocumentKeyShadowRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1
        }
    }))
  );

  it("should ignore document key common if no active request", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(receipt => assert.equal(receipt.logs.length, 0))
  );

  it("should ignore document key personal if no active request", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow1, { from: server1.address }))
    .then(receipt => assert.equal(receipt.logs.length, 0))
  );

  it("should fail if personal received before common is retrieved", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow1, { from: server1.address }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should fail if second personal data is retrieved", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow1, { from: server1.address }))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow2, { from: server1.address }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should fail if common data is reported by a non-key server", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: nonKeyServer }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should fail if personal data is reported by a non-key server", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow1, { from: nonKeyServer }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should fail if personal data is reported by a wrong key server", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, "0x0000000000000000000000000000000000000000000000000000000000000002", decryptedSecret1, shadow1,
      { from: server1.address }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should ignore document key retrieval error if no active request", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server1.address }))
    .then(receipt => assert.equal(receipt.logs.length, 0))
  );

  it("should fail if retrieval error is reported by a non key-server", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: nonKeyServer }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should report document key shadow retrieval failure if common retrieval error is confirmed by 50%+1 servers", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server2.address }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server3.address }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server4.address }))
    .then(receipt => assert.web3Event(receipt, {
        event: 'DocumentKeyShadowRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1
        }
    }))
  );

  it("should ignore private retrieval errror when reported twice", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    // N is 5 => we are waiting for 3 (5/2 + 1) errors before reporting an error
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server1.address }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server2.address }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server1.address }))
    .then(receipt => assert.equal(receipt.logs.length, 0))
  );

  it("should report document key shadow retrieval failure if private retrieval error is confirmed by >= N/2+1 servers", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    // N is 5 => we are waiting for 3 (5/2 + 1) errors before reporting an error
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server1.address }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server2.address }))
    .then(() => serviceContract.documentKeyShadowRetrievalError("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: server3.address }))
    .then(receipt => assert.web3Event(receipt, {
        event: 'DocumentKeyShadowRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1
        }
    }))
  );

  it("should return pending requests", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.documentKeyShadowRetrievalRequestsCount())
    .then(c => assert.equal(c, 0))
    // two active requests:
    // 1st one is empty
    // 2nd one is finished common retrieval phase + received personal data from server1
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      server1.public, { from: server1.address, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterPublic1, { from: requester1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterAddress1, participants1, decryptedSecret1, shadow1, { from: server1.address }))
    // now check requests
    .then(() => serviceContract.documentKeyShadowRetrievalRequestsCount())
    .then(c => assert.equal(c, 2))
    .then(() => serviceContract.getDocumentKeyShadowRetrievalRequest(0))
    .then(request => {
      assert.equal(request[0], "0x0000000000000000000000000000000000000000000000000000000000000001");
      assert.equal(request[1], server1.public);
      assert.equal(request[2], false);
    })
    .then(() => serviceContract.getDocumentKeyShadowRetrievalRequest(1))
    .then(request => {
      assert.equal(request[0], "0x0000000000000000000000000000000000000000000000000000000000000002");
      assert.equal(request[1], requesterPublic1);
      assert.equal(request[2], true);
    })
  );

  it("should return if response is required", () => initializeKeyServerSet(setContract)
    // initially responses from all key servers are required
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server1.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server2.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    // after server1 has responded with common data, we do not wait its response (in common retireval stage)
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server1.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, false))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server2.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    // now let's complete common retrieval step && check that responses from both servers are required again
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server3.address }))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server1.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server2.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    // now server1 responds with persona; data and still we're waiting for personal response (since it one-time only and if some nodes fail
    // to respond we need to restart)
    .then(() => serviceContract.documentKeyPersonalRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, participants1, decryptedSecret1, shadow1, { from: server1.address }))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server1.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server2.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
  );

  it("should reset existing responses when servers set changes", () => initializeKeyServerSet(setContract)
    // request is created and single key server responds
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server1.address))
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
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server1.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    // now we're receiving response from KS2 && KS4 and still response from KS1 is required
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server2.address }))
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server4.address }))
    .then(() => serviceContract.isDocumentKeyShadowRetrievalResponseRequired("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, server1.address))
    .then(isResponseRequired => assert.equal(isResponseRequired, true))
    // now we're receiving response from KS1 and key generated event is fired
    .then(() => serviceContract.documentKeyCommonRetrieved("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, commonPoint1, 1, { from: server1.address }))
      .then(receipt => assert.web3Events(receipt, [{
        event: 'DocumentKeyCommonRetrieved',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requester: requesterAddress1,
          commonPoint: commonPoint1,
          threshold: 1
        }
      }, {
        event: 'DocumentKeyPersonalRetrievalRequested',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          requesterPublic: requesterPublic1,
        }
      }], 'Events are emitted'
    ))
  );

  // Administrative API tests

  it("should be able to change owner by current owner", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.setOwner(nonKeyServer))
    .then(() => serviceContract.setDocumentKeyShadowRetrievalFee(10, { from: nonKeyServer }))
    .then(() => serviceContract.setDocumentKeyShadowRetrievalFee(20))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should not be able to change owner by non-current owner", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.setOwner(nonKeyServer, { from: server2.address }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should be able to change fee", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.setDocumentKeyShadowRetrievalFee(10))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(10, 'finney') }))
  );

  it("should not be able to change fee by a non-owner", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.setDocumentKeyShadowRetrievalFee(10, { from: nonKeyServer }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should be able to change requests limit", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.setMaxDocumentKeyShadowRetrievalRequests(5))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000003",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000004",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000005",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
  );

  it("should not be able to change requests limit by a non-owner", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.setMaxDocumentKeyShadowRetrievalRequests(5, { from: nonKeyServer }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );

  it("should be able to delete request", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.documentKeyShadowRetrievalRequestsCount())
    .then(c => assert.equal(c, 2))
    .then(() => serviceContract.deleteDocumentKeyShadowRetrievalRequest("0x0000000000000000000000000000000000000000000000000000000000000002",
      requesterAddress1))
    .then(receipt => assert.web3Event(receipt, {
        event: 'DocumentKeyShadowRetrievalError',
        args: {
          serverKeyId: "0x0000000000000000000000000000000000000000000000000000000000000002",
          requester: requesterAddress1
        }
    }))
    .then(() => serviceContract.documentKeyShadowRetrievalRequestsCount())
    .then(c => assert.equal(c, 1))
  );

  it("should not be able to delete request by a non-owner", () => initializeKeyServerSet(setContract)
    .then(() => serviceContract.retrieveDocumentKeyShadow("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterPublic1, { from: requesterAddress1, value: web3.toWei(200, 'finney') }))
    .then(() => serviceContract.deleteDocumentKeyShadowRetrievalRequest("0x0000000000000000000000000000000000000000000000000000000000000001",
      requesterAddress1, { from: nonKeyServer }))
    .then(() => assert(false, "supposed to fail"), () => {})
  );
  });
});
