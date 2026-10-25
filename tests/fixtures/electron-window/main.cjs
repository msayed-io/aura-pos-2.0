/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
const path = require('node:path');
const { createServer } = require('node:net');
const { app, BrowserWindow, utilityProcess } = require('electron');
const { installCloseToTray } = require('../../../electron/window-lifecycle.cjs');

const root = path.resolve(__dirname, '../../..');
const serverRoot = path.join(root, '.next', 'standalone');
const serverEntry = path.join(serverRoot, 'server.js');
const dataDir = process.env.AURA_ELECTRON_WINDOW_DATA_DIR;
const shutdownToken = process.env.AURA_ELECTRON_WINDOW_TOKEN;
const inheritedEnv = Object.fromEntries(
  ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'TZ', 'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR']
    .filter(name => process.env[name] !== undefined)
    .map(name => [name, process.env[name]]),
);
let server;
let window;
let hiddenEvents = 0;

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { probe.once('listening', resolve); probe.once('error', reject); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(base, exitPromise) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const result = await Promise.race([exitPromise.then(exit => ({ exited: true, code: exit.code })), fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1200) }).then(async response => ({ response, body: await response.json() })).catch(() => null)]);
    if (result?.exited) throw new Error(`standalone exited before health became ready (code=${result.code})`);
    if (result?.response?.ok && result.body.status === 'ok' && result.body.database === 'ready') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('standalone health timeout');
}

async function run() {
  if (!fsExists(serverEntry) || !dataDir || !shutdownToken) throw new Error('test inputs missing');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const db = path.join(dataDir, 'aura.sqlite').replace(/\\/g, '/');
  server = utilityProcess.fork(serverEntry, [], {
    cwd: serverRoot,
    serviceName: 'Aura Hidden Window Smoke Server',
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...inheritedEnv,
      NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
      AURA_DATA_DIR: dataDir,
      AURA_MIGRATIONS_DIR: path.join(serverRoot, 'prisma', 'migrations'),
      AURA_INTERNAL_SHUTDOWN_TOKEN: shutdownToken,
      DATABASE_URL: `file:${db}?connection_limit=1`,
    },
  });
  const exitPromise = new Promise(resolve => server.once('exit', code => resolve({ code })));
  await waitForHealth(base, exitPromise);
  window = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  installCloseToTray(window, { isQuitting: () => false, onHidden: () => { hiddenEvents += 1; } });
  let readyToShow = false;
  const readyToShowPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ready-to-show was not emitted')), 10000);
    window.once('ready-to-show', () => { readyToShow = true; clearTimeout(timer); resolve(); });
  });
  await window.loadURL(base);
  await readyToShowPromise;
  window.show();
  const visibleBefore = window.isVisible();
  window.close();
  await new Promise(resolve => setTimeout(resolve, 100));
  const hiddenAfterClose = !window.isVisible();
  const destroyedAfterClose = window.isDestroyed();
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
  const healthBody = await health.json();
  const shutdown = await fetch(`${base}/api/internal/shutdown`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${shutdownToken}`, Origin: base },
    signal: AbortSignal.timeout(10000),
  });
  const shutdownBody = await shutdown.json();
  if (!shutdown.ok || !shutdownBody.ok) throw new Error(`checkpoint failed: HTTP ${shutdown.status}`);
  server.kill();
  const exit = await Promise.race([exitPromise, new Promise(resolve => setTimeout(() => resolve(null), 5000))]);
  if (!exit) throw new Error('standalone did not exit after utilityProcess kill');
  const report = { ok: true, readyToShow, visibleBefore, hiddenAfterClose, destroyedAfterClose, hiddenEvents, healthStatus: health.status, healthDatabase: healthBody.database, checkpointStatus: shutdown.status, serverExitCode: exit.code };
  process.stdout.write(`WINDOW_SERVER_RESULT ${JSON.stringify(report)}\n`);
  if (window && !window.isDestroyed()) window.destroy();
  app.exit(0);
}

function fsExists(file) { try { return require('node:fs').existsSync(file); } catch { return false; } }

app.whenReady().then(() => run().catch(async error => {
  process.stdout.write(`WINDOW_SERVER_RESULT ${JSON.stringify({ ok: false, error: error.message })}\n`);
  if (server && !server.isDestroyed?.()) {
    try { server.kill(); } catch {}
  }
  if (window && !window.isDestroyed()) window.destroy();
  app.exit(1);
}));
