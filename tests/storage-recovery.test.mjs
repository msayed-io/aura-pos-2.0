import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalStore, root, saleData, trackedItem, assertDurableSettings, tempDataDir, startStorageChild } from './helpers/storage-test-helpers.mjs';

function fixture(t, dataDir = tempDataDir()) {
  const stores = [];
  t.after(async () => {
    for (const store of stores) await store.checkpointAndClose();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return {
    dataDir,
    make(options = {}) {
      const store = createLocalStore({ dataDir, seed: false, autoBackup: false, ...options });
      stores.push(store);
      return store;
    },
  };
}
const add = (store, orderData = saleData()) => store.dispatch('orders.add', { orderData, cashierId: 'test', cashierName: 'اختبار' });
function corruptClosedDatabase(dataDir) {
  const db = path.join(dataDir, 'aura.sqlite');
  const wal = `${db}-wal`;
  assert.ok(!fs.existsSync(wal) || fs.statSync(wal).size === 0, 'Fixture corruption only follows a completed close/checkpoint');
  fs.writeFileSync(db, Buffer.from('This is deliberately not a SQLite database.'));
}
function migrationFixture(dataDir) {
  const target = path.join(dataDir, 'migration-fixture');
  fs.cpSync(path.join(root, 'prisma/migrations'), target, { recursive: true });
  return target;
}

test('catalog item, recipe, category and offer with the same public ID remain separate durable records', async t => {
  const f = fixture(t);
  const store = f.make();
  await store.initialize();
  await store.dispatch('inventory.saveStock', { stock: { id: 'ingredient', name: 'مكوّن', quantity: 3, type: 'MATERIAL', unit: 'KG', costPerUnit: 1 } });
  await trackedItem(store, { recipe: [{ inventoryItemId: 'ingredient', quantity: 0.5, unit: 'KG' }] });
  await store.dispatch('menu.saveCategories', { categories: [{ id: 'tracked-item', name: 'فئة', order: 0 }] });
  await store.dispatch('menu.saveOffer', { offerData: { id: 'tracked-item', name: 'عرض', description: '', image: '', price: 7, categoryKey: 'cat_offers' } });
  const menu = await store.dispatch('menu.get');
  assert.equal(menu.menuItems.length, 1);
  assert.equal(menu.menuItems[0].id, 'tracked-item');
  assert.equal(menu.categories.length, 1);
  assert.equal(menu.offers.length, 1);
  await add(store, saleData({ quantity: 2 }));
  const inventory = await store.dispatch('inventory.get');
  assert.equal(inventory.stockList.find(x => x.id === 'ingredient').quantity, 2);
  assert.equal(inventory.stockList.find(x => x.id === 'tracked-item').quantity, 5);
});

test('seed runs once; deleting all orders/inventory does not recreate demos or lower the persistent sequence', async t => {
  const f = fixture(t);
  const first = f.make({ seed: true });
  await first.initialize();
  await trackedItem(first, { quantity: 2 });
  const saved = await add(first);
  const all = await first.dispatch('orders.list');
  await first.dispatch('orders.delete', { orderIds: all.map(order => order.id) });
  await first.prisma.localInventory.deleteMany();
  await first.checkpointAndClose();
  const reopened = f.make({ seed: true });
  await reopened.initialize();
  assert.deepEqual(await reopened.dispatch('orders.list'), []);
  assert.deepEqual((await reopened.dispatch('inventory.get')).stockList, []);
  await trackedItem(reopened, { quantity: 2 });
  const next = await add(reopened);
  assert.ok(Number(next.displayId.split('-').at(-1)) > Number(saved.displayId.split('-').at(-1)));
});

test('new sale identifiers and creation time are assigned by the server, not trusted from a client payload', async t => {
  const f = fixture(t);
  const store = f.make();
  await store.initialize();
  await trackedItem(store);
  const saved = await add(store, { ...saleData(), id: 'client-selected-id', displayId: 'AURA-999999999', createdAt: 1 });
  assert.notEqual(saved.id, 'client-selected-id');
  assert.notEqual(saved.displayId, 'AURA-999999999');
  assert.ok(saved.createdAt > 1);
  assert.equal(saved.source, 'POS');
});

test('live VACUUM INTO backup contains acknowledged WAL data and is independently readable', async t => {
  const f = fixture(t);
  const store = f.make();
  await store.initialize();
  await trackedItem(store);
  const saved = await add(store);
  assert.ok(fs.statSync(path.join(f.dataDir, 'aura.sqlite-wal')).size > 0);
  const backupPath = await store.createBackup();
  assert.equal(typeof backupPath, 'string');
  assert.ok(fs.statSync(backupPath).size > 0);
  const copyFixture = fixture(t);
  fs.copyFileSync(backupPath, path.join(copyFixture.dataDir, 'aura.sqlite'));
  const copy = copyFixture.make();
  await copy.initialize();
  await assertDurableSettings(copy.prisma);
  const orders = await copy.dispatch('orders.list');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, saved.id);
  assert.equal((await copy.dispatch('inventory.get')).stockList[0].quantity, 4);
});

test('only the last seven validated backup files remain, with no published partial snapshots', async t => {
  const f = fixture(t);
  const store = f.make();
  await store.initialize();
  const made = [];
  for (let index = 0; index < 9; index++) {
    made.push(await store.createBackup());
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  const names = fs.readdirSync(path.join(f.dataDir, 'backups'));
  assert.equal(names.filter(name => name.endsWith('.sqlite')).length, 7);
  assert.equal(names.some(name => name.includes('.partial')), false);
  assert.equal(fs.existsSync(made[0]), false);
  assert.equal(fs.existsSync(made[1]), false);
  assert.ok(made.slice(2).every(file => fs.existsSync(file)));
});

test('physical corruption skips a damaged newest backup, restores an older valid one and preserves a visible notice', async t => {
  const f = fixture(t);
  const original = f.make();
  await original.initialize();
  await trackedItem(original);
  const first = await add(original);
  await original.createBackup();
  await add(original);
  const newest = await original.createBackup();
  fs.writeFileSync(newest, Buffer.from('Damaged backup fixture'));
  await original.checkpointAndClose();
  corruptClosedDatabase(f.dataDir);
  const recovered = f.make();
  await recovered.initialize();
  const state = await recovered.dispatch('bootstrap');
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].id, first.id);
  assert.ok(state.notices.some(notice => notice.code === 'DATABASE_RESTORED' && notice.id && notice.message));
  assert.ok(fs.readdirSync(f.dataDir).some(name => name.startsWith('aura.sqlite.corrupt-')));
  await assertDurableSettings(recovered.prisma);
  await recovered.checkpointAndClose();
  const again = f.make();
  await again.initialize();
  assert.ok((await again.dispatch('bootstrap')).notices.some(notice => notice.code === 'DATABASE_RESTORED'));
});

test('corruption without a valid backup remains a classified failure on repeated startup, never a blank replacement', async t => {
  const f = fixture(t);
  const original = f.make();
  await original.initialize();
  await trackedItem(original);
  await add(original);
  await original.checkpointAndClose();
  corruptClosedDatabase(f.dataDir);
  for (let attempt = 0; attempt < 2; attempt++) {
    const broken = f.make();
    await assert.rejects(broken.initialize(), error => error.code === 'DATABASE_CORRUPT_NO_BACKUP');
    const db = path.join(f.dataDir, 'aura.sqlite');
    if (fs.existsSync(db)) assert.notEqual(fs.readFileSync(db).subarray(0, 16).toString(), 'SQLite format 3\0');
  }
  assert.ok(fs.readdirSync(f.dataDir).some(name => name.startsWith('aura.sqlite.corrupt-')));
});

test('a failed migration rolls its DDL/data back and leaves existing orders usable', async t => {
  const f = fixture(t);
  const original = f.make();
  await original.initialize();
  await trackedItem(original);
  const saved = await add(original);
  await original.checkpointAndClose();
  const migrationsDir = migrationFixture(f.dataDir);
  const failingName = '99999999999999_deliberate_failure';
  const failing = path.join(migrationsDir, failingName);
  fs.mkdirSync(failing);
  fs.writeFileSync(path.join(failing, 'migration.sql'), 'CREATE TABLE "MustRollback" ("value" TEXT); INSERT INTO "MustRollback" VALUES (\'test\'); THIS IS INVALID SQL;\n');
  const broken = f.make({ migrationsDir });
  await assert.rejects(broken.initialize(), error => error.code === 'MIGRATION_FAILED');
  const reopened = f.make();
  await reopened.initialize();
  assert.deepEqual(await reopened.prisma.$queryRawUnsafe('SELECT name FROM sqlite_master WHERE name = ?', 'MustRollback'), []);
  assert.deepEqual(await reopened.prisma.$queryRawUnsafe('SELECT name FROM "_LocalMigrations" WHERE name = ?', failingName), []);
  assert.equal((await reopened.dispatch('orders.list'))[0].id, saved.id);
});

test('changed migration checksum and an explicitly missing migration directory fail clearly', async t => {
  const f = fixture(t);
  const original = f.make();
  await original.initialize();
  await original.checkpointAndClose();
  const migrationsDir = migrationFixture(f.dataDir);
  const firstDir = fs.readdirSync(migrationsDir, { withFileTypes: true }).find(entry => entry.isDirectory());
  fs.appendFileSync(path.join(migrationsDir, firstDir.name, 'migration.sql'), '\n-- deliberate checksum fixture\n');
  await assert.rejects(f.make({ migrationsDir }).initialize(), error => error.code === 'MIGRATION_CHECKSUM_MISMATCH');
  await assert.rejects(f.make({ migrationsDir: path.join(f.dataDir, 'does-not-exist') }).initialize(), error => error.code === 'MIGRATIONS_NOT_FOUND');
});

test('migration splitter preserves semicolons inside SQL literals and comments', async t => {
  const f = fixture(t);
  const migrationsDir = migrationFixture(f.dataDir);
  const next = path.join(migrationsDir, '99999999999998_quoted_literal');
  fs.mkdirSync(next);
  fs.writeFileSync(path.join(next, 'migration.sql'), 'CREATE TABLE "SqlLiteral" ("value" TEXT);\n-- a comment containing ; is not a statement\nINSERT INTO "SqlLiteral" VALUES (\'semi;with\'\'quote\');\n');
  const store = f.make({ migrationsDir });
  await store.initialize();
  assert.deepEqual(await store.prisma.$queryRawUnsafe('SELECT value FROM "SqlLiteral"'), [{ value: "semi;with'quote" }]);
});

test('negative weight or recipe consumption cannot increase stock, and fulfillment replay is a no-op', { timeout: 15000 }, async t => {
  const f = fixture(t);
  const store = f.make();
  await store.initialize();
  await trackedItem(store, { quantity: 3 });
  const negativeWeight = saleData();
  negativeWeight.items[0] = { ...negativeWeight.items[0], isWeightBased: true, weight: -1 };
  await assert.rejects(add(store, negativeWeight), error => error.code.startsWith('INVALID_'));
  await assert.rejects(store.dispatch('inventory.registerMenu', { items: [{ id: 'invalid-recipe', recipe: [{ inventoryItemId: 'tracked-item', quantity: -1 }] }] }), error => error.code.startsWith('INVALID_'));
  assert.equal((await store.dispatch('inventory.get')).stockList[0].quantity, 3);
  const saved = await add(store);
  await store.dispatch('inventory.fulfillOrder', { orderId: saved.id });
  await store.dispatch('inventory.fulfillOrder', { orderId: saved.id });
  assert.equal((await store.dispatch('inventory.get')).stockList[0].quantity, 2);
});

test('data directory with Arabic, spaces and # uses the intended physical SQLite file', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Aura ملفات # '));
  const f = fixture(t, dataDir);
  const store = f.make();
  await store.initialize();
  await trackedItem(store);
  await add(store);
  assert.ok(fs.statSync(path.join(dataDir, 'aura.sqlite')).size > 0);
  await assertDurableSettings(store.prisma);
  const backup = await store.createBackup();
  assert.ok(backup.startsWith(path.join(dataDir, 'backups')));
});

test('two processes can initialize the same empty database without a spurious failed migration', { timeout: 90000 }, async t => {
  const dataDir = tempDataDir();
  const children = [];
  t.after(async () => { for (const child of children) await child.kill(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const starts = await Promise.allSettled([0, 1].map(async () => { const child = await startStorageChild(dataDir); children.push(child); }));
  const failed = starts.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  assert.equal(children.length, 2);
  for (const child of children) assert.deepEqual(await child.dispatch('orders.list'), []);
});

test('storage log rotation is bounded and does not record untrusted action text or customer payloads', async t => {
  const f = fixture(t);
  const store = f.make();
  await store.initialize();
  const sensitive = `do-not-log-${randomUUID()}`;
  const results = await Promise.allSettled(Array.from({ length: 2100 }, () => store.dispatch(`unknown-${sensitive}`, { customer: { phone: sensitive }, secret: sensitive })));
  assert.ok(results.every(result => result.status === 'rejected'));
  const current = path.join(f.dataDir, 'local-store.log');
  const previous = `${current}.1`;
  assert.ok(fs.existsSync(previous));
  assert.ok(fs.statSync(current).size <= 129 * 1024);
  assert.ok(fs.statSync(previous).size <= 129 * 1024);
  assert.equal(fs.readFileSync(current, 'utf8').includes(sensitive), false);
  assert.equal(fs.readFileSync(previous, 'utf8').includes(sensitive), false);
});


test('an interrupted recovery marker resumes from a valid snapshot instead of blocking forever or creating an empty DB', async t => {
  const f = fixture(t);
  const original = f.make();
  await original.initialize();
  await trackedItem(original);
  const saved = await add(original);
  await original.createBackup();
  await original.checkpointAndClose();
  fs.renameSync(path.join(f.dataDir, 'aura.sqlite'), path.join(f.dataDir, 'aura.sqlite.corrupt-interrupted-fixture'));
  fs.writeFileSync(path.join(f.dataDir, 'recovery-required.json'), '{"code":"DATABASE_RECOVERY_REQUIRED"}\n');
  const resumed = f.make();
  await resumed.initialize();
  assert.equal((await resumed.dispatch('orders.list'))[0].id, saved.id);
  assert.equal(fs.existsSync(path.join(f.dataDir, 'recovery-required.json')), false);
  await assertDurableSettings(resumed.prisma);
});

test('the same request replayed concurrently by two independent processes creates one physical order', { timeout: 90000 }, async t => {
  const dataDir = tempDataDir();
  const setup = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await setup.initialize();
  await trackedItem(setup, { quantity: 3 });
  await setup.checkpointAndClose();
  const children = [];
  t.after(async () => { for (const child of children) await child.kill(); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  for (let index = 0; index < 2; index++) children.push(await startStorageChild(dataDir));
  const data = saleData({ requestId: randomUUID() });
  const [left, right] = await Promise.all(children.map(child => add(child, data)));
  assert.equal(left.id, right.id);
  assert.ok(left._isReplay || right._isReplay);
  assert.equal((await children[0].dispatch('orders.list')).length, 1);
  assert.equal((await children[1].dispatch('inventory.get')).stockList[0].quantity, 2);
});
