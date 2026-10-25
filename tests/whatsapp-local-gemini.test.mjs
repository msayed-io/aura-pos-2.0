import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const agent = require('../local-services/whatsapp-agent.cjs');
const TEST_KEY = 'AIzaSySyntheticGeminiTestKey_0123456789';
const AUTH_TEST_KEY = `AQ.${'B'.repeat(47)}+/=`;
const answer = { reply: 'أهلاً، كيف أساعدك؟', intent: 'chat', items: [] };
const providerResponse = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const payload = {
  conversationHash: 'a'.repeat(64),
  messages: [{ role: 'customer', text: 'مرحباً' }],
  menu: [],
  draft: { id: null, version: 0, status: 'collecting', items: [] },
  personality: { botName: 'سارة', businessName: 'مخبز تجريبي', tone: 'professional', replyLength: 'short', instructions: 'استخدمي تحية قصيرة.', useEmoji: false },
};

test('local Gemini request uses stable Flash model and key only in the HTTPS header', async () => {
  let request;
  const result = await agent.requestLocalGemini(payload, {
    apiKey: TEST_KEY,
    fetchImpl: async (url, options) => { request = { url, options, body: JSON.parse(options.body) }; return providerResponse(); },
  });
  assert.deepEqual(result, answer);
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(request.options.headers['x-goog-api-key'], TEST_KEY);
  assert.equal(request.options.redirect, 'error');
  assert.doesNotMatch(request.url, new RegExp(TEST_KEY));
  assert.doesNotMatch(request.options.body, new RegExp(TEST_KEY));
  assert.match(request.body.systemInstruction.parts[0].text, /اسم المساعد: سارة/);
  assert.match(request.body.systemInstruction.parts[0].text, /لا تنشئ إجمالياً/);
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
});

test('local Gemini accepts a synthetic AI Studio authorization key for save and connection-test paths', async () => {
  agent.configureLocalGeminiApiKey('');
  assert.deepEqual(agent.configureLocalGeminiApiKey(AUTH_TEST_KEY), { configured: true });
  let requestCount = 0;
  try {
    const result = await agent.testLocalGemini(AUTH_TEST_KEY, {
      fetchImpl: async (url, options) => {
        requestCount += 1;
        assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
        assert.equal(options.headers['x-goog-api-key'], AUTH_TEST_KEY);
        assert.equal(url.includes(AUTH_TEST_KEY), false);
        assert.equal(options.body.includes(AUTH_TEST_KEY), false);
        return providerResponse();
      },
    });
    assert.deepEqual(result, { ok: true, model: 'gemini-3.8-flash' });
    assert.equal(requestCount, 1);
  } finally {
    agent.configureLocalGeminiApiKey('');
  }
});

test('local Gemini API key stays in memory only and provider errors never disclose it', async () => {
  assert.deepEqual(agent.configureLocalGeminiApiKey(TEST_KEY), { configured: true });
  assert.equal(agent.hasLocalGeminiApiKey(), true);
  await assert.rejects(agent.requestLocalGemini(payload, { fetchImpl: async () => { throw new Error(TEST_KEY); } }), error => {
    assert.equal(error.code, 'LOCAL_GEMINI_UNAVAILABLE');
    assert.doesNotMatch(error.message, new RegExp(TEST_KEY));
    return true;
  });
  assert.deepEqual(agent.configureLocalGeminiApiKey(''), { configured: false });
  assert.equal(agent.hasLocalGeminiApiKey(), false);
  assert.throws(() => agent.configureLocalGeminiApiKey('short'), error => error.code === 'INVALID_GEMINI_API_KEY');
});

test('an unsaved synthetic Gemini key can be tested without persisting it', async () => {
  agent.configureLocalGeminiApiKey('');
  const result = await agent.testLocalGemini(TEST_KEY, { fetchImpl: async () => providerResponse() });
  assert.deepEqual(result, { ok: true, model: 'gemini-3.8-flash' });
  assert.equal(agent.hasLocalGeminiApiKey(), false);
});

test('Gemini test classifies invalid key, permission, quota, unavailable model and network errors', async () => {
  const cases = [
    [new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 }), 'LOCAL_GEMINI_KEY_REJECTED'],
    [new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'API disabled' } }), { status: 403 }), 'LOCAL_GEMINI_ACCESS_DENIED'],
    [new Response('{}', { status: 429 }), 'LOCAL_GEMINI_RATE_LIMITED'],
    [new Response('{}', { status: 404 }), 'LOCAL_GEMINI_MODEL_UNAVAILABLE'],
  ];
  for (const [response, expectedCode] of cases) {
    const result = await agent.testLocalGemini(TEST_KEY, { fetchImpl: async () => response });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, expectedCode);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(TEST_KEY));
  }
  const unavailable = await agent.testLocalGemini(TEST_KEY, { fetchImpl: async () => { throw new Error(TEST_KEY); } });
  assert.equal(unavailable.errorCode, 'LOCAL_GEMINI_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(unavailable), new RegExp(TEST_KEY));
  assert.equal((await agent.testLocalGemini(undefined)).errorCode, 'LOCAL_GEMINI_NOT_CONFIGURED');
});

test('Gemini connection diagnostics distinguish DNS, TLS, timeout and blocked network failures without leaking error text', async () => {
  const timeout = new Error('synthetic private timeout detail');
  timeout.name = 'TimeoutError';
  const failures = [
    [Object.assign(new Error('synthetic detail'), { code: 'ENOTFOUND' }), 'LOCAL_GEMINI_DNS_FAILED'],
    [Object.assign(new Error('synthetic detail'), { cause: Object.assign(new Error('nested'), { code: 'CERT_HAS_EXPIRED' }) }), 'LOCAL_GEMINI_TLS_FAILED'],
    [timeout, 'LOCAL_GEMINI_TIMEOUT'],
    [Object.assign(new Error('synthetic detail'), { cause: Object.assign(new Error('nested'), { code: 'ECONNRESET' }) }), 'LOCAL_GEMINI_NETWORK_BLOCKED'],
  ];
  for (const [failure, expectedCode] of failures) {
    const result = await agent.testLocalGemini(TEST_KEY, { fetchImpl: async () => { throw failure; } });
    assert.deepEqual(result, { ok: false, model: 'gemini-3.8-flash', errorCode: expectedCode });
    assert.doesNotMatch(JSON.stringify(result), /synthetic private|synthetic detail|nested|AIza/);
  }
});
