import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.join(root, '.next/standalone');
const serverEntry = path.join(serverRoot, 'server.js');
assert.ok(fs.existsSync(serverEntry), 'Run npm run build before this real standalone test.');
assert.ok(fs.existsSync(path.join(serverRoot, 'prisma/migrations')), 'Standalone must contain committed SQL migrations.');
for (const forbidden of ['docs', 'tests', 'agent-ctx', 'mini-services', 'electron', '.git', '.env', '.env.local', '.env.production.local']) {
  assert.equal(fs.existsSync(path.join(serverRoot, forbidden)), false, `Unexpected repository/private input in standalone: ${forbidden}`);
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-standalone-real-'));
const shutdownToken = randomBytes(32).toString('hex');
let server;
let serverExit;
let serverOutput = '';
let base;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function start() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  serverOutput = '';
  server = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    env: {
      ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
      AURA_DATA_DIR: dataDir,
      AURA_MIGRATIONS_DIR: path.join(serverRoot, 'prisma/migrations'),
      AURA_INTERNAL_SHUTDOWN_TOKEN: shutdownToken,
      DATABASE_URL: `file:${path.join(dataDir, 'aura.sqlite').replace(/\\/g, '/')}?connection_limit=1`,
    },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-12000); });
  serverExit = once(server, 'exit');
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Standalone exited during startup: ${serverOutput}`);
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
      const body = await response.json();
      if (response.ok && body.status === 'ok' && body.database === 'ready') return;
      if (body.error?.code) throw Object.assign(new Error(`Database startup failed: ${body.error.code}`), { fatal: true });
    } catch (error) {
      if (error.fatal) throw error;
      if (Date.now() >= deadline) throw error;
    }
    await delay(150);
  }
  throw new Error(`Standalone readiness timed out: ${serverOutput}`);
}

async function stopAbruptly() {
  if (!server) return;
  const pid = server.pid;
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
  await serverExit;
  assert.throws(() => process.kill(pid, 0), 'Standalone writer process must actually exit');
  server = undefined;
}

async function api(action, payload, origin = base, host) {
  const response = await fetch(`${base}/api/local-store`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin === null ? {} : { Origin: origin }), ...(host ? { Host: host } : {}) },
    body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, body: await response.json() };
}

try {
  await start();
  assert.ok(fs.statSync(path.join(dataDir, 'aura.sqlite')).size > 0);
  assert.equal((await api('bootstrap', {}, 'https://example.invalid')).status, 403);
  assert.equal((await api('bootstrap', {}, null)).status, 403);
  assert.equal((await api('bootstrap', {}, base.replace('127.0.0.1', 'localhost'))).status, 403);
  assert.equal((await api('bootstrap', {}, 'http://not-loopback.invalid:43139', 'not-loopback.invalid:43139')).status, 403);
  assert.equal((await api('bootstrap', {}, 'http://127.0.0.1:65535', '127.0.0.1:65535')).status, 403);
  const initial = await api('bootstrap', {});
  assert.equal(initial.status, 200);
  assert.equal(initial.body.ok, true);
  const initialOrderCount = initial.body.data.orders.length;
  const stock = { id: 'http-real-item', name: 'اختبار HTTP', type: 'PRODUCT', unit: 'PIECE', quantity: 2, costPerUnit: 3, lowStockThreshold: 0 };
  assert.equal((await api('inventory.saveStock', { stock })).status, 200);
  const item = { id: stock.id, name: stock.name, description: '', price: 10, image: '', primaryCategory: 'test', isActive: true };
  assert.equal((await api('menu.saveItem', { itemData: item })).status, 200);
  assert.equal((await api('inventory.registerMenu', { items: [item] })).status, 200);
  const requestId = randomUUID();
  const payload = { orderData: {
    items: [{ id: item.id, name: item.name, quantity: 1, price: 10, notes: 'حفظ حقيقي' }],
    customer: { name: 'اختبار محلي', phone: '-', address: '-' }, status: 'Delivered',
    summary: { subtotal: 10, deliveryFee: 0, discount: 0, total: 10 },
    deliveryMethod: 'delivery', paymentMethod: 'cash', _source: 'POS', _requestId: requestId,
  }, cashierId: 'http-test', cashierName: 'اختبار' };
  const sale = await api('orders.add', payload);
  assert.equal(sale.status, 200, JSON.stringify(sale.body));
  assert.equal(sale.body.ok, true);
  const saved = sale.body.data;
  assert.ok(saved.id && saved.displayId);
  assert.equal(saved.deliveryMethod, 'delivery');
  await stopAbruptly();
  await start();
  const reopened = await api('bootstrap', {});
  assert.equal(reopened.body.data.orders.length, initialOrderCount + 1);
  assert.ok(reopened.body.data.orders.some(order => order.id === saved.id));
  assert.equal(reopened.body.data.inventory.stockList.find(entry => entry.id === stock.id).quantity, 1);
  const replay = await api('orders.add', payload);
  assert.equal(replay.body.data.id, saved.id);
  assert.equal(replay.body.data._isReplay, true);
  assert.equal((await api('orders.list', {})).body.data.length, initialOrderCount + 1);
  assert.equal((await api('bootstrap', {})).body.data.inventory.stockList.find(entry => entry.id === stock.id).quantity, 1);
  const shutdownUrl = `${base}/api/internal/shutdown`;
  const denied = await fetch(shutdownUrl, { method: 'POST', headers: { Origin: base }, signal: AbortSignal.timeout(5000) });
  assert.equal(denied.status, 401, 'shutdown without the random session token must be rejected');
  const wrongOrigin = await fetch(shutdownUrl, { method: 'POST', headers: { Authorization: `Bearer ${shutdownToken}`, Origin: 'https://example.invalid' }, signal: AbortSignal.timeout(5000) });
  assert.equal(wrongOrigin.status, 403, 'shutdown from a non-loopback origin must be rejected even with a token');
  const noOrigin = await fetch(shutdownUrl, { method: 'POST', headers: { Authorization: `Bearer ${shutdownToken}` }, signal: AbortSignal.timeout(5000) });
  assert.equal(noOrigin.status, 403, 'shutdown without the exact Origin must be rejected even with a token');
  const checkpoint = await fetch(shutdownUrl, { method: 'POST', headers: { Authorization: `Bearer ${shutdownToken}`, Origin: base }, signal: AbortSignal.timeout(10000) });
  const checkpointBody = await checkpoint.json();
  assert.equal(checkpoint.status, 200, JSON.stringify(checkpointBody));
  assert.deepEqual(checkpointBody, { ok: true, status: 'checkpointed' });
  console.log('REAL STANDALONE STORAGE PASS: migrations/userData, same-origin rejection, HTTP order transaction, SIGKILL/restart, idempotent replay, protected WAL checkpoint.');
  console.log('Not a printer, Electron IPC, phone or WhatsApp/Gemini connection test.');
} finally {
  await stopAbruptly();
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
