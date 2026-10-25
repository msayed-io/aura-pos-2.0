import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGatewayClient } = require('../local-services/whatsapp-agent.cjs');
const payload = { conversationHash: 'a'.repeat(64), messages: [{ role: 'customer', text: 'hello' }], menu: [], draft: { id: null, version: 0, status: 'collecting', items: [] } };
const validAnswer = { reply: 'Hello', intent: 'chat', items: [] };

function response(status, body) {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

test('Gateway retries network/5xx failures twice with bounded backoff', async () => {
  let attempts = 0;
  const delays = [];
  const client = createGatewayClient({
    gatewayUrl: 'https://gateway.example',
    installToken: 'x'.repeat(64),
    fetchImpl: async () => {
      attempts += 1;
      return attempts < 3 ? response(503, '{"error":"unavailable"}') : response(200, JSON.stringify(validAnswer));
    },
    sleep: async milliseconds => { delays.push(milliseconds); },
  });
  assert.deepEqual(await client(payload), validAnswer);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [350, 900]);
});

test('Gateway rejects malformed responses and client errors without retry', async () => {
  for (const [httpResponse, expectedCode] of [[response(200, '{broken'), 'GATEWAY_INVALID_RESPONSE'], [response(400, '{"error":"invalid_request"}'), 'GATEWAY_REJECTED']]) {
    let attempts = 0;
    const client = createGatewayClient({
      gatewayUrl: 'https://gateway.example',
      installToken: 'x'.repeat(64),
      fetchImpl: async () => { attempts += 1; return httpResponse; },
      sleep: async () => {},
    });
    await assert.rejects(client(payload), error => error.code === expectedCode);
    assert.equal(attempts, 1);
  }
});

test('Gateway client rejects a model reply containing an email address', async () => {
  const client = createGatewayClient({
    gatewayUrl: 'https://gateway.example',
    installToken: 'x'.repeat(64),
    fetchImpl: async () => response(200, JSON.stringify({ ...validAnswer, reply: 'راسلنا user@example.com' })),
  });
  await assert.rejects(client(payload), error => error.code === 'GATEWAY_INVALID_RESPONSE');
});

test('Gateway timeout aborts slow requests and stops after two retries', { timeout: 10000 }, async () => {
  let attempts = 0;
  let abortEvents = 0;
  const client = createGatewayClient({
    gatewayUrl: 'https://gateway.example',
    installToken: 'x'.repeat(64),
    timeoutMs: 50,
    fetchImpl: async (_url, options) => {
      attempts += 1;
      return await new Promise((resolve, reject) => {
        let watchdog;
        const onAbort = () => {
          abortEvents += 1;
          clearTimeout(watchdog);
          reject(new Error('timed out'));
        };
        watchdog = setTimeout(() => {
          options.signal.removeEventListener('abort', onAbort);
          reject(new Error('AbortSignal.timeout did not fire'));
        }, 1000);
        options.signal.addEventListener('abort', onAbort, { once: true });
      });
    },
    sleep: async () => {},
  });
  await assert.rejects(client(payload), error => error.code === 'GATEWAY_UNAVAILABLE');
  assert.equal(attempts, 3);
  assert.equal(abortEvents, 3);
});
