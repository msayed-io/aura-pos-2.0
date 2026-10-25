/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process utility. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const KEY_PATTERN = /^(?:[A-Za-z0-9_-]{16,256}|AQ\.[!-~]{13,253})$/;

function validGeminiApiKey(value) {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

function createSecureGeminiStore({ safeStorage, filePath, fileSystem = fs }) {
  if (!safeStorage || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw new TypeError('Electron safeStorage is required');
  }
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new TypeError('An absolute secret file path is required');

  function assertEncryptionAvailable() {
    if (typeof safeStorage.isEncryptionAvailable !== 'function' || !safeStorage.isEncryptionAvailable()) {
      throw new Error('LOCAL_ENCRYPTION_UNAVAILABLE');
    }
  }

  function save(value) {
    if (!validGeminiApiKey(value)) throw new Error('INVALID_GEMINI_API_KEY');
    assertEncryptionAvailable();
    const directory = path.dirname(filePath);
    fileSystem.mkdirSync(directory, { recursive: true });
    const encrypted = safeStorage.encryptString(value);
    if (!Buffer.isBuffer(encrypted) || encrypted.length < 16 || encrypted.length > 4096) {
      throw new Error('GEMINI_KEY_ENCRYPTION_FAILED');
    }
    const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      fileSystem.writeFileSync(temporaryPath, encrypted.toString('base64'), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fileSystem.renameSync(temporaryPath, filePath);
    } catch (error) {
      try { fileSystem.rmSync(temporaryPath, { force: true }); } catch { /* best effort cleanup */ }
      throw new Error(error?.code === 'EACCES' ? 'GEMINI_KEY_STORAGE_FAILED' : 'GEMINI_KEY_STORAGE_FAILED');
    }
    return { configured: true };
  }

  function load() {
    assertEncryptionAvailable();
    let encoded;
    try {
      encoded = fileSystem.readFileSync(filePath, 'utf8').trim();
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new Error('GEMINI_KEY_STORAGE_FAILED');
    }
    if (!encoded || encoded.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new Error('GEMINI_KEY_STORAGE_INVALID');
    }
    let value;
    try {
      value = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    } catch {
      throw new Error('GEMINI_KEY_DECRYPT_FAILED');
    }
    if (!validGeminiApiKey(value)) throw new Error('GEMINI_KEY_STORAGE_INVALID');
    return value;
  }

  function clear() {
    try { fileSystem.rmSync(filePath, { force: true }); }
    catch { throw new Error('GEMINI_KEY_STORAGE_FAILED'); }
    return { configured: false };
  }

  function isConfigured() {
    return load() !== null;
  }

  return { save, load, clear, isConfigured };
}

module.exports = { createSecureGeminiStore, validGeminiApiKey };
