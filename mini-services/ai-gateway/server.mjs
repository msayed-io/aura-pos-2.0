import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const SYSTEM_PROMPT = `أنت مساعد طلبات لمتجر. أجب باللغة المناسبة لرسائل العميل، باختصار وتهذيب. استخدم المنيو والسياق المعطى فقط ولا تخترع أصنافاً. قد يحتوي المنيو على أسعار محلية للاستدلال على الأصناف المناسبة، لكن لا تذكر أي سعر أو مبلغ في reply ولا تنشئ إجمالياً؛ التطبيق يحسب الأسعار والإجمالي محلياً ويتجاهل أي سعر صادر عنك. لا تطلب أو تكشف أرقام هواتف أو معرفات شخصية. عند update_draft أو request_confirmation يجب أن تكون items هي القائمة الكاملة النهائية للمسودة (بما فيها كل الأصناف التي يريد العميل الإبقاء عليها)، لا تغييرات جزئية؛ لا تحذف صنفاً إلا إذا طلب العميل ذلك بوضوح. استعمل orderDetails فقط للمعلومات التي ذكرها العميل. لا تنشئ طلبات ولا تدّعِ إتمامها. اطلب التأكيد بعد اكتمال البيانات، ولا تعتبر نيتك أو صياغتك أنت موافقة العميل؛ التطبيق يتحقق مستقلاً من رسالة تأكيد صريحة بعد أحدث ملخص. أعد JSON فقط وفق المخطط: {"reply": string, "intent": "chat"|"update_draft"|"request_confirmation"|"confirm"|"handoff", "items": [{"itemId": string, "quantity": integer 1..99, "notes": string}], "orderDetails"?: {"customerName"?: string, "deliveryMethod"?: "pickup"|"delivery", "deliveryAddress"?: string, "couponCode"?: string, "paymentMethod"?: "cash"|"vodafone"|"instapay"|"etisalat"}}.`;
const MAX_BODY_BYTES = positiveInt(process.env.MAX_BODY_BYTES, 16_384);
const RATE_LIMIT = positiveInt(process.env.RATE_LIMIT_PER_MINUTE, 30);
const PROVIDER_TIMEOUT_MS = positiveInt(process.env.PROVIDER_TIMEOUT_MS, 15_000);
const WINDOW_MS = 60_000;
const buckets = new Map();
const TOKEN_HASHES = (process.env.AURA_INSTALL_TOKEN_HASHES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

function positiveInt(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('Invalid positive integer configuration');
  return n;
}
function sha256(s) { return createHash('sha256').update(s, 'utf8').digest(); }
function validHash(h) { return typeof h === 'string' && /^[a-f0-9]{64}$/.test(h); }
function tokenAuthorized(token) {
  if (typeof token !== 'string' || !token || TOKEN_HASHES.length === 0) return false;
  const actual = sha256(token);
  let matched = 0;
  for (const allowed of TOKEN_HASHES) {
    if (!validHash(allowed)) continue;
    matched |= Number(timingSafeEqual(actual, Buffer.from(allowed, 'hex')));
  }
  return matched === 1;
}
function hasUnsafeIdentifier(text) {
  return /@(?:s\.whatsapp\.net|g\.us|lid)\b|(?:\+?(?:00)?[0-9٠-٩][0-9٠-٩\s().-]{7,}[0-9٠-٩])|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(text);
}
function exactObject(v, keys) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
}
function isString(v, max, allowEmpty = true) { return typeof v === 'string' && v.length <= max && (allowEmpty || v.length > 0) && !hasUnsafeIdentifier(v); }
function validOrderDetails(v, includeCustomerDetails = false) {
  const allowed = includeCustomerDetails
    ? ['customerName', 'deliveryMethod', 'deliveryAddress', 'couponCode', 'paymentMethod']
    : ['deliveryMethod', 'couponCode', 'paymentMethod'];
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => allowed.includes(k)) &&
    (!Object.hasOwn(v, 'customerName') || isString(v.customerName, 120)) &&
    (!Object.hasOwn(v, 'deliveryMethod') || ['pickup', 'delivery'].includes(v.deliveryMethod)) &&
    (!Object.hasOwn(v, 'deliveryAddress') || isString(v.deliveryAddress, 300)) &&
    (!Object.hasOwn(v, 'couponCode') || isString(v.couponCode, 80)) &&
    (!Object.hasOwn(v, 'paymentMethod') || ['cash', 'vodafone', 'instapay', 'etisalat'].includes(v.paymentMethod));
}
function validItems(items) { return Array.isArray(items) && items.length <= 100 && items.every((i) => exactObject(i, ['itemId', 'quantity', 'notes']) && isString(i.itemId, 128, false) && Number.isSafeInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 99 && isString(i.notes, 300)); }
function validateInput(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !['conversationHash', 'messages', 'menu', 'draft'].every((k) => Object.hasOwn(v, k)) || Object.keys(v).some((k) => !['conversationHash', 'messages', 'menu', 'draft', 'orderDetails'].includes(k)) || !validHash(v.conversationHash)) return false;
  if (Object.hasOwn(v, 'orderDetails') && !validOrderDetails(v.orderDetails)) return false;
  if (!Array.isArray(v.messages) || v.messages.length < 1 || v.messages.length > 30) return false;
  if (!v.messages.every((m) => exactObject(m, ['role', 'text']) && ['customer', 'assistant'].includes(m.role) && isString(m.text, 1000, false))) return false;
  if (!Array.isArray(v.menu) || v.menu.length > 500 || !v.menu.every((m) => exactObject(m, ['id', 'name', 'price', 'available']) && isString(m.id, 128, false) && isString(m.name, 200, false) && Number.isFinite(m.price) && m.price >= 0 && typeof m.available === 'boolean')) return false;
  const d = v.draft;
  if (!exactObject(d, ['id', 'version', 'status', 'items']) || !(d.id === null || isString(d.id, 128, false)) || !Number.isSafeInteger(d.version) || d.version < 0 || !isString(d.status, 64, false) || !validItems(d.items)) return false;
  return true;
}
function validateOutput(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && ['reply', 'intent', 'items'].every((k) => Object.hasOwn(v, k)) && Object.keys(v).every((k) => ['reply', 'intent', 'items', 'orderDetails'].includes(k)) && isString(v.reply, 1000, false) && ['chat', 'update_draft', 'request_confirmation', 'confirm', 'handoff'].includes(v.intent) && validItems(v.items) && (!Object.hasOwn(v, 'orderDetails') || validOrderDetails(v.orderDetails, true));
}
function safeJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data), 'cache-control': 'no-store' });
  res.end(data);
}
async function readBody(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid json'), { status: 400 }); }
}
function rateAllowed(token) {
  const key = sha256(token).toString('hex');
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) { b = { count: 0, resetAt: now + WINDOW_MS }; buckets.set(key, b); }
  b.count += 1;
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  return b.count <= RATE_LIMIT;
}
function providerParts(body) {
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => typeof p.text === 'string' ? p.text : '').join('');
  if (!text) throw new Error('provider response invalid');
  return JSON.parse(text);
}
async function callGemini(payload) {
  if (!GEMINI_API_KEY) throw new Error('provider unavailable');
  const url = `${GEMINI_BASE_URL.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              reply: { type: 'STRING' },
              intent: { type: 'STRING', enum: ['chat', 'update_draft', 'request_confirmation', 'confirm', 'handoff'] },
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { itemId: { type: 'STRING' }, quantity: { type: 'INTEGER' }, notes: { type: 'STRING' } },
                  required: ['itemId', 'quantity', 'notes'],
                  propertyOrdering: ['itemId', 'quantity', 'notes'],
                },
              },
              orderDetails: {
                type: 'OBJECT',
                properties: {
                  customerName: { type: 'STRING' },
                  deliveryMethod: { type: 'STRING', enum: ['pickup', 'delivery'] },
                  deliveryAddress: { type: 'STRING' },
                  couponCode: { type: 'STRING' },
                  paymentMethod: { type: 'STRING', enum: ['cash', 'vodafone', 'instapay', 'etisalat'] },
                },
                propertyOrdering: ['customerName', 'deliveryMethod', 'deliveryAddress', 'couponCode', 'paymentMethod'],
              },
            },
            required: ['reply', 'intent', 'items'],
            propertyOrdering: ['reply', 'intent', 'items', 'orderDetails'],
          },
        },
      }),
    });
    if (!response.ok) throw new Error('provider unavailable');
    let body;
    try { body = await response.json(); } catch { throw new Error('provider response invalid'); }
    return providerParts(body);
  } finally { clearTimeout(timer); }
}
export function createGateway({ provider = callGemini } = {}) {
  return createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return safeJson(res, 200, { status: 'ok' });
    if (req.method !== 'POST' || req.url !== '/v1/agent/respond') return safeJson(res, 404, { error: 'not_found' });
    const auth = req.headers.authorization;
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!tokenAuthorized(token)) return safeJson(res, 401, { error: 'unauthorized' });
    if (!rateAllowed(token)) return safeJson(res, 429, { error: 'rate_limited' });
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) { req.resume(); return safeJson(res, 413, { error: 'payload_too_large' }); }
    try {
      const input = await readBody(req);
      if (!validateInput(input)) return safeJson(res, 400, { error: 'invalid_request' });
      const answer = await provider(input);
      if (!validateOutput(answer)) return safeJson(res, 502, { error: 'invalid_provider_response' });
      return safeJson(res, 200, answer);
    } catch (error) {
      const status = error?.status === 413 ? 413 : error?.status === 400 ? 400 : 502;
      return safeJson(res, status, { error: status === 413 ? 'payload_too_large' : status === 400 ? 'invalid_json' : 'provider_error' });
    }
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = positiveInt(process.env.PORT, 8080);
  const host = process.env.HOST || '127.0.0.1';
  createGateway().listen(port, host, () => { process.stdout.write(`AI gateway listening on ${host}:${port}\n`); });
}
