import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGeminiKeyOperations } = require('../electron/gemini-key-operations.cjs');
const API_KEY = 'AIzaSySyntheticGeminiKey_0123456789';

function setup({ agentEnabled = false, sync = async () => {}, onSyncDeferred = () => {} } = {}) {
  const calls = [];
  let stored = null;
  const store = {
    save: value => { calls.push(['save', value]); stored = value; return { configured: true }; },
    clear: () => { calls.push(['clear']); stored = null; return { configured: false }; },
  };
  const operations = createGeminiKeyOperations({
    store,
    getAgentStatus: async () => { calls.push(['status']); return { agentEnabled }; },
    sync: async () => { calls.push(['sync']); return sync(); },
    onSyncDeferred,
  });
  return { operations, calls, getStored: () => stored };
}

test('Gemini key save checks agent state, stores locally, and reports a deferred service sync as local success', async () => {
  const syncError = new Error('INTERNAL_WHATSAPP_TIMEOUT');
  const deferred = [];
  const { operations, calls, getStored } = setup({
    sync: async () => { throw syncError; },
    onSyncDeferred: (operation, error) => deferred.push([operation, error.message]),
  });
  const result = await operations.save(` ${API_KEY} `);
  assert.deepEqual(calls, [['status'], ['save', API_KEY], ['sync']]);
  assert.equal(getStored(), API_KEY);
  assert.deepEqual(result, { configured: true, synced: false });
  assert.deepEqual(deferred, [['save', syncError.message]]);
});

test('Gemini key save refuses to change the secret while the agent is enabled', async () => {
  const { operations, calls, getStored } = setup({ agentEnabled: true });
  await assert.rejects(operations.save(API_KEY), { message: 'STOP_AGENT_BEFORE_GEMINI_KEY_CHANGE' });
  assert.deepEqual(calls, [['status']]);
  assert.equal(getStored(), null);
});

test('Gemini key save does not write when checking local agent status fails', async () => {
  const calls = [];
  const operations = createGeminiKeyOperations({
    store: { save: value => { calls.push(['save', value]); return { configured: true }; }, clear: () => ({ configured: false }) },
    getAgentStatus: async () => { calls.push(['status']); throw new Error('LOCAL_SERVER_TIMEOUT'); },
    sync: async () => { calls.push(['sync']); },
  });
  await assert.rejects(operations.save(API_KEY), { message: 'LOCAL_SERVER_TIMEOUT' });
  assert.deepEqual(calls, [['status']]);
});

test('clearing a local Gemini key remains successful if removing it from the service must be retried', async () => {
  const { operations, calls, getStored } = setup({ sync: async () => { throw new Error('LOCAL_SERVER_TIMEOUT'); } });
  const result = await operations.clear();
  assert.deepEqual(calls, [['status'], ['clear'], ['sync']]);
  assert.equal(getStored(), null);
  assert.deepEqual(result, { configured: false, synced: false });
});
