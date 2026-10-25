'use strict';

function createGeminiKeyOperations({ store, getAgentStatus, sync, onSyncDeferred = () => {} }) {
  if (!store || typeof store.save !== 'function' || typeof store.clear !== 'function'
    || typeof getAgentStatus !== 'function' || typeof sync !== 'function' || typeof onSyncDeferred !== 'function') {
    throw new TypeError('Invalid Gemini key operation dependencies');
  }

  async function assertAgentStopped() {
    const state = await getAgentStatus();
    if (state?.agentEnabled === true) throw new Error('STOP_AGENT_BEFORE_GEMINI_KEY_CHANGE');
  }

  async function synchronize(operation, result) {
    try {
      await sync();
      return { ...result, synced: true };
    } catch (error) {
      try { onSyncDeferred(operation, error); } catch { /* Diagnostics must never undo a completed local write. */ }
      return { ...result, synced: false };
    }
  }

  async function save(apiKey) {
    await assertAgentStopped();
    const value = typeof apiKey === 'string' ? apiKey.trim() : apiKey;
    const saved = store.save(value);
    return synchronize('save', saved);
  }

  async function clear() {
    await assertAgentStopped();
    const cleared = store.clear();
    return synchronize('clear', cleared);
  }

  return { save, clear };
}

module.exports = { createGeminiKeyOperations };
