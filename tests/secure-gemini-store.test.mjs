import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSecureGeminiStore, validGeminiApiKey } = require('../electron/secure-gemini-store.cjs');
const API_KEY = 'AIzaSySyntheticTestKey_0123456789';

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-gemini-secret-'));
  const filePath = path.join(directory, 'gemini-api-key.enc');
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`test-encrypted:${value}`, 'utf8'),
    decryptString: value => {
      const decoded = value.toString('utf8');
      if (!decoded.startsWith('test-encrypted:')) throw new Error('invalid ciphertext');
      return decoded.slice('test-encrypted:'.length);
    },
  };
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, filePath, safeStorage, store: createSecureGeminiStore({ safeStorage, filePath }) };
}

test('Gemini key is encrypted at rest and never exposed by the storage status API', t => {
  const { filePath, store } = setup(t);
  assert.deepEqual(store.save(API_KEY), { configured: true });
  const encryptedFile = fs.readFileSync(filePath, 'utf8');
  assert.doesNotMatch(encryptedFile, new RegExp(API_KEY));
  assert.equal(store.load(), API_KEY);
  assert.equal(store.isConfigured(), true);
});

test('Gemini key can be replaced and removed', t => {
  const { filePath, store } = setup(t);
  store.save(API_KEY);
  const replacement = 'AIzaSyReplacementTestKey_987654321';
  store.save(replacement);
  assert.equal(store.load(), replacement);
  assert.deepEqual(store.clear(), { configured: false });
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(store.load(), null);
});

test('invalid keys and unavailable OS encryption are rejected without persisting a value', t => {
  const { filePath, safeStorage, store } = setup(t);
  for (const value of ['', 'short', 'contains spaces 123456', 'has\nnewline123456789']) {
    assert.equal(validGeminiApiKey(value), false);
    assert.throws(() => store.save(value), { message: 'INVALID_GEMINI_API_KEY' });
  }
  const unavailable = createSecureGeminiStore({ safeStorage: { ...safeStorage, isEncryptionAvailable: () => false }, filePath });
  assert.throws(() => unavailable.save(API_KEY), { message: 'LOCAL_ENCRYPTION_UNAVAILABLE' });
  assert.equal(fs.existsSync(filePath), false);
});
