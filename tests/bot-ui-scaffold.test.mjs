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

function createHarness() {
  const states = [];
  let cursor = 0;
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
  };
  const icons = Object.fromEntries(['Bot','QrCode','WifiOff','MessageSquare','Zap','Upload','ChevronDown','AlertCircle','Phone','Clock','Settings','Search','Sparkles','ArrowRight','Save','Plus'].map(name => [name, name]));
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} };
  const context = vm.createContext({ module: mod, exports: mod.exports, require(id) {
    if (id === 'react') return { ...React, default: React };
    if (id === 'lucide-react') return icons;
    throw new Error(`Unexpected import: ${id}`);
  } });
  new vm.Script(compiled, { filename: sourcePath }).runInContext(context);
  const Component = mod.exports.default;
  function render() { cursor = 0; return Component(); }
  return { render };
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

 test('actual UI navigates overview to personality and back; notice persists in both views', () => {
  const h = createHarness();
  let tree = h.render();
  assert.match(textOf(tree), /واجهة فقط — المحرك غير مضاف حالياً/);
  assert.match(textOf(tree), /غير متصل — لا يوجد محرك/);
  assert.doesNotMatch(textOf(tree), /متصل بنجاح|تم الاتصال/);
  tree = click(h, tree, 'تعديل');
  assert.match(textOf(tree), /شخصية البوت/);
  assert.match(textOf(tree), /واجهة فقط — المحرك غير مضاف حالياً/);
  tree = click(h, tree, 'رجوع');
  assert.match(textOf(tree), /البوت والذكاء الاصطناعي/);
  assert.match(textOf(tree), /واجهة فقط — المحرك غير مضاف حالياً/);
});

test('QR and phone pairing tabs are selectable, but neither claims a real QR or connection', () => {
  const h = createHarness();
  let tree = h.render();
  let qr = button(tree, 'رمز QR');
  let phone = button(tree, 'رقم الهاتف');
  assert.equal(qr.props['aria-pressed'], true);
  assert.equal(phone.props['aria-pressed'], false);
  assert.match(textOf(tree), /عرض رمز الربط غير متاح حتى إضافة المكتبة المحلية/);
  assert.doesNotMatch(textOf(tree), /data:image|رمز QR جاهز|تم الاتصال/);
  tree = click(h, tree, 'رقم الهاتف');
  assert.equal(button(tree, 'رقم الهاتف').props['aria-pressed'], true);
  assert.match(textOf(tree), /توليد كود الاقتران غير متاح حالياً/);
  tree = click(h, tree, 'رمز QR');
  assert.equal(button(tree, 'رمز QR').props['aria-pressed'], true);
});

test('business hours, quick replies and manual knowledge expand while controls remain inactive', () => {
  const h = createHarness();
  let tree = click(h, h.render(), 'ساعات العمل');
  assert.equal(button(tree, 'ساعات العمل').props['aria-expanded'], true);
  assert.ok(find(tree, node => node.type === 'input' && node.props.type === 'time'));
  tree = click(h, tree, 'الردود السريعة');
  assert.equal(button(tree, 'الردود السريعة').props['aria-expanded'], true);
  assert.ok(find(tree, node => node.type === 'input' && node.props['aria-label'] === 'الكلمة المفتاحية'));
  tree = click(h, tree, 'تعديل');
  tree = click(h, tree, 'إضافة معرفة يدوياً');
  assert.equal(button(tree, 'إضافة معرفة يدوياً').props['aria-expanded'], true);
  assert.ok(find(tree, node => node.type === 'textarea' && node.props['aria-label'] === 'محتوى المعرفة'));
  for (const item of flatten(tree)) {
    const node = item.node;
    if (node && ['input', 'textarea', 'select', 'button'].includes(node.type)) {
      const disabledByFieldset = item.ancestors.some(ancestor => ancestor.type === 'fieldset' && ancestor.props.disabled);
      if (node.type === 'input' || node.type === 'textarea' || node.type === 'select' || node.props.disabled) assert.ok(disabledByFieldset || node.props.disabled, `Control lacks disabled state: ${node.type}`);
    }
  }
});

test('all operational fields/buttons are disabled and every rendered scene carries the scaffold warning', () => {
  const h = createHarness();
  let tree = h.render();
  assert.match(textOf(tree), /واجهة فقط — المحرك غير مضاف حالياً/);
  tree = click(h, tree, 'رقم الهاتف');
  const phoneInputs = flatten(tree).filter(x => x.node?.type === 'input').map(x => x.node);
  assert.ok(phoneInputs.some(x => x.props.type === 'tel'));
  for (const input of phoneInputs) assert.ok(input.props.disabled || flatten(tree).some(x => x.node?.type === 'fieldset' && x.node.props.disabled && x.node.props.children));
  tree = click(h, tree, 'تعديل');
  assert.match(textOf(tree), /واجهة فقط — المحرك غير مضاف حالياً/);
  const controls = flatten(tree).filter(x => x.node && ['input','textarea','button'].includes(x.node.type));
  for (const item of controls) {
    const insideDisabled = item.ancestors.some(parent => parent.type === 'fieldset' && parent.props.disabled);
    const isNav = item.node.type === 'button' && ['رجوع','إلغاء','إضافة معرفة يدوياً'].includes(textOf(item.node).trim());
    if (!isNav) assert.ok(item.node.props.disabled || insideDisabled, `Operational control is active: ${textOf(item.node)}`);
  }
  assert.ok(flatten(tree).some(x => x.node?.type === 'fieldset' && x.node.props.disabled), 'disabled fieldset should enforce inactive fields');
});

test('only local navigation/expansion state is live; source has no service, network, persistence or provider dependencies', () => {
  const imports = [];
  const calls = [];
  const setters = new Set(['setView','setConnectionTab','setBusinessHoursExpanded','setQuickRepliesExpanded','setManualEntryExpanded']);
  function visit(node) {
    if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      calls.push(name);
      if (/^(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|generateContent)$/.test(name) || /(?:^|\.)(fetch|request|save|persist|connect|generate|send)$/.test(name)) assert.fail(`Forbidden operational call: ${name}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual(imports, ['react', 'lucide-react']);
  assert.ok(imports.every(name => !/service|provider|api|axios|firebase|supabase/i.test(name)));
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
      ts.forEachChild(node, inspect);
    }
    inspect(handler);
    assert.ok(invoked.length > 0 && invoked.every(name => setters.has(name)), `onClick does more than local setState: ${handler.getText(ast)}`);
  }
  assert.ok(calls.every(name => !/fetch|axios|request/i.test(name)));
  assert.match(source, /واجهة فقط — المحرك غير مضاف حالياً/);
  assert.match(source, /لا يتم إرسال أو حفظ أي بيانات من هذه الصفحة/);
});
