import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  createLocalStore, PrismaClient, tempDataDir, databaseUrl, saleData,
  trackedItem, assertDurableSettings, startStorageChild, firstPragma,
} from './helpers/storage-test-helpers.mjs';

async function storeFor(t, dataDir = tempDataDir()) {
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  t.after(async () => { await store.checkpointAndClose(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return { store, dataDir };
}

const add = (store, orderData = saleData()) => store.dispatch('orders.add', {
  orderData, cashierId: 'cashier-test', cashierName: 'اختبار',
});

// Every test below opens a physical SQLite file; child-process IPC is real.
// No Electron IPC, printer, WhatsApp or Gemini connection is claimed by these tests.
test('SQLite: empty initialization is idempotent; orders, edits, archives and sequence survive reopening', async t => {
  const dataDir = tempDataDir();
  let store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  t.after(async () => { await store.checkpointAndClose(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  await store.initialize();
  await store.initialize();
  assert.deepEqual(await store.dispatch('orders.list'), []);
  assert.equal(await store.prisma.user.count(), 0);
  assert.equal(await store.prisma.post.count(), 0);
  await trackedItem(store);
  const first = await add(store);
  assert.equal(first.cashierId, 'cashier-test');
  assert.equal(first.items[0].notes, 'اختبار ديمومة');
  await store.dispatch('orders.status', { orderId: first.id, status: 'Preparing', cashierId: 'cashier-test', cashierName: 'اختبار' });
  await store.dispatch('orders.archive', { orderId: first.id, isArchived: true });
  await store.checkpointAndClose();
  store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  const orders = await store.dispatch('orders.list');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, first.id);
  assert.equal(orders[0].status, 'Preparing');
  assert.equal(orders[0].isArchived, true);
  const second = await add(store);
  assert.notEqual(second.displayId, first.displayId);
  assert.ok(Number(second.displayId.split('-').at(-1)) > Number(first.displayId.split('-').at(-1)));
  assert.equal((await store.dispatch('inventory.get')).stockList.find(x => x.id === 'tracked-item').quantity, 3);
  await assertDurableSettings(store.prisma);
});

test('SQLite: acknowledged order survives SIGKILL of the actual writer process and quick_check remains ok', { timeout: 90000 }, async t => {
  const dataDir = tempDataDir();
  let child = await startStorageChild(dataDir);
  t.after(async () => { await child.kill(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  await trackedItem(child);
  const saved = await add(child);
  await child.kill(); // No checkpoint/disconnect: real abrupt termination after commit acknowledgement.
  child = await startStorageChild(dataDir);
  const orders = await child.dispatch('orders.list');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, saved.id);
  assert.equal((await child.dispatch('inventory.get')).stockList[0].quantity, 4);
  const settings = await child.settings();
  assert.equal(firstPragma(settings.quick_check), 'ok');
  assert.equal(String(firstPragma(settings.journal_mode)).toLowerCase(), 'wal');
  assert.equal(Number(firstPragma(settings.synchronous)), 2);
  await child.close();
});

test('SQLite: insufficient stock rolls back order, counter, stock and coupon usage as one transaction', async t => {
  const { store } = await storeFor(t);
  await trackedItem(store, { quantity: 1 });
  await store.dispatch('coupons.save', { couponData: {
    id: 'coupon-save2', code: 'SAVE2', discountType: 'fixed', discountValue: 2,
    usageLimit: 10, usageCount: 0, expiresAt: Date.now() + 86400000, createdAt: Date.now(), isActive: true,
  } });
  await assert.rejects(add(store, saleData({ quantity: 2, couponCode: 'SAVE2', discount: 2 })), error => error.code === 'INSUFFICIENT_STOCK');
  assert.deepEqual(await store.dispatch('orders.list'), []);
  assert.equal((await store.dispatch('inventory.get')).stockList[0].quantity, 1);
  assert.equal((await store.dispatch('coupons.list'))[0].usageCount, 0);
  assert.deepEqual(await store.dispatch('coupons.logs'), []);
  const saved = await add(store, saleData({ couponCode: 'SAVE2', discount: 2 }));
  assert.ok(saved.displayId);
  assert.equal((await store.dispatch('inventory.get')).stockList[0].quantity, 0);
  assert.equal((await store.dispatch('coupons.list'))[0].usageCount, 1);
  assert.equal((await store.dispatch('coupons.logs')).length, 1);
});

test('SQLite: coupon failure also rolls back a stock deduction', async t => {
  const { store } = await storeFor(t);
  await trackedItem(store, { quantity: 2 });
  await store.dispatch('coupons.save', { couponData: {
    id: 'coupon-used', code: 'USED', discountType: 'fixed', discountValue: 2,
    usageLimit: 1, usageCount: 1, expiresAt: null, createdAt: Date.now(), isActive: true,
  } });
  await assert.rejects(add(store, saleData({ couponCode: 'USED', discount: 2 })), error => typeof error.code === 'string' && error.code.includes('COUPON'));
  assert.equal((await store.dispatch('inventory.get')).stockList[0].quantity, 2);
  assert.deepEqual(await store.dispatch('orders.list'), []);
  assert.deepEqual(await store.dispatch('coupons.logs'), []);
});

test('SQLite: two actual processes competing for the last unit produce one order and no negative balance', { timeout: 90000 }, async t => {
  const dataDir = tempDataDir();
  const setup = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await setup.initialize();
  await trackedItem(setup, { quantity: 1 });
  await setup.checkpointAndClose();
  const left = await startStorageChild(dataDir);
  const right = await startStorageChild(dataDir);
  t.after(async () => { await left.kill(); await right.kill(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const results = await Promise.allSettled([add(left), add(right)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  const failed = results.find(x => x.status === 'rejected');
  assert.equal(failed.reason.code, 'INSUFFICIENT_STOCK');
  assert.equal((await left.dispatch('orders.list')).length, 1);
  assert.equal((await right.dispatch('inventory.get')).stockList[0].quantity, 0);
  await left.close();
  await right.close();
});

test('SQLite: replaying the same sale request concurrently only saves and deducts once', async t => {
  const { store } = await storeFor(t);
  await trackedItem(store, { quantity: 3 });
  const data = saleData({ requestId: randomUUID() });
  const [first, replay] = await Promise.all([add(store, data), add(store, data)]);
  assert.equal(first.id, replay.id);
  assert.equal((await store.dispatch('orders.list')).length, 1);
  assert.equal((await store.dispatch('inventory.get')).stockList[0].quantity, 2);
  assert.ok(first._isReplay || replay._isReplay);
});

test('SQLite: WAL, FULL, foreign keys and busy timeout hold on three independently opened clients', async t => {
  const dataDir = tempDataDir();
  const stores = [];
  t.after(async () => { for (const store of stores) await store.checkpointAndClose(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  for (let index = 0; index < 3; index++) {
    const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
    stores.push(store);
    await store.initialize();
    await assertDurableSettings(store.prisma);
  }
  for (const store of stores) await assertDurableSettings(store.prisma);
});

test('SQLite: an older User/Post database upgrades without losing existing rows', async t => {
  const dataDir = tempDataDir();
  const legacy = new PrismaClient({ datasources: { db: { url: databaseUrl(dataDir) } } });
  await legacy.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "name" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)');
  await legacy.$executeRawUnsafe('CREATE UNIQUE INDEX "User_email_key" ON "User"("email")');
  await legacy.$executeRawUnsafe('CREATE TABLE "Post" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "content" TEXT, "published" BOOLEAN NOT NULL DEFAULT false, "authorId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)');
  await legacy.$executeRawUnsafe('INSERT INTO "User" ("id","email","name","updatedAt") VALUES (?,?,?,CURRENT_TIMESTAMP)', 'legacy-user', 'test@example.invalid', 'Legacy');
  await legacy.$executeRawUnsafe('INSERT INTO "Post" ("id","title","authorId","updatedAt") VALUES (?,?,?,CURRENT_TIMESTAMP)', 'legacy-post', 'Preserve me', 'legacy-user');
  await legacy.$disconnect();
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  t.after(async () => { await store.checkpointAndClose(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  await store.initialize();
  assert.deepEqual(await store.prisma.$queryRawUnsafe('SELECT "id", "email" FROM "User"'), [{ id: 'legacy-user', email: 'test@example.invalid' }]);
  assert.deepEqual(await store.prisma.$queryRawUnsafe('SELECT "id", "title" FROM "Post"'), [{ id: 'legacy-post', title: 'Preserve me' }]);
  await assertDurableSettings(store.prisma);
  assert.deepEqual(await store.dispatch('orders.list'), []);
});

test('SQLite: missing serials fail atomically, and an available serial is linked to the saved order', async t => {
  const { store } = await storeFor(t);
  await trackedItem(store, { quantity: 1, requiresSerial: true });
  await assert.rejects(add(store), error => typeof error.code === 'string' && error.code.includes('SERIAL'));
  assert.equal((await store.dispatch('inventory.get')).stockList[0].quantity, 1);
  await store.dispatch('inventory.saveSerial', { serial: {
    serialNumber: 'REAL-TEST-SERIAL', productId: 'tracked-item', status: 'AVAILABLE', addedAt: Date.now(),
  } });
  const order = await add(store);
  const state = await store.dispatch('inventory.get');
  assert.equal(state.serialRecords[0].status, 'SOLD');
  assert.equal(state.serialRecords[0].orderId, order.id);
  assert.equal(state.stockList[0].quantity, 0);
});
