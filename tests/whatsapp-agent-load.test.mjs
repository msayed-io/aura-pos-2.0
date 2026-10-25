import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalStore } = require('../local-services/store.cjs');
const { processWhatsAppMessage } = require('../local-services/whatsapp-agent.cjs');
const token = randomBytes(32).toString('hex');
const oldHashes = process.env.AURA_INSTALL_TOKEN_HASHES;
const oldRateLimit = process.env.RATE_LIMIT_PER_MINUTE;
process.env.AURA_INSTALL_TOKEN_HASHES = createHash('sha256').update(token).digest('hex');
process.env.RATE_LIMIT_PER_MINUTE = '60';
const { createGateway } = await import(`../mini-services/ai-gateway/server.mjs?load=${Date.now()}`);
if (oldHashes === undefined) delete process.env.AURA_INSTALL_TOKEN_HASHES;
else process.env.AURA_INSTALL_TOKEN_HASHES = oldHashes;
if (oldRateLimit === undefined) delete process.env.RATE_LIMIT_PER_MINUTE;
else process.env.RATE_LIMIT_PER_MINUTE = oldRateLimit;

test('20 concurrent conversations complete through local HTTP Gateway and real SQLite', async t => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const server = createGateway({ provider: async () => ({ reply: 'مرحباً، كيف أساعدك؟', intent: 'chat', items: [] }) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-load-'));
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  t.after(async () => {
    await store.checkpointAndClose();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  });
  await store.dispatch('whatsapp.agent.settings.set', { enabled: true, consentVersion: '2' });
  const gatewayUrl = `http://127.0.0.1:${address.port}`;
  const { createGatewayClient } = require('../local-services/whatsapp-agent.cjs');
  const gatewayRequest = createGatewayClient({ gatewayUrl, installToken: token, timeoutMs: 5000 });
  const histogram = monitorEventLoopDelay({ resolution: 1 });
  histogram.enable();
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => processWhatsAppMessage(store, {
    accountId: 'primary',
    conversationHash: index.toString(16).padStart(64, '0'),
    messageId: `load-${index}`,
    text: `استفسار تجريبي ${index}`,
    encryptedReplyTarget: 'opaque-encrypted-jid-reference',
    customerPhone: `2010000000${String(index).padStart(2, '0')}`,
  }, { gatewayRequest })));
  const elapsedMs = performance.now() - started;
  histogram.disable();
  const eventLoopSamples = histogram.count;
  const p99EventLoopMs = histogram.percentile(99) / 1e6;
  console.log(`[agent-load] conversations=20 elapsed_ms=${elapsedMs.toFixed(1)} event_loop_samples=${eventLoopSamples} event_loop_p99_ms=${p99EventLoopMs.toFixed(1)} platform=${process.platform}`);
  assert.equal(results.length, 20);
  assert.ok(results.every(result => result.reply?.replyText === 'مرحباً، كيف أساعدك؟'));
  assert.equal(await store.prisma.localWhatsAppMessage.count(), 20);
  assert.equal((await store.dispatch('whatsapp.message.reply.pending')).length, 20);
  assert.equal(await store.prisma.localOrder.count(), 0);
  assert.ok(eventLoopSamples >= 100, `event-loop p99 needs at least 100 samples; received ${eventLoopSamples}`);
  assert.ok(p99EventLoopMs < 100, `local Gateway/store event-loop p99 was ${p99EventLoopMs.toFixed(1)} ms`);
});
