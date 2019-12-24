import t from 'tap';
import crypto from 'crypto';
import sinon from 'sinon';
import createEnvelopeEncrypter, { awsKms } from './';

const plaintextKey = crypto
  .createHash('sha256')
  .update('password')
  .digest();

const keyService = {
  getDataKey: () =>
    Promise.resolve({
      encryptedKey: 'foo',
      plaintextKey,
    }),
  decryptDataKey: key => Promise.resolve(plaintextKey),
};

const encrypter = createEnvelopeEncrypter(keyService);

t.test('envelope encrypter', async t => {
  const result = await encrypter.encrypt('secret message');
  const { key } = result;
  t.equal(key, 'foo', 'encryptedKey is from keyService.getDataKey');
  const secretMessage = await encrypter.decrypt(result);
  t.equal(
    secretMessage,
    'secret message',
    'given ciphertext, key and salt decrypt returns plaintext message',
  );
});

const config = { foo: 'bar' };
const keyId = 'keyId';
const ciphertextBlob = Buffer.from('thing');
const encryptedKey = ciphertextBlob.toString('base64');

const Client = sinon.stub();
const generateDataKeyStub = sinon.stub().returns({
  promise: () => ({
    CiphertextBlob: ciphertextBlob,
    Plaintext: 'something',
  }),
});
const decryptStub = sinon.stub().returns({
  promise: () => ({
    Plaintext: 'something',
  }),
});

Client.prototype.generateDataKey = generateDataKeyStub;
Client.prototype.decrypt = decryptStub;

t.test('awsKms', async t => {
  const keyService = awsKms(keyId, config, Client);
  t.test('instantiates Client', async t => {
    sinon.assert.calledWithNew(Client, config);
  });
  t.test('getDataKey calls generateDataKey with keyId', async t => {
    const result = await keyService.getDataKey();
    generateDataKeyStub.calledWithExactly({
      KeyId: keyId,
      KeySpec: 'AES_256',
    });
    t.same(
      result,
      {
        encryptedKey,
        plaintextKey: 'something',
      },
      'and returns encrypted and plaintext keys',
    );
  });
  t.test('decryptDataKey calls decrypt with key', async t => {
    const result = await keyService.decryptDataKey(encryptedKey);
    decryptStub.calledWithExactly({
      CiphertextBlob: ciphertextBlob,
    });
    t.equal(result, 'something', 'and returns plaintext key');
  });
});
