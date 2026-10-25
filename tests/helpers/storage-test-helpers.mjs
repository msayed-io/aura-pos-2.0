import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
export const { createLocalStore, StoreError } = require('../../local-services/store.cjs');
export const { PrismaClient } = require('@prisma/client');
export const tempDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aura-storage-real-'));
export const databaseUrl = (dir) => `file:${path.join(dir, 'aura.sqlite').replace(/\\/g, '/')}?connection_limit=1`;

export function saleData({ itemId = 'tracked-item', quantity = 1, price = 10, couponCode, discount = 0, requestId = randomUUID() } = {}) {
  return {
    items: [{ id: itemId, name: 'صنف اختبار', quantity, price, notes: 'اختبار ديمومة' }],
    customer: { name: 'اختبار محلي', phone: '-', address: '-' },
    status: 'Order Received',
    summary: { subtotal: quantity * price, deliveryFee: 0, discount, total: quantity * price - discount },
    deliveryMethod: 'pickup', paymentMethod: 'cash', _source: 'POS',
    _requestId: requestId, ...(couponCode ? { couponCode } : {}),
  };
}

export async function trackedItem(store, { id = 'tracked-item', quantity = 5, recipe, requiresSerial = false } = {}) {
  await store.dispatch('inventory.saveStock', {
    stock: { id, name: 'مخزون اختبار', quantity, type: 'PRODUCT', unit: 'PIECE', costPerUnit: 3, lowStockThreshold: 1 },
  });
  const item = { id, name: 'صنف اختبار', description: '', price: 10, image: '', primaryCategory: 'tests', isActive: true, recipe, requiresSerial };
  await store.dispatch('menu.saveItem', { itemData: item });
  await store.dispatch('inventory.registerMenu', { items: [item] });
  return item;
}

export function firstPragma(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0, 'PRAGMA must return a real SQLite row');
  return Object.values(rows[0])[0];
}

export async function assertDurableSettings(client) {
  const expected = { journal_mode: 'wal', synchronous: 2, foreign_keys: 1, busy_timeout: 5000, quick_check: 'ok' };
  for (const [name, value] of Object.entries(expected)) {
    const actual = firstPragma(await client.$queryRawUnsafe(`PRAGMA ${name}`));
    if (typeof value === 'number') assert.equal(Number(actual), value, name);
    else assert.equal(String(actual).toLowerCase(), value, name);
  }
}

export async function startStorageChild(dataDir) {
  const child = fork(path.join(root, 'tests/fixtures/storage-child.cjs'), [dataDir], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'advanced',
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk.toString()).slice(-6000); });
  const pending = new Map();
  let nextId = 0;
  let exited = false;
  let resolveExit;
  const exit = new Promise(resolve => { resolveExit = resolve; });
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const readyTimer = setTimeout(() => readyReject(new Error(`Storage child startup timed out: ${output}`)), 30000);
  child.on('message', message => {
    if (message.ready) { clearTimeout(readyTimer); readyResolve(); return; }
    if (message.fatal) {
      clearTimeout(readyTimer);
      readyReject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.ok) request.resolve(message.data);
    else request.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
  });
  child.on('error', error => { clearTimeout(readyTimer); readyReject(error); });
  child.on('exit', (code, signal) => {
    exited = true;
    clearTimeout(readyTimer);
    readyReject(new Error(`Storage child exited before readiness (${code}/${signal}): ${output}`));
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(`Storage child exited during operation (${code}/${signal}): ${output}`));
    }
    pending.clear();
    resolveExit({ code, signal });
  });
  const call = (operation, fields = {}) => new Promise((resolve, reject) => {
    if (exited || !child.connected) return reject(new Error('Storage child is not running'));
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Storage operation timed out: ${operation}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    child.send({ id, operation, ...fields });
  });
  const forceStop = async () => {
    if (!exited) child.kill('SIGKILL');
    await exit;
  };
  try { await ready; } catch (error) { await forceStop(); throw error; }
  return {
    pid: child.pid,
    dispatch: (action, payload) => call('dispatch', { action, payload }),
    settings: () => call('settings'),
    kill: forceStop,
    close: async () => { if (!exited) await call('close'); await exit; },
  };
}
