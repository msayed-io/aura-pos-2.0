import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Static wiring checks only. Runtime durability/transactions use physical SQLite
// in storage-durability.test.mjs. No database, IPC, child process or printer doubles.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function walk(node, visit) { visit(node); ts.forEachChild(node, child => walk(child, visit)); }
function finalizeAst() {
  const source = read('src/aura/POSSystem.tsx');
  const ast = ts.createSourceFile('POSSystem.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  walk(ast, node => {
    if (!callback && ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleFinalizeOrder'
      && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0];
  });
  assert.ok(callback, 'checkout callback must remain present');
  const calls = [];
  walk(callback, node => {
    if (ts.isCallExpression(node)) calls.push({ name: node.expression.getText(ast), node, position: node.pos });
  });
  return { ast, callback, calls, text: callback.getText(ast) };
}

test('static POS contract: server order transaction is awaited before any print dispatch', () => {
  const { calls } = finalizeAst();
  const saves = calls.filter(call => call.name === 'dashboardOrderService.addOrder');
  const prints = calls.filter(call => call.name === 'printOrderInvoice');
  assert.equal(saves.length, 1);
  assert.ok(ts.isAwaitExpression(saves[0].node.parent));
  assert.equal(prints.length, 2);
  for (const print of prints) {
    assert.ok(print.position > saves[0].position);
    assert.ok(ts.isAwaitExpression(print.node.parent));
    assert.equal(print.node.arguments[0].getText(), 'newDashboardOrder');
  }
});

test('static POS contract: inventory and coupon effects are not repeated outside the server transaction', () => {
  const { calls, text } = finalizeAst();
  const forbidden = ['inventoryService.deductStockForOrder', 'couponService.incrementCouponUsage', 'couponService.logCouponUsage'];
  assert.deepEqual(calls.filter(call => forbidden.includes(call.name)), []);
  assert.match(text, /_requestId/);
  assert.match(text, /_isReplay/);
  assert.match(text, /saleRequestRef/);
  assert.match(text, /تعذر تأكيد حفظ الطلب/);
  assert.match(text, /احتُفظ بالسلة/);
  assert.doesNotMatch(text, /لم يتم خصم المخزون/);
});

test('static POS contract: customer, payment, totals and pickup/delivery fields remain in the saved payload', () => {
  const { text } = finalizeAst();
  for (const field of ['customer', 'items', 'summary', 'subtotal', 'deliveryFee', 'discount', 'total', 'deliveryMethod', 'paymentMethod', 'couponCode']) {
    assert.match(text, new RegExp(`\\b${field}\\b`));
  }
  assert.match(text, /cashierId/);
  assert.match(text, /cashierName/);
  assert.match(text, /clearCart\(\)/);
});

test('static POS contract: confirmed sale clears its cart and retry key before printing, never after it', () => {
  const { calls, text } = finalizeAst();
  const save = calls.find(call => call.name === 'dashboardOrderService.addOrder');
  const clears = calls.filter(call => call.name === 'clearCart');
  const firstPrint = calls.find(call => call.name === 'printOrderInvoice');
  assert.equal(clears.length, 1);
  assert.ok(clears[0].position > save.position);
  assert.ok(clears[0].position < firstPrint.position);
  assert.ok(text.indexOf('saleRequestRef.current = null') < text.indexOf('await printOrderInvoice'));
});

test('static POS contract: OS notification is sent only for a newly confirmed order and contains its display ID', () => {
  const { calls, text } = finalizeAst();
  const save = calls.find(call => call.name === 'dashboardOrderService.addOrder');
  const notification = calls.find(call => call.name.includes('notifyNewOrder'));
  assert.ok(notification);
  assert.ok(notification.position > save.position);
  assert.match(text, /if\s*\(window\.electronAPI\?\.notifyNewOrder\)/);
  assert.match(text, /notifyNewOrder\(newDashboardOrder\.displayId\)/);
  assert.ok(text.indexOf('notifyNewOrder') > text.indexOf('الطلب موجود مسبقاً'));
});

test('static renderer boundary: adapters use the local API and never import Prisma or filesystem', () => {
  const files = [
    'src/aura/components/dashboard/services/dashboardOrderService.ts',
    'src/aura/components/dashboard/services/menuService.ts',
    'src/aura/components/dashboard/services/couponService.ts',
    'src/aura/services/inventoryService.ts',
    'src/aura/services/localStoreClient.ts',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /@prisma\/client|PrismaClient|node:fs|from\s+['"]fs['"]/);
    assert.match(source, /localStoreClient|\/api\/local-store/);
  }
});
