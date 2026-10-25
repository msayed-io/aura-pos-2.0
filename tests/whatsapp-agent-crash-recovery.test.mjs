import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalStore } = require('../local-services/store.cjs');
const previousNodeEnv = process.env.NODE_ENV;
const previousTokenHashes = process.env.AURA_INSTALL_TOKEN_HASHES;
process.env.NODE_ENV = 'test';
const installToken = randomBytes(32).toString('hex');
process.env.AURA_INSTALL_TOKEN_HASHES = createHash('sha256').update(installToken, 'utf8').digest('hex');
const { createGateway } = await import(`../mini-services/ai-gateway/server.mjs?crash-recovery=${randomBytes(6).toString('hex')}`);
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;
if (previousTokenHashes === undefined) delete process.env.AURA_INSTALL_TOKEN_HASHES;
else process.env.AURA_INSTALL_TOKEN_HASHES = previousTokenHashes;

const fixture = path.join(import.meta.dirname, 'fixtures', 'whatsapp-agent-worker.cjs');
function waitForOutput(child, expected, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${expected}`)), timeoutMs);
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes(expected)) finish(null, output);
    };
    const onExit = (code, signal) => finish(new Error(`Worker exited before ${expected}: ${code ?? signal}`));
    const finish = (error, result) => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve(result);
    };
    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}
function waitForExit(child, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Worker exit timeout')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve([code, signal]);
    });
  });
}
function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

test('SIGKILL during Gateway processing recovers the same durable message once after restart', async t => {
  const previousTestNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let providerCalls = 0;
  let firstProviderReached;
  const firstGatewayCall = new Promise(resolve => { firstProviderReached = resolve; });
  const gateway = createGateway({ provider: async () => {
    providerCalls += 1;
    if (providerCalls === 1) {
      firstProviderReached();
      return new Promise(() => {});
    }
    return { reply: 'أهلاً، كيف أساعدك؟', intent: 'chat', items: [] };
  } });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const gatewayAddress = gateway.address();
  assert.ok(gatewayAddress && typeof gatewayAddress === 'object');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-crash-process-'));
  let store;
  let firstWorker;
  let recoveryWorker;
  t.after(async () => {
    for (const child of [firstWorker, recoveryWorker]) {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    if (store) await store.checkpointAndClose();
    gateway.closeAllConnections?.();
    await new Promise(resolve => gateway.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousTestNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousTestNodeEnv;
  });

  store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  await store.dispatch('whatsapp.agent.settings.set', { enabled: true, consentVersion: '1' });
  await store.checkpointAndClose();
  store = null;

  const childEnv = {
    ...process.env,
    AURA_TEST_DATA_DIR: dataDir,
    AURA_TEST_GATEWAY_URL: `http://127.0.0.1:${gatewayAddress.port}`,
    AURA_TEST_INSTALL_TOKEN: installToken,
  };
  firstWorker = spawn(process.execPath, [fixture], { env: { ...childEnv, AURA_TEST_RECOVER: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const processingOutput = waitForOutput(firstWorker, 'PROCESSING');
  await processingOutput;
  await withTimeout(firstGatewayCall, 15_000, 'Initial worker never reached Gateway');
  firstWorker.kill('SIGKILL');
  const [firstExitCode, firstSignal] = await waitForExit(firstWorker);
  assert.equal(firstExitCode, null);
  assert.equal(firstSignal, 'SIGKILL');

  store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  const recoveredRow = await store.prisma.localWhatsAppMessage.findUnique({ where: { accountId_conversationHash_messageId: { accountId: 'primary', conversationHash: 'e'.repeat(64), messageId: 'crash-during-gateway-1' } } });
  assert.equal(recoveredRow.status, 'processing');
  assert.equal(recoveredRow.replyId, null);
  await store.prisma.localWhatsAppMessage.update({ where: { id: recoveredRow.id }, data: { updatedAt: BigInt(Date.now() - 300001) } });
  const recoverable = await store.dispatch('whatsapp.message.recoverable', {});
  assert.equal(recoverable.length, 1);
  await store.checkpointAndClose();
  store = null;

  recoveryWorker = spawn(process.execPath, [fixture], { env: { ...childEnv, AURA_TEST_RECOVER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let recoveryOutput = '';
  recoveryWorker.stdout.on('data', chunk => { recoveryOutput += chunk.toString(); });
  recoveryWorker.stderr.on('data', chunk => { recoveryOutput += chunk.toString(); });
  const [recoveryExitCode, recoverySignal] = await waitForExit(recoveryWorker);
  assert.equal(recoveryExitCode, 0, recoveryOutput);
  assert.equal(recoverySignal, null);
  assert.match(recoveryOutput, /DONE \{"ignored":false,"hasReply":true,"hasOrder":false\}/);
  assert.equal(providerCalls, 2);

  store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  assert.equal(await store.prisma.localWhatsAppMessage.count({ where: { messageId: 'crash-during-gateway-1' } }), 1);
  const finalMessage = await store.prisma.localWhatsAppMessage.findUnique({ where: { accountId_conversationHash_messageId: { accountId: 'primary', conversationHash: 'e'.repeat(64), messageId: 'crash-during-gateway-1' } } });
  assert.equal(finalMessage.attempts, 2);
  assert.equal(finalMessage.replyStatus, 'pending');
  assert.equal((await store.dispatch('whatsapp.message.reply.pending', {})).length, 1);
  assert.equal(await store.prisma.localWhatsAppDraft.count(), 0);
  assert.equal(await store.prisma.localOrder.count(), 0);
});
