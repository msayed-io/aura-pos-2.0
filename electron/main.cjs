/* eslint-disable @typescript-eslint/no-require-imports -- Electron main is CommonJS. */
'use strict';

const {
  app, BrowserWindow, ipcMain, Notification, utilityProcess, dialog,
  Menu, Tray, powerMonitor,
} = require('electron');
const { createServer } = require('node:net');
const { request } = require('node:http');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { UtilityServiceSupervisor } = require('./service-supervisor.cjs');
const { installCloseToTray } = require('./window-lifecycle.cjs');
const { acquireSingleInstance } = require('./single-instance.cjs');

let mainWindow;
let windowCreationPromise;
let serverProcess;
let serverExitPromise;
let serverExited = true;
let serverPort;
let serverReady = false;
let serverShutdownToken;
let tray;
let serviceSupervisor;
let serviceState = 'idle';
let closeNoticeShown = false;
let ipcRegistered = false;
let appIsQuitting = false;
let shutdownComplete = false;
let shutdownPromise;
let focusRequestedBeforeReady = false;

const hasSingleInstanceLock = acquireSingleInstance(app, () => {
  if (!mainWindow || mainWindow.isDestroyed()) focusRequestedBeforeReady = true;
  void showMainWindow().catch(error => report('SECOND_INSTANCE_FOCUS_FAILED', error));
});
if (!hasSingleInstanceLock) app.quit();

const isDev = !app.isPackaged;
const serverRoot = isDev
  ? path.join(__dirname, '..', '.next', 'standalone')
  : path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone');
const serverEntry = path.join(serverRoot, 'server.js');
const dataDir = app.getPath('userData');
const settingsPath = path.join(dataDir, 'printer-settings.json');
const serviceEntry = path.join(__dirname, 'whatsapp-service.cjs');
const trayIconPath = path.join(__dirname, 'aura-icon.ico');

function report(code, error) {
  const errorCode = error && typeof error === 'object' ? error.code || error.name : undefined;
  console.error(JSON.stringify({ component: 'electron-main', code, ...(errorCode ? { errorCode: String(errorCode).slice(0, 48) } : {}) }));
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') report('PRINTER_SETTINGS_READ_FAILED', error);
    return null;
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
  return settings;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const retry = () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) return finish(new Error('LOCAL_SERVER_TIMEOUT'));
      clearTimeout(timer);
      timer = setTimeout(check, 250);
    };
    const check = () => {
      const req = request({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, res => {
        let body = '';
        res.on('data', chunk => { if (body.length < 8192) body += chunk.toString(); });
        res.on('error', retry);
        res.on('end', () => {
          let health;
          try { health = JSON.parse(body); } catch { return retry(); }
          if (res.statusCode === 200 && health.status === 'ok' && health.database === 'ready') return finish();
          if (health.error?.code) return finish(new Error(`LOCAL_DATABASE_${String(health.error.code).slice(0, 48)}`));
          retry();
        });
      });
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
      req.end();
    };
    check();
  });
}

function startNextServer() {
  if (!fs.existsSync(serverEntry)) throw new Error('NEXT_STANDALONE_SERVER_NOT_FOUND');
  fs.mkdirSync(dataDir, { recursive: true });
  serverPort = serverPort || 0;
  serverShutdownToken = randomBytes(32).toString('hex');
  const databaseUrl = `file:${path.join(dataDir, 'aura.sqlite').replace(/\\/g, '/')}?connection_limit=1`;
  const child = utilityProcess.fork(serverEntry, [], {
    cwd: serverRoot,
    serviceName: 'Aura Local POS Server',
    windowsHide: true,
    stdio: isDev ? 'inherit' : 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(serverPort),
      AURA_DATA_DIR: dataDir,
      AURA_MIGRATIONS_DIR: path.join(serverRoot, 'prisma', 'migrations'),
      AURA_INTERNAL_SHUTDOWN_TOKEN: serverShutdownToken,
      DATABASE_URL: databaseUrl,
    },
  });
  serverProcess = child;
  serverExited = false;
  serverReady = false;
  serverExitPromise = new Promise(resolve => child.once('exit', code => resolve({ code })));
  child.on('error', (type) => report('LOCAL_SERVER_PROCESS_ERROR', { name: String(type || 'UNKNOWN') }));
  child.on('exit', code => {
    if (serverProcess !== child) return;
    serverExited = true;
    serverReady = false;
    serverShutdownToken = undefined;
    if (code && !appIsQuitting) report('LOCAL_SERVER_EXITED', { code });
  });
}

async function ensureLocalServer() {
  if (serverReady && serverProcess && !serverExited) return;
  if (!serverProcess || serverExited) {
    serverPort = await findFreePort();
    startNextServer();
  }
  await waitForServer(serverPort);
  serverReady = true;
}

function waitForExit(child, exitPromise, timeoutMs) {
  if (!child || !exitPromise) return Promise.resolve({ exited: true });
  let timer;
  return Promise.race([
    exitPromise.then(result => ({ exited: true, ...result })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ exited: false }), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

function postLocalServerShutdown() {
  if (!serverProcess || serverExited || !serverPort || !serverShutdownToken) return Promise.resolve(false);
  const expectedOrigin = `http://127.0.0.1:${serverPort}`;
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/internal/shutdown',
      method: 'POST',
      timeout: 5000,
      headers: {
        Origin: expectedOrigin,
        Authorization: `Bearer ${serverShutdownToken}`,
        'Content-Length': '0',
        Connection: 'close',
      },
    }, res => {
      let body = '';
      res.on('data', chunk => { if (body.length < 2048) body += chunk.toString(); });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(true);
        else reject(new Error(`LOCAL_SERVER_SHUTDOWN_HTTP_${res.statusCode || 0}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('LOCAL_SERVER_SHUTDOWN_TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function invoiceHtml(order, type) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const rows = items.map(item => `
    <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.price)}</td><td>${escapeHtml((Number(item.quantity) || 0) * (Number(item.price) || 0))}</td></tr>
  `).join('');
  const title = type === 'kitchen' ? 'مطبخ Aura POS' : type === 'delivery' ? 'فاتورة توصيل Aura POS' : 'فاتورة Aura POS';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { margin: 0; } body { width: 72mm; margin: 0 auto; padding: 4mm; font-family: Arial, sans-serif; font-size: 11px; color: #111; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 8px; } p { margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; } th, td { border-bottom: 1px dashed #777; padding: 4px 2px; text-align: right; }
    .total { font-weight: bold; font-size: 14px; margin-top: 10px; }
  </style></head><body>
    <h1>${title}</h1><p>رقم الطلب: ${escapeHtml(order?.id)}</p><p>${new Date(order?.timestamp || order?.createdAt || Date.now()).toLocaleString('ar-EG')}</p>
    <table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="total">الإجمالي: ${escapeHtml(order?.totalPrice ?? order?.summary?.total)} جنيه</p><p style="text-align:center;margin-top:16px">شكرًا لزيارتكم</p>
  </body></html>`;
}

async function silentPrint({ printer, data, type }) {
  if (typeof printer !== 'string' || !printer.trim()) throw new Error('A printer name is required');
  if (!data || typeof data !== 'object' || !Array.isArray(data.items) || !['kitchen', 'delivery', 'dine_in'].includes(type)) throw new Error('Invalid print request');
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(invoiceHtml(data, type))}`);
    await new Promise((resolve, reject) => {
      printWindow.webContents.print({ silent: true, printBackground: true, deviceName: printer }, (success, failureReason) => {
        if (success) resolve();
        else reject(new Error(failureReason || 'Silent printing failed'));
      });
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
}

function assertTrustedIpc(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('UNTRUSTED_IPC_SENDER');
  }
  let origin;
  try { origin = new URL(event.senderFrame.url).origin; } catch { throw new Error('UNTRUSTED_IPC_ORIGIN'); }
  if (origin !== `http://127.0.0.1:${serverPort}`) throw new Error('UNTRUSTED_IPC_ORIGIN');
}

function showNewOrderNotification(displayId) {
  if (typeof displayId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(displayId) || !Notification.isSupported()) return false;
  const notification = new Notification({ title: 'طلب جديد — Aura POS', body: `تم حفظ الطلب ${displayId}.` });
  notification.once('click', () => { void showMainWindow().catch(error => report('ORDER_NOTIFICATION_OPEN_FAILED', error)); });
  notification.show();
  return true;
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle('printers:get', event => { assertTrustedIpc(event); return mainWindow.webContents.getPrintersAsync(); });
  ipcMain.handle('printer-settings:load', event => { assertTrustedIpc(event); return readSettings(); });
  ipcMain.handle('printer-settings:save', (event, settings) => {
    assertTrustedIpc(event);
    if (!settings || typeof settings.cashierPrinter !== 'string' || typeof settings.kitchenPrinter !== 'string'
      || settings.cashierPrinter.length > 200 || settings.kitchenPrinter.length > 200) throw new Error('INVALID_PRINTER_SETTINGS');
    return writeSettings(settings);
  });
  ipcMain.handle('print:invoice', (event, args) => { assertTrustedIpc(event); return silentPrint(args); });
  ipcMain.handle('notification:show', (event, payload) => {
    assertTrustedIpc(event);
    if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string') throw new Error('INVALID_NOTIFICATION');
    if (Notification.isSupported()) new Notification({ title: payload.title.slice(0, 120), body: payload.body.slice(0, 400) }).show();
  });
  ipcMain.handle('orders:new-notification', (event, displayId) => {
    assertTrustedIpc(event);
    if (typeof displayId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(displayId)) throw new Error('INVALID_ORDER_DISPLAY_ID');
    return showNewOrderNotification(displayId);
  });
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return Promise.resolve();
  }
  if (windowCreationPromise) return windowCreationPromise;
  return createWindow();
}

async function createWindow() {
  if (windowCreationPromise) return windowCreationPromise;
  windowCreationPromise = (async () => {
    await ensureLocalServer();
    const window = new BrowserWindow({
      width: 1440,
      height: 1000,
      minWidth: 1024,
      minHeight: 700,
      show: false,
      backgroundColor: '#f8fafc',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow = window;
    registerIpc();
    installCloseToTray(window, {
      isQuitting: () => appIsQuitting,
      onHidden: () => {
      if (!closeNoticeShown) {
        closeNoticeShown = true;
        if (Notification.isSupported()) new Notification({ title: 'Aura POS', body: 'سيستمر البرنامج بالعمل في الخلفية. اختر «إنهاء البرنامج» من رمز النظام لإغلاقه بالكامل.' }).show();
      }
      },
    });
    window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.once('ready-to-show', () => {
      if (appIsQuitting) return;
      window.show();
      if (focusRequestedBeforeReady) {
        focusRequestedBeforeReady = false;
        window.focus();
      }
    });
    await window.loadURL(`http://127.0.0.1:${serverPort}`);
  })().finally(() => { windowCreationPromise = null; });
  return windowCreationPromise;
}

function currentWhatsAppLabel() {
  const labels = {
    idle: 'غير متصل — الخدمة جاهزة',
    connecting: 'جارٍ تجهيز الخدمة',
    paused: 'متوقف مؤقتاً',
    qr: 'بانتظار مسح QR',
    connected: 'متصل',
    reconnecting: 'يعيد الاتصال',
    'needs-attention': 'يحتاج إلى تدخل',
    stopping: 'جارٍ الإيقاف',
    stopped: 'متوقف',
  };
  return labels[serviceState] || 'غير متصل';
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: 'فتح Aura POS', click: () => { void showMainWindow().catch(error => report('TRAY_OPEN_FAILED', error)); } },
    { label: `حالة WhatsApp: ${currentWhatsAppLabel()}`, enabled: false },
    { type: 'separator' },
    { label: 'إنهاء البرنامج', click: () => { appIsQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  if (tray && !tray.isDestroyed()) return;
  if (!fs.existsSync(trayIconPath)) throw new Error('TRAY_ICON_NOT_FOUND');
  tray = new Tray(trayIconPath);
  tray.setToolTip('Aura POS');
  tray.on('double-click', () => { void showMainWindow().catch(error => report('TRAY_OPEN_FAILED', error)); });
  tray.on('click', () => { void showMainWindow().catch(error => report('TRAY_OPEN_FAILED', error)); });
  updateTrayMenu();
}

async function shutdownAll() {
  if (serviceSupervisor) {
    try { await serviceSupervisor.stop(); }
    catch (error) { report('WHATSAPP_SERVICE_STOP_FAILED', error); }
  }
  if (serverProcess && !serverExited) {
    let checkpointed = false;
    try {
      checkpointed = await postLocalServerShutdown();
    } catch (error) {
      report('DATABASE_CHECKPOINT_REQUEST_FAILED', error);
    }
    const child = serverProcess;
    if (!checkpointed) report('DATABASE_CHECKPOINT_UNCONFIRMED', new Error('DATABASE_CHECKPOINT_UNCONFIRMED'));
    try { child.kill(); } catch (error) { report('LOCAL_SERVER_KILL_FAILED', error); }
    const result = await waitForExit(child, serverExitPromise, 3000);
    if (!result.exited) report('LOCAL_SERVER_EXIT_UNCONFIRMED', new Error('LOCAL_SERVER_EXIT_UNCONFIRMED'));
  }
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.aura.pos');
    createTray();
    serviceSupervisor = new UtilityServiceSupervisor({ utilityProcess, app, entry: serviceEntry, serviceName: 'Aura WhatsApp Service' });
    serviceSupervisor.on('status', snapshot => { serviceState = snapshot.state; updateTrayMenu(); });
    serviceSupervisor.on('memory-limit', () => { serviceState = 'reconnecting'; updateTrayMenu(); });
    serviceSupervisor.on('new-order', ({ displayId }) => { showNewOrderNotification(displayId); });
    serviceSupervisor.start();
    powerMonitor.on('suspend', () => { serviceSupervisor?.command('suspend'); });
    powerMonitor.on('resume', () => {
      serviceSupervisor?.command('resume');
      if (serverProcess && !serverExited) {
        serverReady = false;
        void waitForServer(serverPort).then(() => { serverReady = true; }).catch(error => report('LOCAL_SERVER_RESUME_FAILED', error));
      }
    });
    powerMonitor.on('shutdown', () => { appIsQuitting = true; app.quit(); });
    await createWindow();
    if (focusRequestedBeforeReady) await showMainWindow();
  }).catch(error => {
    report('STARTUP_FAILED', error);
    dialog.showErrorBox('تعذر تشغيل Aura POS', error instanceof Error ? error.message : 'تعذر تجهيز التطبيق المحلي.');
    app.quit();
  });

  app.on('activate', () => { void showMainWindow().catch(error => report('ACTIVATE_FAILED', error)); });
  app.on('window-all-closed', () => { /* Intentionally resident; exit is available only from the Tray menu. */ });
}

app.on('before-quit', event => {
  appIsQuitting = true;
  app.isQuitting = true;
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownPromise) return;
  shutdownPromise = shutdownAll().catch(error => report('SHUTDOWN_FAILED', error)).finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});

app.on('will-quit', () => {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
});
