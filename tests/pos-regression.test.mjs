import { fileURLToPath } from 'node:url';
// Isolated unit/integration regressions: production logic is loaded from source,
// while Electron, services, UI, and persistence are controlled doubles (no DB/network).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function extractFinalizeCallback() {
  const source = read('src/aura/POSSystem.tsx');
  const ast = ts.createSourceFile('POSSystem.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (!callback && ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleFinalizeOrder' && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useCallback') {
      callback = node.initializer.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, 'actual first handleFinalizeOrder useCallback must exist');
  return callback.getText(ast);
}

function createFinalizeHarness({ currentUser = { id: 'cashier-7', username: 'Sam' }, print, addOrder = async (data, id, name) => ({ ...data, id: 'order-1', displayId: 'D-1', createdAt: 1, isArchived: false, cashierId: id, cashierName: name }) } = {}) {
  const events = [];
  const printFn = print || (async (...args) => events.push(['print', ...args]));
  const deps = {
    currentUser, cartItems: [{ id: 'item-1', name: 'Soup', quantity: 2, price: 12.5, notes: 'no salt' }], logoUrl: 'logo',
    dashboardOrderService: { addOrder: async (...args) => { events.push(['save', ...args]); return addOrder(...args); } },
    inventoryService: { deductStockForOrder: (o) => events.push(['deduct', o]) },
    couponService: { incrementCouponUsage: async (c) => events.push(['coupon-increment', c]), logCouponUsage: async (x) => events.push(['coupon-log', x]) },
    printOrderInvoice: (...args) => printFn(...args),
    showToast: (x) => events.push(['toast', x]), clearCart: () => events.push(['clear']),
  };
  const expression = `(${extractFinalizeCallback()})`;
  const js = ts.transpileModule(expression, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
  const context = vm.createContext({ ...deps, console: { error: (...x) => events.push(['console-error', ...x]) } });
  const fn = new vm.Script(js).runInContext(context);
  return { fn, events };
}

const normalize = (value) => JSON.parse(JSON.stringify(value));

const details = (deliveryMethod, couponCode = '') => ({ name: 'Ari', phone: '555-0102', address: '42 Main', paymentMethod: 'cash', deliveryMethod, subtotal: 25, deliveryFee: 3, discount: 2, couponCode, total: 26 });

test('actual finalize callback saves supported delivery/pickup orders, inventory, coupon, then kitchen/customer prints', async (t) => {
  for (const method of ['delivery', 'pickup']) await t.test(method, async () => {
    const { fn, events } = createFinalizeHarness();
    await fn(details(method, 'SAVE2'));
    const saved = events.find(x => x[0] === 'save');
    assert.ok(saved);
    assert.equal(saved[1].deliveryMethod, method);
    assert.deepEqual(normalize(saved[1].customer), { name: 'Ari', phone: '555-0102', address: '42 Main' });
    assert.deepEqual(normalize(saved[1].items), [{ id: 'item-1', name: 'Soup', quantity: 2, price: 12.5, notes: 'no salt' }]);
    assert.deepEqual(normalize(saved[1].summary), { subtotal: 25, deliveryFee: 3, discount: 2, total: 26 });
    assert.equal(saved[1].couponCode, 'SAVE2');
    assert.equal(saved[2], 'cashier-7');
    assert.equal(saved[3], 'Sam');
    assert.deepEqual(normalize(events.find(x => x[0] === 'coupon-log')[1]), { couponId: 'SAVE2', orderId: 'D-1', discountApplied: 2, customerName: 'Ari' });
    const names = events.map(x => x[0]);
    assert.deepEqual(names.filter(x => ['save', 'deduct', 'coupon-increment', 'coupon-log', 'print'].includes(x)), ['save', 'deduct', 'coupon-increment', 'coupon-log', 'print', 'print']);
    assert.deepEqual(events.filter(x => x[0] === 'print').map(x => x[2]), ['kitchen', method === 'delivery' ? 'delivery' : 'dine_in']);
    assert.ok(events.filter(x => x[0] === 'print').every(x => x[4] === 'cashier-7' && x[5] === 'Sam'));
    assert.ok(names.indexOf('coupon-log') < names.indexOf('print'));
    assert.ok(names.indexOf('toast') > names.indexOf('print'));
    assert.ok(names.indexOf('clear') > names.indexOf('toast'));
  });
});

test('actual finalize callback omits coupon usage when coupon code is empty', async () => {
  const { fn, events } = createFinalizeHarness();
  await fn(details('pickup'));
  assert.equal(events.some(x => x[0] === 'coupon-increment' || x[0] === 'coupon-log'), false);
});

test('actual finalize callback reuses saved order for inventory and both prints', async () => {
  const savedOrder = { id: 'saved-42', displayId: 'S-42', deliveryMethod: 'pickup' };
  const { fn, events } = createFinalizeHarness({ addOrder: async () => savedOrder });
  await fn(details('pickup'));
  assert.equal(events.find(x => x[0] === 'deduct')[1], savedOrder);
  assert.ok(events.filter(x => x[0] === 'print').every(x => x[1] === savedOrder));
});

test('actual finalize callback does not deduct or print when saving fails', async () => {
  const { fn, events } = createFinalizeHarness({ addOrder: async () => { throw new Error('save failed'); } });
  await assert.rejects(fn(details('delivery', 'SAVE2')), /save failed/);
  assert.deepEqual(events.map(x => x[0]), ['save']);
});

test('actual finalize callback tolerates print rejection after saving and deducting', async () => {
  const { fn, events } = createFinalizeHarness({ print: async () => { throw new Error('printer offline'); } });
  await fn(details('pickup'));
  assert.equal(events.filter(x => x[0] === 'save').length, 1);
  assert.equal(events.filter(x => x[0] === 'deduct').length, 1);
  assert.ok(events.some(x => x[0] === 'toast' && x[1].type === 'success'));
  assert.ok(events.some(x => x[0] === 'clear'));
});

test('actual finalize callback with no current user prevents persistence, inventory, coupons and printing', async () => {
  const { fn, events } = createFinalizeHarness({ currentUser: null });
  await fn(details('delivery', 'SAVE2'));
  assert.deepEqual(events.map(x => x[0]), ['toast']);
  assert.equal(events[0][1].type, 'error');
});

function loadPrintingService(electronAPI) {
  const source = read('src/aura/services/printingService.ts');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const sandboxModule = { exports: {} };
  const fakeReact = { createElement: (type, props) => ({ type, props }) };
  const context = vm.createContext({ module: sandboxModule, exports: sandboxModule.exports, require: (id) => id === 'react' ? fakeReact : {}, console: { log() {}, error() {} }, window: { electronAPI }, setTimeout, document: undefined });
  new vm.Script(js, { filename: 'printingService.js' }).runInContext(context);
  return sandboxModule.exports;
}

test('actual printingService routes kitchen and customer invoices to configured Electron printers', async () => {
  const calls = [];
  const service = loadPrintingService({ loadPrinterSettings: async () => ({ kitchenPrinter: 'Kitchen-1', cashierPrinter: 'Cashier-2' }), print: async (job) => calls.push(job) });
  const order = { id: 'order-9' };
  await service.printOrderInvoice(order, 'kitchen', null);
  await service.printOrderInvoice(order, 'delivery', null);
  await service.printOrderInvoice(order, 'dine_in', null);
  assert.deepEqual(calls.map(x => [x.printer, x.type]), [['Kitchen-1', 'kitchen'], ['Cashier-2', 'delivery'], ['Cashier-2', 'dine_in']]);
  assert.ok(calls.every(x => x.data === order));
});

test('actual printingService skips Electron print when settings or assigned printer are absent', async () => {
  let prints = 0;
  const noSettings = loadPrintingService({ loadPrinterSettings: async () => null, print: async () => prints++ });
  await noSettings.printOrderInvoice({ id: 'x' }, 'delivery', null);
  const partial = loadPrintingService({ loadPrinterSettings: async () => ({ kitchenPrinter: 'K' }), print: async () => prints++ });
  await partial.printOrderInvoice({ id: 'x' }, 'delivery', null);
  assert.equal(prints, 0);
});

test('actual inventoryService deducts recipe quantities multiplied by ordered quantity', () => {
  const source = read('src/aura/services/inventoryService.ts');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const sandboxModule = { exports: {} };
  const context = vm.createContext({ module: sandboxModule, exports: sandboxModule.exports, require: () => ({ InventoryItemType: { MATERIAL: 'MATERIAL', PRODUCT: 'PRODUCT', BUNDLE: 'BUNDLE' }, InventoryUnit: { KG: 'KG', LITER: 'LITER', PIECE: 'PIECE' } }), console: { log() {}, warn() {}, error() {} }, Math, Date });
  new vm.Script(js).runInContext(context);
  const inventory = sandboxModule.exports.inventoryService;
  const before = Object.fromEntries(inventory.getStockList().map(x => [x.id, x.quantity]));
  inventory.deductStockForOrder({ id: 'test-order', items: [{ id: 'pizza_item', quantity: 2, name: 'Margherita' }] });
  const after = Object.fromEntries(inventory.getStockList().map(x => [x.id, x.quantity]));
  assert.equal(after.flour_1, before.flour_1 - 1);
  assert.ok(Math.abs(after.cheese_1 - (before.cheese_1 - 0.4)) < 1e-9);
  assert.ok(Math.abs(after.tomato_sauce - (before.tomato_sauce - 0.2)) < 1e-9);
});
