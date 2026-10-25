import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = 'src/aura/components/dashboard/pages/settings/BotAIPage.tsx';
const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function createHarness(electronAPI, storeOverrides = {}, confirmResult = true) {
  const states = [];
  const effects = [];
  const storeCalls = [];
  const confirmCalls = [];
  const toastCalls = [];
  let cursor = 0;
  let refCursor = 0;
  const refs = [];
  let effectsMounted = false;
  const React = {
    createElement(type, props, ...children) {
      const p = { ...(props || {}) };
      if (children.length) p.children = children.length === 1 ? children[0] : children;
      if (typeof type === 'function') return type(p);
      return { type, props: p };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect(effect) { if (!effectsMounted) effects.push(effect); },
  };
  const icons = Object.fromEntries(['Bot','QrCode','Wifi','WifiOff','MessageSquare','Zap','Upload','ChevronDown','AlertCircle','Phone','Clock','Settings','Search','Sparkles','ArrowRight','Save','Plus','Eye','EyeOff'].map(name => [name, name]));
  const defaultSettings = { enabled: false, consentVersion: null, consentAcceptedAt: null, gatewayConfigured: false };
  const localStoreClient = {
    call: async (action, payload = {}) => {
      storeCalls.push({ action, payload });
      if (Object.hasOwn(storeOverrides, action)) return storeOverrides[action];
      if (action === 'whatsapp.agent.settings.get') return defaultSettings;
      if (action === 'whatsapp.agent.settings.set') return { ...(storeOverrides['whatsapp.agent.settings.get'] || defaultSettings), enabled: payload.enabled === true, consentVersion: payload.enabled ? '2' : null, consentAcceptedAt: payload.enabled ? Date.now() : null };
      if (action === 'whatsapp.conversation.list') return [];
      if (action === 'whatsapp.agent.personality.get') return { botName: 'مساعد Aura POS', businessName: '', tone: 'friendly', replyLength: 'short', instructions: '', useEmoji: false };
      if (action === 'whatsapp.agent.personality.set') return payload;
      return true;
    },
    report: () => {},
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} };
  const context = vm.createContext({ module: mod, exports: mod.exports, window: { electronAPI, confirm: text => { confirmCalls.push(text); return confirmResult; } }, require(id) {
    if (id === 'react') return { ...React, default: React };
    if (id === 'lucide-react') return icons;
    if (id === 'qrcode.react') return { QRCodeSVG: 'QRCodeSVG' };
    if (id === '@/aura/services/localStoreClient') return { localStoreClient };
    if (id === '@/aura/components/dashboard/DashboardContext') return { useDashboard: () => ({ showToast: options => toastCalls.push(options) }) };
    throw new Error(`Unexpected import: ${id}`);
  } });
  new vm.Script(compiled, { filename: sourcePath }).runInContext(context);
  const Component = mod.exports.default;
  function render() {
    cursor = 0;
    refCursor = 0;
    const tree = Component();
    if (!effectsMounted) {
      effectsMounted = true;
      for (const effect of effects) effect();
    }
    return tree;
  }
  return { render, storeCalls, confirmCalls, toastCalls };
}

const children = node => node && typeof node === 'object' ? (Array.isArray(node.props?.children) ? node.props.children : node.props?.children == null ? [] : [node.props.children]) : [];
function flatten(node, ancestors = []) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(child => flatten(child, ancestors));
  if (typeof node !== 'object') return [{ text: String(node), ancestors }];
  const next = [...ancestors, node];
  return [{ node, ancestors }, ...children(node).flatMap(child => flatten(child, next))];
}
const textOf = node => flatten(node).filter(x => x.text).map(x => x.text).join('');
function find(node, predicate, message = 'Expected rendered element was not found') {
  const entry = flatten(node).find(item => item.node && predicate(item.node, item.ancestors));
  assert.ok(entry, message);
  return entry.node;
}
const button = (tree, label) => find(tree, node => node.type === 'button' && textOf(node).includes(label), `Missing button: ${label}`);
const click = (h, tree, label) => { const target = button(tree, label); assert.equal(typeof target.props.onClick, 'function'); target.props.onClick(); return h.render(); };

test('actual UI navigates overview to personality and back; the local-agent notice persists in both views', () => {
  const h = createHarness();
  let tree = h.render();
  assert.match(textOf(tree), /الوكيل متوقف افتراضياً — فعّله فقط بعد إعداد Gemini وموافقتك/);
  assert.match(textOf(tree), /غير متاح في المتصفح — استخدم تطبيق Aura POS لسطح المكتب/);
  assert.doesNotMatch(textOf(tree), /متصل بـWhatsApp/);
  tree = click(h, tree, 'تعديل');
  assert.match(textOf(tree), /شخصية البوت/);
  assert.match(textOf(tree), /الوكيل متوقف افتراضياً — فعّله فقط بعد إعداد Gemini وموافقتك/);
  tree = click(h, tree, 'رجوع');
  assert.match(textOf(tree), /البوت والذكاء الاصطناعي/);
  assert.match(textOf(tree), /الوكيل متوقف افتراضياً — فعّله فقط بعد إعداد Gemini وموافقتك/);
});

test('AI agent requires explicit consent and configured Gateway before enabling', async () => {
  const h = createHarness(undefined, {
    'whatsapp.agent.settings.get': { enabled: false, consentVersion: null, consentAcceptedAt: null, gatewayConfigured: true },
    'whatsapp.conversation.list': [],
  });
  h.render();
  await new Promise(resolve => setImmediate(resolve));
  let tree = h.render();
  assert.equal(button(tree, 'تفعيل الوكيل').props.disabled, true);
  const consent = find(tree, node => node.type === 'input' && node.props.type === 'checkbox');
  consent.props.onChange({ target: { checked: true } });
  tree = h.render();
  assert.equal(button(tree, 'تفعيل الوكيل').props.disabled, false);
  button(tree, 'تفعيل الوكيل').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.confirmCalls[0], /تُرسل Google/);
  assert.match(h.confirmCalls[0], /بيانات الطبقة المجانية/);
  const saved = h.storeCalls.find(call => call.action === 'whatsapp.agent.settings.set');
  assert.deepEqual(JSON.parse(JSON.stringify(saved?.payload)), { enabled: true, consentVersion: '2' });

  const declined = createHarness(undefined, {
    'whatsapp.agent.settings.get': { enabled: false, consentVersion: null, consentAcceptedAt: null, gatewayConfigured: true },
    'whatsapp.conversation.list': [],
  }, false);
  declined.render();
  await new Promise(resolve => setImmediate(resolve));
  let declinedTree = declined.render();
  find(declinedTree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  declinedTree = declined.render();
  button(declinedTree, 'تفعيل الوكيل').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(declined.confirmCalls.length, 1);
  assert.equal(declined.storeCalls.some(call => call.action === 'whatsapp.agent.settings.set'), false);
});

test('conversation controls use local opaque IDs and do not render phone/JID fields', async () => {
  const h = createHarness(undefined, {
    'whatsapp.agent.settings.get': { enabled: false, consentVersion: null, consentAcceptedAt: null, gatewayConfigured: false },
    'whatsapp.conversation.list': [{ conversationId: 'wac_opaque123456', state: 'needs_staff', timestamp: 1, draft: null }],
  });
  h.render();
  await new Promise(resolve => setImmediate(resolve));
  const tree = h.render();
  assert.match(textOf(tree), /•••123456/);
  assert.doesNotMatch(textOf(tree), /@s\.whatsapp\.net|\+2010/);
  button(tree, 'استئناف الوكيل').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.storeCalls.some(call => call.action === 'whatsapp.conversation.resume' && call.payload.conversationId === 'wac_opaque123456'));
});

test('phone pairing UI validates the international number, shows an ephemeral code and offers renewal after expiry', async () => {
  let statusListener;
  let pairingListener;
  let requestedPhone = '';
  let pairingRequests = 0;
  const api = {
    onWhatsAppStatus: callback => { statusListener = callback; return () => { statusListener = undefined; }; },
    onWhatsAppQr: () => () => {},
    onWhatsAppPairingCode: callback => { pairingListener = callback; return () => { pairingListener = undefined; }; },
    getWhatsAppStatus: async () => ({ state: 'idle', qr: null, pairingCode: null }),
    getGeminiKeyStatus: async () => ({ configured: false, encryptionAvailable: true }),
    connectWhatsApp: async () => true,
    pairWhatsApp: async phoneNumber => { requestedPhone = phoneNumber; pairingRequests += 1; return true; },
    disconnectWhatsApp: async () => true,
  };
  const h = createHarness(api);
  let tree = h.render();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  tree = click(h, tree, 'رقم الهاتف');
  const phoneInput = find(tree, node => node.type === 'input' && node.props.type === 'tel');
  phoneInput.props.onChange({ target: { value: '+20 101 234 5678' } });
  tree = h.render();
  assert.equal(button(tree, 'توليد كود الاقتران').props.disabled, false);
  button(tree, 'توليد كود الاقتران').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestedPhone, '');
  tree = h.render();
  assert.match(textOf(tree), /اكتب رقمًا دوليًا/);
  find(tree, node => node.type === 'input' && node.props.type === 'tel').props.onChange({ target: { value: '201012345678' } });
  tree = h.render();
  button(tree, 'توليد كود الاقتران').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestedPhone, '201012345678');
  statusListener({ state: 'pairing' });
  pairingListener('ABCDEFGH');
  tree = h.render();
  assert.match(textOf(tree), /ABCDEFGH/);
  assert.match(textOf(tree), /الأجهزة المرتبطة/);
  pairingListener(null);
  tree = h.render();
  assert.match(textOf(tree), /اختفى الرمز أو لم يظهر/);
  assert.equal(button(tree, 'طلب رمز جديد').props.disabled, false);
  button(tree, 'طلب رمز جديد').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pairingRequests, 2);
  assert.equal(requestedPhone, '201012345678');
  statusListener({ state: 'connected' });
  tree = h.render();
  assert.doesNotMatch(textOf(tree), /ABCDEFGH/);
});

test('real QR/status events render the local QR component, clear it on open, and expose explicit disconnect', async () => {
  let statusListener;
  let qrListener;
  let pairingListener;
  let disconnectCalls = 0;
  const api = {
    onWhatsAppStatus: callback => { statusListener = callback; return () => { statusListener = undefined; }; },
    onWhatsAppQr: callback => { qrListener = callback; return () => { qrListener = undefined; }; },
    onWhatsAppPairingCode: callback => { pairingListener = callback; return () => { pairingListener = undefined; }; },
    getWhatsAppStatus: async () => ({ state: 'idle', qr: null, pairingCode: null }),
    getGeminiKeyStatus: async () => ({ configured: false, encryptionAvailable: true }),
    connectWhatsApp: async () => true,
    disconnectWhatsApp: async () => { disconnectCalls += 1; return true; },
  };
  const h = createHarness(api);
  let tree = h.render();
  await Promise.resolve();
  tree = h.render();
  assert.ok(statusListener && qrListener && pairingListener);
  assert.equal(button(tree, 'بدء الربط').props.disabled, false);
  await button(tree, 'بدء الربط').props.onClick();
  statusListener({ state: 'qr' });
  qrListener('synthetic-local-qr-payload');
  tree = h.render();
  const qr = find(tree, node => node.type === 'QRCodeSVG');
  assert.equal(qr.props.value, 'synthetic-local-qr-payload');
  assert.match(textOf(tree), /افتح WhatsApp على هاتفك وامسح الرمز الآن/);
  statusListener({ state: 'connected' });
  tree = h.render();
  assert.doesNotMatch(textOf(tree), /synthetic-local-qr-payload/);
  assert.match(textOf(tree), /متصل بـWhatsApp/);
  assert.equal(flatten(tree).some(item => item.node?.type === 'QRCodeSVG'), false);
  button(tree, 'فصل الربط').props.onClick();
  assert.equal(disconnectCalls, 1);
});

test('business hours, quick replies and manual knowledge expand while controls remain inactive', () => {
  const h = createHarness();
  let tree = click(h, h.render(), 'ساعات العمل');
  assert.equal(button(tree, 'ساعات العمل').props['aria-expanded'], true);
  const requireDisabled = predicate => {
    const item = flatten(tree).find(entry => entry.node && predicate(entry.node));
    assert.ok(item, 'Expected control is missing');
    assert.ok(item.node.props.disabled || item.ancestors.some(ancestor => ancestor.type === 'fieldset' && ancestor.props.disabled));
  };
  requireDisabled(node => node.type === 'input' && node.props.type === 'time');
  tree = click(h, tree, 'الردود السريعة');
  assert.equal(button(tree, 'الردود السريعة').props['aria-expanded'], true);
  requireDisabled(node => node.type === 'input' && node.props['aria-label'] === 'الكلمة المفتاحية');
  tree = click(h, tree, 'تعديل');
  tree = click(h, tree, 'إضافة معرفة يدوياً');
  assert.equal(button(tree, 'إضافة معرفة يدوياً').props['aria-expanded'], true);
  requireDisabled(node => node.type === 'textarea' && node.props['aria-label'] === 'محتوى المعرفة');
  requireDisabled(node => node.type === 'input' && node.props.type === 'file');
});

test('personality settings save locally, show a success toast and return to overview while unsupported knowledge controls stay disabled', async () => {
  const h = createHarness();
  let tree = h.render();
  assert.match(textOf(tree), /الوكيل متوقف افتراضياً — فعّله فقط بعد إعداد Gemini وموافقتك/);
  tree = click(h, tree, 'رقم الهاتف');
  const phoneInputs = flatten(tree).filter(x => x.node?.type === 'input').map(x => x.node);
  assert.ok(phoneInputs.some(x => x.props.type === 'tel'));
  assert.equal(phoneInputs.find(x => x.props.type === 'tel')?.props.disabled, undefined);
  tree = click(h, tree, 'تعديل');
  assert.match(textOf(tree), /الوكيل متوقف افتراضياً — فعّله فقط بعد إعداد Gemini وموافقتك/);
  const botName = find(tree, node => node.type === 'input' && node.props.type === 'text' && node.props.maxLength === 80);
  botName.props.onChange({ target: { value: 'مساعد تجريبي' } });
  tree = h.render();
  assert.equal(button(tree, 'حفظ الشخصية').props.disabled, false);
  button(tree, 'حفظ الشخصية').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  const saved = h.storeCalls.find(call => call.action === 'whatsapp.agent.personality.set');
  assert.equal(saved?.payload.botName, 'مساعد تجريبي');
  tree = h.render();
  assert.equal(button(tree, 'تعديل').props.disabled, undefined, 'successful save should leave personality editor');
  assert.ok(h.toastCalls.some(toast => toast.type === 'success' && /حفظ شخصية البوت بنجاح/.test(toast.message)));
  tree = click(h, tree, 'تعديل');
  const knowledgeFile = find(tree, node => node.type === 'input' && node.props.type === 'file');
  assert.equal(knowledgeFile.props.disabled, true);
  assert.ok(flatten(tree).some(x => x.node?.type === 'fieldset' && x.node.props.disabled), 'disabled fieldset should enforce inactive fields');
});

test('only declared WhatsApp preload channels are operational; no generic network, persistence or provider is loaded', () => {
  const imports = [];
  const calls = [];
  const setters = new Set(['setView','setConnectionTab','setGeminiKeyVisible','setBusinessHoursExpanded','setQuickRepliesExpanded','setManualEntryExpanded','setAgentEnabled','setConversationState','updatePersonality','startWhatsApp','disconnectWhatsApp','startPairing','savePersonality','saveGeminiKey','clearGeminiKey','testGeminiKey','localStoreClient.call']);
  function visit(node) {
    if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      calls.push(name);
      if (/^(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|generateContent)$/.test(name) || /(?:^|\.)(fetch|request|save|persist|generate|send)$/.test(name)) assert.fail(`Forbidden operational call: ${name}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual(imports, ['react', 'lucide-react', 'qrcode.react', '@/aura/services/localStoreClient', '@/aura/components/dashboard/DashboardContext']);
  assert.ok(imports.every(name => !/provider|axios|firebase|supabase/i.test(name)));
  const liveHandlers = [];
  function scan(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onClick' && node.initializer && ts.isJsxExpression(node.initializer)) {
      const expr = node.initializer.expression;
      if (expr) liveHandlers.push(expr);
    }
    ts.forEachChild(node, scan);
  }
  scan(ast);
  assert.ok(liveHandlers.length >= 5);
  for (const handler of liveHandlers) {
    const invoked = [];
    function inspect(node) {
      if (ts.isCallExpression(node)) invoked.push(node.expression.getText(ast));
      if (ts.isIdentifier(node) && setters.has(node.text)) invoked.push(node.text);
      ts.forEachChild(node, inspect);
    }
    inspect(handler);
    assert.ok(invoked.length > 0 && invoked.every(name => setters.has(name)), `onClick does more than local state or declared IPC: ${handler.getText(ast)}`);
  }
  assert.ok(calls.every(name => !/fetch|axios|request/i.test(name) || name === 'setPairingRequestPending'));
  assert.match(source, /الوكيل متوقف افتراضياً — فعّله فقط بعد إعداد Gemini وموافقتك/);
  assert.match(source, /whatsapp\.agent\.settings\.set/);
  assert.match(source, /api\.connectWhatsApp\(\)/);
  assert.match(source, /api\.pairWhatsApp\(pairingPhone\)/);
  assert.match(source, /api\.saveGeminiApiKey\(/);
  assert.match(source, /api\.disconnectWhatsApp\(\)/);
  assert.match(source, /api\?\.onWhatsAppStatus/);
  assert.match(source, /api\?\.onWhatsAppQr/);
  assert.match(source, /QRCodeSVG value=\{qrPayload\}/);
});

test('Gemini UI distinguishes local key-format rejection from a connection failure', async () => {
  const rejectedKey = 'synthetic invalid key';
  const api = {
    onWhatsAppStatus: () => () => {}, onWhatsAppQr: () => () => {}, onWhatsAppPairingCode: () => () => {},
    getWhatsAppStatus: async () => ({ state: 'idle', qr: null, pairingCode: null }),
    getGeminiKeyStatus: async () => ({ configured: false, encryptionAvailable: true }),
    connectWhatsApp: async () => true, pairWhatsApp: async () => true, disconnectWhatsApp: async () => true,
    saveGeminiApiKey: async () => ({ configured: true }),
    clearGeminiApiKey: async () => ({ configured: false }),
    testGeminiApiKey: async () => { throw new Error("Error invoking remote method 'gemini-key:test': Error: INVALID_GEMINI_API_KEY"); },
  };
  const h = createHarness(api);
  let tree = h.render();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  const input = find(tree, node => node.type === 'input' && node.props['aria-label'] === 'مفتاح Gemini API');
  input.props.onChange({ target: { value: rejectedKey } });
  tree = h.render();
  button(tree, 'اختبار الاتصال').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  assert.match(textOf(tree), /رفض التطبيق صيغة المفتاح محلياً قبل الوصول إلى Google/);
  assert.doesNotMatch(textOf(tree), /تعذر الاتصال بخدمة Gemini/);
});

test('Gemini UI tests an unsaved synthetic key, toggles visibility, and confirms local save even when sync is deferred', async () => {
  let savedKey = '';
  const testedKeys = [];
  const api = {
    onWhatsAppStatus: () => () => {}, onWhatsAppQr: () => () => {}, onWhatsAppPairingCode: () => () => {},
    getWhatsAppStatus: async () => ({ state: 'idle', qr: null, pairingCode: null }),
    getGeminiKeyStatus: async () => ({ configured: false, encryptionAvailable: true }),
    connectWhatsApp: async () => true, pairWhatsApp: async () => true, disconnectWhatsApp: async () => true,
    saveGeminiApiKey: async key => { savedKey = key; return { configured: true, synced: false }; },
    clearGeminiApiKey: async () => ({ configured: false }),
    testGeminiApiKey: async key => { testedKeys.push(key); return { ok: true, model: 'gemini-3.8-flash' }; },
  };
  const h = createHarness(api);
  let tree = h.render();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  const input = find(tree, node => node.type === 'input' && node.props.type === 'password');
  const key = 'synthetic-gemini-key-0123456789';
  input.props.onChange({ target: { value: key } });
  tree = h.render();
  assert.equal(button(tree, 'اختبار الاتصال').props.disabled, false, 'a draft key can be tested before saving');
  find(tree, node => node.type === 'button' && node.props['aria-label'] === 'إظهار المفتاح').props.onClick();
  tree = h.render();
  assert.equal(find(tree, node => node.type === 'input' && node.props['aria-label'] === 'مفتاح Gemini API').props.type, 'text');
  find(tree, node => node.type === 'button' && node.props['aria-label'] === 'إخفاء المفتاح').props.onClick();
  tree = h.render();
  button(tree, 'اختبار الاتصال').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  assert.equal(testedKeys[0], key);
  assert.match(textOf(tree), /نجح الاتصال بالنموذج المحدد/);
  button(tree, 'حفظ المفتاح محلياً').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  assert.equal(savedKey, key);
  assert.equal(find(tree, node => node.type === 'input' && node.props.type === 'password').props.value, '');
  assert.doesNotMatch(textOf(tree), new RegExp(key));
  assert.match(textOf(tree), /يوجد مفتاح محفوظ مشفراً/);
  button(tree, 'اختبار الاتصال').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render();
  assert.deepEqual(testedKeys, [key, undefined]);
  assert.match(textOf(tree), /نجح الاتصال بالنموذج المحدد/);
  assert.ok(h.toastCalls.some(toast => toast.type === 'info' && /ستتم مزامنته/.test(toast.message)));
});
