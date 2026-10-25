/* eslint-disable @typescript-eslint/no-require-imports */
const { createLocalStore } = require('../../local-services/store.cjs');

const store = createLocalStore({ dataDir: process.argv[2], seed: false, autoBackup: false });
const send = (message) => { if (process.connected) process.send(message); };

async function settings() {
  const result = {};
  for (const name of ['journal_mode', 'synchronous', 'foreign_keys', 'busy_timeout', 'quick_check']) {
    result[name] = await store.prisma.$queryRawUnsafe(`PRAGMA ${name}`);
  }
  return result;
}

process.on('message', async (message) => {
  if (!message || !Number.isInteger(message.id)) return;
  try {
    let data;
    if (message.operation === 'dispatch') data = await store.dispatch(message.action, message.payload);
    else if (message.operation === 'settings') data = await settings();
    else if (message.operation === 'close') {
      await store.checkpointAndClose();
      send({ id: message.id, ok: true });
      process.disconnect();
      return;
    } else throw new Error('Unknown test operation');
    send({ id: message.id, ok: true, data });
  } catch (error) {
    send({ id: message.id, ok: false, error: { code: error.code || 'TEST_CHILD_ERROR', message: error.message } });
  }
});

store.initialize().then(() => send({ ready: true })).catch((error) => {
  send({ fatal: true, error: { code: error.code || 'INITIALIZATION_FAILED', message: error.message } });
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
