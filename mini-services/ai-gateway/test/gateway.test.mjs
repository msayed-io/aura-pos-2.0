import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';

const token = 'test-install-secret-never-log';
process.env.AURA_INSTALL_TOKEN_HASHES = createHash('sha256').update(token).digest('hex');
process.env.RATE_LIMIT_PER_MINUTE = '10';
process.env.MAX_BODY_BYTES = '2048';
process.env.GEMINI_API_KEY = 'local-test-key';
process.env.GEMINI_MODEL = 'gemini-3.8-flash';
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); }
const valid = () => ({ conversationHash: 'a'.repeat(64), messages: [{ role: 'customer', text: 'مرحباً' }], menu: [{ id: 'tea', name: 'شاي', price: 3, available: true }], draft: { id: null, version: 0, status: 'collecting', items: [] }, orderDetails: { deliveryMethod: 'delivery', paymentMethod: 'cash' } });
const answer = () => ({ reply: 'أهلاً', intent: 'chat', items: [] });
async function withGateway(t, provider) {
  const { createGateway } = await import(`../server.mjs?test-server=${Math.random()}`);
  const server = createGateway({ provider });
  const url = await listen(server);
  t.after(() => close(server));
  return url;
}
async function post(url, { body = valid(), bearer = token } = {}) {
  return fetch(`${url}/v1/agent/respond`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

test('health and exact route', async (t) => {
  const url = await withGateway(t, async () => answer());
  assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok' });
  assert.equal((await fetch(`${url}/other`)).status, 404);
});
test('auth required and input schema is strict', async (t) => {
  const url = await withGateway(t, async () => answer());
  assert.equal((await post(url, { bearer: 'bad' })).status, 401);
  const extra = valid(); extra.phone = '+15551234567';
  assert.equal((await post(url, { body: extra })).status, 400);
  const jid = valid(); jid.messages[0].text = 'contact 12345678901@s.whatsapp.net';
  assert.equal((await post(url, { body: jid })).status, 400);
  const email = valid(); email.messages[0].text = 'contact user@example.com';
  assert.equal((await post(url, { body: email })).status, 400);
  const arabicPhone = valid(); arabicPhone.messages[0].text = 'رقمي ٢٠١٢٣٤٥٦٧٨٩٠';
  assert.equal((await post(url, { body: arabicPhone })).status, 400);
  const addressPhone = valid(); addressPhone.orderDetails.deliveryAddress = 'عنوان ٢٠١٢٣٤٥٦٧٨٩٠';
  assert.equal((await post(url, { body: addressPhone })).status, 400);
  const addressEmail = valid(); addressEmail.orderDetails.deliveryAddress = 'contact user@example.com';
  assert.equal((await post(url, { body: addressEmail })).status, 400);
  const badPrice = valid(); badPrice.menu[0].price = -1;
  assert.equal((await post(url, { body: badPrice })).status, 400);
  const badDetails = valid(); badDetails.orderDetails.phone = '12345678901';
  assert.equal((await post(url, { body: badDetails })).status, 400);
  const storedName = valid(); storedName.orderDetails.customerName = 'اسم عميل محفوظ';
  assert.equal((await post(url, { body: storedName })).status, 400);
  const storedAddress = valid(); storedAddress.orderDetails.deliveryAddress = 'عنوان محفوظ';
  assert.equal((await post(url, { body: storedAddress })).status, 400);
});
test('rejects invalid provider output and provider failures safely', async (t) => {
  const url = await withGateway(t, async () => ({ ...answer(), orderDetails: { price: 3 } }));
  const response = await post(url);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'invalid_provider_response' });
});
test('byte cap and per-install rate limit', async (t) => {
  const sizeUrl = await withGateway(t, async () => answer());
  const huge = JSON.stringify({ ...valid(), messages: [{ role: 'customer', text: 'x'.repeat(2500) }] });
  assert.equal((await post(sizeUrl, { body: huge })).status, 413);
  const url = await withGateway(t, async () => answer());
  for (let i = 0; i < 10; i += 1) assert.equal((await post(url)).status, 200);
  assert.equal((await post(url)).status, 429);
});
test('Gemini REST routing uses configured model, server key, fixed system instruction and constrained JSON output', async (t) => {
  let seen;
  const provider = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    seen = { url: req.url, key: req.headers['x-goog-api-key'], body: JSON.parse(Buffer.concat(chunks).toString()) };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer()) }] } }] }));
  });
  const providerBase = await listen(provider);
  t.after(() => close(provider));
  process.env.GEMINI_BASE_URL = providerBase;
  const { createGateway: createConfiguredGateway } = await import(`../server.mjs?provider-harness=${Date.now()}`);
  const app = createConfiguredGateway();
  const url = await listen(app);
  t.after(() => close(app));
  const response = await post(url);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), answer());
  assert.equal(seen.url, '/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(seen.key, 'local-test-key');
  assert.match(seen.body.systemInstruction.parts[0].text, /لا تنشئ طلبات/);
  assert.equal(seen.body.generationConfig.responseMimeType, 'application/json');
});
