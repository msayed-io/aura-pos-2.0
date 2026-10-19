/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { request } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let mainWindow;
let serverProcess;
let serverPort;

const isDev = !app.isPackaged;
const serverRoot = isDev
  ? path.join(__dirname, '..', '.next', 'standalone')
  : path.join(process.resourcesPath, 'app', '.next', 'standalone');
const serverEntry = path.join(serverRoot, 'server.js');
const settingsPath = path.join(app.getPath('userData'), 'printer-settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return settings;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = request({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
      req.end();
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('Next.js local server did not become ready'));
      setTimeout(check, 250);
    };
    check();
  });
}

function startNextServer() {
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Next.js standalone server was not found: ${serverEntry}`);
  }
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    windowsHide: true,
    stdio: isDev ? 'inherit' : 'ignore',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(serverPort),
    },
  });
  serverProcess.on('exit', (code) => {
    if (code && !app.isQuitting) console.error(`Local Next.js server exited with code ${code}`);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function invoiceHtml(order, type) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const rows = items.map((item) => `
    <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.price)}</td><td>${escapeHtml((Number(item.quantity) || 0) * (Number(item.price) || 0))}</td></tr>
  `).join('');
  const title = type === 'kitchen' ? 'مطبخ Aura POS' : type === 'delivery' ? 'فاتورة توصيل Aura POS' : 'فاتورة Aura POS';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { margin: 0; } body { width: 72mm; margin: 0 auto; padding: 4mm; font-family: Arial, sans-serif; font-size: 11px; color: #111; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 8px; } p { margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; } th, td { border-bottom: 1px dashed #777; padding: 4px 2px; text-align: right; }
    .total { font-weight: bold; font-size: 14px; margin-top: 10px; }
  </style></head><body>
    <h1>${title}</h1><p>رقم الطلب: ${escapeHtml(order?.id)}</p><p>${new Date(order?.timestamp || Date.now()).toLocaleString('ar-EG')}</p>
    <table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="total">الإجمالي: ${escapeHtml(order?.totalPrice)} جنيه</p><p style="text-align:center;margin-top:16px">شكرًا لزيارتكم</p>
  </body></html>`;
}

async function silentPrint({ printer, data, type }) {
  if (!printer) throw new Error('A printer name is required');
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

function registerIpc() {
  ipcMain.handle('printers:get', async () => mainWindow.webContents.getPrintersAsync());
  ipcMain.handle('printer-settings:load', () => readSettings());
  ipcMain.handle('printer-settings:save', (_event, settings) => writeSettings(settings));
  ipcMain.handle('print:invoice', (_event, args) => silentPrint(args));
  ipcMain.handle('notification:show', (_event, { title, body }) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });
}

async function createWindow() {
  serverPort = await findFreePort();
  startNextServer();
  await waitForServer(serverPort);
  mainWindow = new BrowserWindow({
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
  registerIpc();
  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
