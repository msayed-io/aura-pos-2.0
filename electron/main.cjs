/* eslint-disable @typescript-eslint/no-require-imports -- Electron main is CommonJS. */
'use strict';

const {
  app, BrowserWindow, ipcMain, Notification, utilityProcess, dialog,
  Menu, Tray, powerMonitor, safeStorage,
} = require('electron');
const { createServer } = require('node:net');
const { request } = require('node:http');
const { randomBytes, createHmac } = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const { UtilityServiceSupervisor } = require('./service-supervisor.cjs');
const { installCloseToTray } = require('./window-lifecycle.cjs');
const { acquireSingleInstance } = require('./single-instance.cjs');
const { isDirectJid } = require('./whatsapp-messaging.cjs');

let mainWindow;
let windowCreationPromise;
let serverProcess;
let serverExitPromise;
let serverExited = true;
let serverPort;
let serverReady = false;
let serverShutdownToken;
let serverWhatsAppToken;
let conversationHashKey;
let tray;
let mainWindowShowEvents = 0;
let lastWhatsAppServiceErrorCode = null;
let whatsAppSupervisorLogCodes = [];
let serviceSupervisor;
let serviceState = 'idle';
let whatsappQr = null;
let closeNoticeShown = false;
let ipcRegistered = false;
let appIsQuitting = false;
let shutdownComplete = false;
let shutdownPromise;
let focusRequestedBeforeReady = false;
let replyFlushActive = false;
let printFlushActive = false;
let replyFlushRequested = false;
let printFlushRequested = false;
let conversationCleanupTimer;
let incomingRecoveryTimer;
const conversationWork = new Map();
const printJobsInFlight = new Set();

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
const whatsappSessionDir = path.join(dataDir, 'whatsapp-session');
const whatsappRuntimePackagePath = app.isPackaged
  ? path.join(process.resourcesPath, 'whatsapp-runtime', 'package.json')
  : path.join(__dirname, 'whatsapp-runtime', 'package.json');
const serviceEntry = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'whatsapp-service.cjs')
  : path.join(__dirname, 'whatsapp-service.cjs');
const trayIconPath = path.join(__dirname, 'aura-icon.ico');
const installedSmoke = process.env.AURA_INSTALLED_SMOKE === '1' && app.isPackaged;
const installedSmokeReport = process.env.AURA_INSTALLED_SMOKE_REPORT;
let installedSmokeStarted = false;

function report(code, error) {
  const errorCode = error && typeof error === 'object' ? error.code || error.name : undefined;
  console.error(JSON.stringify({ component: 'electron-main', code, ...(errorCode ? { errorCode: String(errorCode).slice(0, 48) } : {}) }));
}

function publishWhatsAppStatus(snapshot) {
  const previousState = serviceState;
  serviceState = snapshot.state;
  if (serviceState !== 'qr' && whatsappQr !== null) {
    whatsappQr = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('whatsapp:qr', null);
  }
  updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('whatsapp:status', { state: serviceState });
  if (previousState === 'connected' && serviceState !== 'connected') {
    void postInternalWhatsApp('reply.recover').catch(error => report('WHATSAPP_REPLY_RECOVERY_FAILED', error));
  }
  if (serviceState === 'connected') {
    void processPendingPrintJobs();
    void flushPendingReplies();
  }
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

function loadConversationHashKey() {
  const file = path.join(dataDir, 'whatsapp-chat-hash.key');
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('WHATSAPP_HASH_KEY_INVALID');
    return Buffer.from(value, 'hex');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const key = randomBytes(32);
  let descriptor;
  try {
    descriptor = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(descriptor, key.toString('hex'), 'utf8');
    fs.fsyncSync(descriptor);
    return key;
  } catch (error) {
    if (error?.code === 'EEXIST') return loadConversationHashKey();
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function hashConversation(jid) {
  if (!conversationHashKey) conversationHashKey = loadConversationHashKey();
  return createHmac('sha256', conversationHashKey).update(`primary\0${jid}`, 'utf8').digest('hex');
}

function encryptReplyTarget(jid) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('LOCAL_ENCRYPTION_UNAVAILABLE');
  return safeStorage.encryptString(jid).toString('base64');
}

function decryptReplyTarget(encrypted) {
  if (typeof encrypted !== 'string' || encrypted.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted)) {
    throw new Error('REPLY_TARGET_INVALID');
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('LOCAL_ENCRYPTION_UNAVAILABLE');
  const jid = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  if (!isDirectJid(jid)) throw new Error('REPLY_TARGET_INVALID');
  return jid;
}

function postInternalWhatsApp(action, payload = {}) {
  return ensureLocalServer().then(() => new Promise((resolve, reject) => {
    if (!serverWhatsAppToken || serverWhatsAppToken.length !== 64) return reject(new Error('INTERNAL_WHATSAPP_TOKEN_UNAVAILABLE'));
    const body = Buffer.from(JSON.stringify({ action, payload }), 'utf8');
    const origin = `http://127.0.0.1:${serverPort}`;
    const req = request({
      hostname: '127.0.0.1', port: serverPort, path: '/api/internal/whatsapp', method: 'POST', timeout: 45000,
      headers: {
        Origin: origin,
        Authorization: `Bearer ${serverWhatsAppToken}`,
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        Connection: 'close',
      },
    }, res => {
      const chunks = [];
      let length = 0;
      res.on('data', chunk => {
        length += chunk.length;
        if (length > 512 * 1024) {
          res.destroy(new Error('INTERNAL_WHATSAPP_RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        let result;
        try {
          result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          reject(new Error('INTERNAL_WHATSAPP_INVALID_RESPONSE'));
          return;
        }
        if (res.statusCode !== 200 || result?.ok !== true) {
          const code = typeof result?.error?.code === 'string' ? result.error.code.slice(0, 48) : `HTTP_${res.statusCode || 0}`;
          reject(new Error(`INTERNAL_WHATSAPP_${code}`));
          return;
        }
        resolve(result.data);
      });
    });
    req.on('timeout', () => req.destroy(new Error('INTERNAL_WHATSAPP_TIMEOUT')));
    req.on('error', reject);
    req.end(body);
  }));
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
  serverWhatsAppToken = randomBytes(32).toString('hex');
  const databaseUrl = `file:${path.join(dataDir, 'aura.sqlite').replace(/\\/g, '/')}?connection_limit=1`;
  const localServerEnv = { ...process.env };
  for (const name of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GENAI_API_KEY', 'AURA_INSTALL_TOKEN_HASHES', 'GEMINI_BASE_URL', 'GEMINI_MODEL']) delete localServerEnv[name];
  const child = utilityProcess.fork(serverEntry, [], {
    cwd: serverRoot,
    serviceName: 'Aura Local POS Server',
    windowsHide: true,
    stdio: isDev ? 'inherit' : 'ignore',
    env: {
      ...localServerEnv,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(serverPort),
      AURA_DATA_DIR: dataDir,
      AURA_MIGRATIONS_DIR: path.join(serverRoot, 'prisma', 'migrations'),
      AURA_INTERNAL_SHUTDOWN_TOKEN: serverShutdownToken,
      AURA_INTERNAL_WHATSAPP_TOKEN: serverWhatsAppToken,
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
    serverWhatsAppToken = undefined;
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
  let printDispatched = false;
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(invoiceHtml(data, type))}`);
    printDispatched = true;
    await new Promise((resolve, reject) => {
      printWindow.webContents.print({ silent: true, printBackground: true, deviceName: printer }, (success, failureReason) => {
        if (success) resolve();
        else {
          const error = new Error(failureReason || 'Silent printing failed');
          error.code = 'PRINT_RESULT_UNCERTAIN';
          reject(error);
        }
      });
    });
  } catch (error) {
    if (error && typeof error === 'object' && !error.code) error.code = printDispatched ? 'PRINT_RESULT_UNCERTAIN' : 'PRINT_NOT_DISPATCHED';
    throw error;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
}

function notifyPrintIssue(displayId) {
  if (!Notification.isSupported()) return;
  const safeId = typeof displayId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(displayId) ? displayId : 'غير معروف';
  new Notification({ title: 'Aura POS — تعذرت الطباعة', body: `راجع الطابعة وحالة الطلب ${safeId} قبل إعادة المحاولة.` }).show();
}

async function processPendingPrintJobs() {
  if (printFlushActive) {
    printFlushRequested = true;
    return;
  }
  printFlushActive = true;
  try {
    const jobs = await postInternalWhatsApp('print.pending');
    if (!Array.isArray(jobs)) return;
    for (const job of jobs) {
      if (!job || typeof job.id !== 'string' || printJobsInFlight.has(job.id)) continue;
      printJobsInFlight.add(job.id);
      try {
        const order = job.order;
        const displayId = order?.displayId;
        const settings = readSettings();
        const printer = job.invoiceType === 'kitchen' ? settings?.kitchenPrinter : settings?.cashierPrinter;
        if (!order || !Array.isArray(order.items) || !['kitchen', 'delivery', 'dine_in'].includes(job.invoiceType) || typeof printer !== 'string' || !printer.trim()) {
          notifyPrintIssue(displayId);
          continue;
        }
        const claimed = await postInternalWhatsApp('print.claim', { jobId: job.id });
        if (claimed === false || claimed?.claimed === false || claimed === null) continue;
        try {
          await silentPrint({ printer, data: order, type: job.invoiceType });
          await postInternalWhatsApp('print.complete', { jobId: job.id, status: 'printed' });
        } catch (error) {
          const notDispatched = error?.code === 'PRINT_NOT_DISPATCHED';
          report(notDispatched ? 'WHATSAPP_PRINT_PREPARATION_FAILED' : 'WHATSAPP_PRINT_JOB_UNCERTAIN', error);
          try {
            await postInternalWhatsApp('print.complete', {
              jobId: job.id,
              status: notDispatched ? 'failed' : 'unknown',
              errorCode: notDispatched ? 'PRINT_NOT_DISPATCHED' : 'PRINT_RESULT_UNCERTAIN',
            });
          } catch (completeError) {
            report('WHATSAPP_PRINT_RESULT_FAILED', completeError);
          }
          if (notDispatched && Number(job.attempts || 0) < 1) printFlushRequested = true;
          else notifyPrintIssue(displayId);
        }
      } catch (error) {
        report('WHATSAPP_PRINT_JOB_FAILED', error);
      } finally {
        printJobsInFlight.delete(job.id);
      }
    }
  } catch (error) {
    report('WHATSAPP_PRINT_QUEUE_FAILED', error);
  } finally {
    printFlushActive = false;
    void flushPendingReplies();
    if (printFlushRequested) {
      printFlushRequested = false;
      setImmediate(() => { void processPendingPrintJobs(); });
    }
  }
}

async function flushPendingReplies() {
  if (serviceState !== 'connected' || appIsQuitting) return;
  if (replyFlushActive) {
    replyFlushRequested = true;
    return;
  }
  replyFlushActive = true;
  try {
    const pending = await postInternalWhatsApp('reply.pending');
    if (!Array.isArray(pending)) return;
    for (const entry of pending) {
      if (!entry || typeof entry.replyId !== 'string' || typeof entry.replyText !== 'string' || entry.replyText.length === 0) continue;
      const claimed = await postInternalWhatsApp('reply.claim', { replyId: entry.replyId });
      if (!claimed || claimed?.claimed === false) continue;
      try {
        const jid = decryptReplyTarget(entry.encryptedReplyTarget);
        const accepted = serviceSupervisor?.reply(entry.replyId, jid, entry.replyText) === true;
        if (!accepted) await postInternalWhatsApp('reply.complete', { replyId: entry.replyId, status: 'failed' });
      } catch (error) {
        report('WHATSAPP_REPLY_DISPATCH_FAILED', error);
        try {
          await postInternalWhatsApp('reply.complete', { replyId: entry.replyId, status: 'failed' });
        } catch (completeError) {
          report('WHATSAPP_REPLY_RESULT_FAILED', completeError);
        }
      }
    }
  } catch (error) {
    report('WHATSAPP_REPLY_QUEUE_FAILED', error);
  } finally {
    replyFlushActive = false;
    if (replyFlushRequested) {
      replyFlushRequested = false;
      setImmediate(() => { void flushPendingReplies(); });
    }
  }
}

async function processIncomingWhatsAppMessage(message, resumeExisting = false) {
  let jid;
  try {
    jid = resumeExisting ? decryptReplyTarget(message?.encryptedReplyTarget) : message?.jid;
  } catch (error) {
    report('WHATSAPP_RECOVERY_TARGET_DECRYPT_FAILED', error);
    return;
  }
  if (!message || !isDirectJid(jid) || typeof message.messageId !== 'string' || !message.messageId
    || message.messageId.length > 128 || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 8192) return;
  const conversationHash = resumeExisting ? message.conversationHash : hashConversation(jid);
  if (!/^[a-f0-9]{64}$/.test(conversationHash) || hashConversation(jid) !== conversationHash) {
    report('WHATSAPP_RECOVERY_IDENTITY_MISMATCH');
    return;
  }
  const encryptedReplyTarget = resumeExisting ? message.encryptedReplyTarget : encryptReplyTarget(jid);
  const customerPhone = jid.endsWith('@s.whatsapp.net') ? jid.slice(0, -'@s.whatsapp.net'.length) : '';
  const result = await postInternalWhatsApp(resumeExisting ? 'message.recover' : 'message.process', {
    accountId: 'primary', conversationHash, messageId: message.messageId,
    text: message.text, encryptedReplyTarget, customerPhone,
  });
  if (result?.order?.id) showNewOrderNotification(result.order.displayId);
  if (result?.order?.id) await processPendingPrintJobs();
  await flushPendingReplies();
  return result;
}

function queueWhatsAppMessage(message, conversationHash, resumeExisting = false) {
  const previous = conversationWork.get(conversationHash) || Promise.resolve();
  const current = previous.then(() => processIncomingWhatsAppMessage(message, resumeExisting)).catch(error => {
    report('WHATSAPP_MESSAGE_PROCESSING_FAILED', error);
  });
  conversationWork.set(conversationHash, current);
  void current.finally(() => {
    if (conversationWork.get(conversationHash) === current) conversationWork.delete(conversationHash);
  });
}

function enqueueIncomingWhatsAppMessage(message) {
  try {
    if (!message || !isDirectJid(message.jid)) return;
    queueWhatsAppMessage(message, hashConversation(message.jid));
  } catch (error) {
    report('WHATSAPP_MESSAGE_IDENTITY_FAILED', error);
  }
}

function enqueueRecoveredWhatsAppMessage(message) {
  if (!message || message.accountId !== 'primary' || typeof message.conversationHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(message.conversationHash) || typeof message.messageId !== 'string'
    || typeof message.text !== 'string' || typeof message.encryptedReplyTarget !== 'string') return;
  queueWhatsAppMessage(message, message.conversationHash, true);
}

async function recoverAgentOperations() {
  try { await postInternalWhatsApp('reply.recover'); }
  catch (error) { report('WHATSAPP_REPLY_RECOVERY_FAILED', error); }
  try { await postInternalWhatsApp('print.recover'); }
  catch (error) { report('WHATSAPP_PRINT_RECOVERY_FAILED', error); }
  await recoverStaleIncomingMessages();
}

async function recoverStaleIncomingMessages() {
  try {
    const messages = await postInternalWhatsApp('message.recoverable');
    if (!Array.isArray(messages)) return;
    for (const message of messages) enqueueRecoveredWhatsAppMessage(message);
  } catch (error) {
    report('WHATSAPP_MESSAGE_RECOVERY_FAILED', error);
  }
}

async function cleanupOldWhatsAppConversations() {
  try { await postInternalWhatsApp('conversation.cleanup'); }
  catch (error) { report('WHATSAPP_CONVERSATION_CLEANUP_FAILED', error); }
}

function recordWhatsAppReplyStatus(result) {
  if (!result || typeof result.replyId !== 'string' || !['sent', 'failed'].includes(result.status)) return;
  void postInternalWhatsApp('reply.complete', { replyId: result.replyId, status: result.status })
    .then(() => flushPendingReplies())
    .catch(error => report('WHATSAPP_REPLY_RESULT_FAILED', error));
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
    const saved = writeSettings(settings);
    setImmediate(() => { void processPendingPrintJobs(); });
    return saved;
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
  ipcMain.handle('whatsapp:status:get', (event, ...args) => {
    assertTrustedIpc(event);
    if (args.length !== 0) throw new Error('INVALID_WHATSAPP_STATUS_REQUEST');
    return { state: serviceState, qr: serviceState === 'qr' ? whatsappQr : null };
  });
  ipcMain.handle('whatsapp:connect', (event, ...args) => {
    assertTrustedIpc(event);
    if (args.length !== 0) throw new Error('INVALID_WHATSAPP_CONNECT_REQUEST');
    return Boolean(serviceSupervisor?.command('start'));
  });
  ipcMain.handle('whatsapp:disconnect', (event, ...args) => {
    assertTrustedIpc(event);
    if (args.length !== 0) throw new Error('INVALID_WHATSAPP_DISCONNECT_REQUEST');
    return Boolean(serviceSupervisor?.command('disconnect'));
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
    window.on('show', () => { mainWindowShowEvents += 1; });
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
async function runInstalledSmoke() {
  if (!installedSmoke || installedSmokeStarted || !app.isPackaged) return;
  installedSmokeStarted = true;
  const reportPath = typeof installedSmokeReport === 'string' && path.isAbsolute(installedSmokeReport) ? installedSmokeReport : null;
  const readyPath = typeof process.env.AURA_INSTALLED_SMOKE_READY === 'string' && path.isAbsolute(process.env.AURA_INSTALLED_SMOKE_READY)
    ? process.env.AURA_INSTALLED_SMOKE_READY : null;
  const stopPath = typeof process.env.AURA_INSTALLED_SMOKE_STOP === 'string' && path.isAbsolute(process.env.AURA_INSTALLED_SMOKE_STOP)
    ? process.env.AURA_INSTALLED_SMOKE_STOP : null;
  // An unlinked QR session may enter the designed reconnect backoff after the remote socket closes.
  const smokeLiveWhatsAppStates = new Set(['qr', 'connecting', 'reconnecting', 'connected']);
  const result = {
    schema: 2,
    databaseFilePath: path.join(dataDir, 'aura.sqlite'),
    healthReady: false,
    databaseReady: false,
    trayHide: false,
    serverContinued: false,
    whatsappRuntimeLoaded: false,
    qrObserved: false,
    serviceContinued: false,
    whatsappServiceStateAtSoakStart: null,
    whatsappServiceStateAtSoakEnd: null,
    loadConversations: 0,
    loadReplies: 0,
    loadOrders: 0,
    mainEventLoopSamples: 0,
    serverEventLoopSamples: 0,
    rendererEventLoopSamples: 0,
    mainEventLoopP99Ms: null,
    serverEventLoopP99Ms: null,
    rendererEventLoopP95Ms: null,
    rendererEventLoopP99Ms: null,
    rendererEventLoopMaxMs: null,
    whatsappServiceMemoryMb: null,
    performanceWithinTarget: false,
    windowShown: false,
    soakCompleted: false,
    soakDurationMs: 0,
  };
  let finished = false;
  let qrTimer;
  let timeout;
  const finish = async error => {
    if (finished) return;
    finished = true;
    clearTimeout(qrTimer);
    if (lastWhatsAppServiceErrorCode) result.serviceErrorCode = lastWhatsAppServiceErrorCode;
    if (serviceSupervisor) {
      result.serviceStateAtExit = serviceSupervisor.state;
      result.serviceRestartCount = serviceSupervisor.restartCount;
      result.servicePidAtExit = serviceSupervisor.snapshot().pid;
    }
    result.serviceSupervisorLogCodes = whatsAppSupervisorLogCodes.slice(-12);
    result.ok = !error && result.healthReady && result.databaseReady && result.windowShown && result.trayHide && result.serverContinued
      && result.whatsappRuntimeLoaded && result.qrObserved && result.serviceContinued
      && result.loadConversations === 20 && result.loadReplies === 20 && result.loadOrders === 0
      && result.performanceWithinTarget && result.soakCompleted
      && Number.isFinite(result.whatsappServiceMemoryMb) && result.whatsappServiceMemoryMb < 150;
    if (error) result.errorCode = String(error?.code || error?.message || 'SMOKE_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 48);
    try {
      if (!reportPath) throw new Error('SMOKE_REPORT_PATH_REQUIRED');
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(result), { encoding: 'utf8', flag: 'wx' });
    } catch (writeError) { report('INSTALLED_SMOKE_REPORT_FAILED', writeError); }
    clearTimeout(timeout);
    setTimeout(() => app.quit(), 250);
  };
  timeout = setTimeout(() => { void finish(new Error('SMOKE_TIMEOUT')); }, 16 * 60 * 1000);
  try {
    if (!reportPath || !readyPath || !stopPath) throw new Error('SMOKE_REPORT_PATH_REQUIRED');
    await ensureLocalServer();
    result.healthReady = true;
    result.databaseReady = fs.existsSync(result.databaseFilePath);
    if (!result.databaseReady) throw new Error('SMOKE_DATABASE_MISSING');
    const window = mainWindow;
    if (!window || window.isDestroyed()) throw new Error('SMOKE_WINDOW_MISSING');
    if (mainWindowShowEvents < 1) {
      await new Promise((resolve, reject) => {
        const showTimer = setTimeout(() => reject(new Error('SMOKE_WINDOW_SHOW_TIMEOUT')), 15000);
        window.once('show', () => { clearTimeout(showTimer); resolve(); });
      });
    }
    result.windowShown = mainWindowShowEvents > 0;
    if (!result.windowShown) throw new Error('SMOKE_WINDOW_NOT_SHOWN');
    if (!serviceSupervisor) throw new Error('SMOKE_WHATSAPP_SUPERVISOR_MISSING');
    if (!serviceSupervisor.readyAt) {
      await new Promise((resolve, reject) => {
        // Keep production restart behavior unchanged while allowing transient startup retries to become observable.
        const readyTimer = setTimeout(() => reject(new Error('SMOKE_SERVICE_READY_TIMEOUT')), 120000);
        serviceSupervisor.once('ready', () => { clearTimeout(readyTimer); resolve(); });
      });
    }
    const smokeSettings = await postInternalWhatsApp('smoke.enable-agent', {});
    if (smokeSettings?.enabled !== true) throw new Error('SMOKE_AGENT_NOT_ENABLED');
    const rendererWarmup = await window.webContents.executeJavaScript(`new Promise(resolve => {
      const settle = () => {
        const afterIdle = () => setTimeout(() => resolve(true), 500);
        if (typeof window.requestIdleCallback === 'function') requestIdleCallback(afterIdle, { timeout: 2000 });
        else setTimeout(afterIdle, 1000);
      };
      if (document.readyState === 'complete') settle();
      else window.addEventListener('load', settle, { once: true });
    })`);
    if (rendererWarmup !== true) throw new Error('SMOKE_RENDERER_WARMUP_FAILED');
    const rendererStarted = await window.webContents.executeJavaScript(`(() => {
      const previous = window.__auraInstalledSmokeProbe;
      if (previous?.timer) clearInterval(previous.timer);
      const intervalMs = 2;
      const probe = { last: performance.now(), delays: [], timer: null, intervalMs };
      probe.timer = setInterval(() => {
        const now = performance.now();
        probe.delays.push(Math.max(0, now - probe.last - probe.intervalMs));
        probe.last = now;
        if (probe.delays.length > 10000) probe.delays.shift();
      }, intervalMs);
      window.__auraInstalledSmokeProbe = probe;
      return true;
    })()`);
    if (rendererStarted !== true) throw new Error('SMOKE_RENDERER_PROBE_FAILED');
    const resetResponse = await fetch(`http://127.0.0.1:${serverPort}/api/health?resetEventLoop=1`, { signal: AbortSignal.timeout(5000) });
    if (!resetResponse.ok) throw new Error('SMOKE_METRICS_RESET_FAILED');
    const eventLoop = monitorEventLoopDelay({ resolution: 1 });
    eventLoop.enable();
    let loadResults;
    try {
      loadResults = await Promise.all(Array.from({ length: 20 }, (_, index) => {
        const phone = `2015550${String(index).padStart(6, '0')}`;
        return processIncomingWhatsAppMessage({
          jid: `${phone}@s.whatsapp.net`,
          messageId: `installed-smoke-${index}`,
          text: `synthetic smoke conversation ${index}`,
        });
      }));
      await new Promise(resolve => setTimeout(resolve, 25));
    } finally {
      eventLoop.disable();
    }
    result.loadConversations = 20;
    result.loadReplies = loadResults.filter(item => item?.reply && !item?.gatewayFailed).length;
    result.loadOrders = loadResults.filter(item => item?.order?.id).length;
    result.mainEventLoopSamples = eventLoop.count;
    if (result.mainEventLoopSamples < 100) throw new Error('SMOKE_MAIN_METRICS_MISSING');
    result.mainEventLoopP99Ms = Number((eventLoop.percentile(99) / 1e6).toFixed(1));
    const loadHealthResponse = await fetch(`http://127.0.0.1:${serverPort}/api/health`, { signal: AbortSignal.timeout(5000) });
    const loadHealth = await loadHealthResponse.json();
    if (typeof loadHealth.eventLoopP99Ms !== 'number' || !Number.isFinite(loadHealth.eventLoopP99Ms)) throw new Error('SMOKE_SERVER_METRICS_MISSING');
    result.serverEventLoopSamples = Number(loadHealth.eventLoopSamples);
    if (!Number.isInteger(result.serverEventLoopSamples) || result.serverEventLoopSamples < 100) throw new Error('SMOKE_SERVER_METRICS_MISSING');
    result.serverEventLoopP99Ms = loadHealth.eventLoopP99Ms;
    const rendererMetrics = await window.webContents.executeJavaScript(`(() => {
      const probe = window.__auraInstalledSmokeProbe;
      if (!probe) return null;
      clearInterval(probe.timer);
      const sorted = probe.delays.slice().sort((a, b) => a - b);
      const percentile = ratio => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] : null;
      const p99 = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.99) - 1)] : null;
      return {
        samples: sorted.length,
        p95Ms: percentile(0.95) === null ? null : Number(percentile(0.95).toFixed(1)),
        p99Ms: p99 === null ? null : Number(p99.toFixed(1)),
        maxMs: sorted.length ? Number(sorted[sorted.length - 1].toFixed(1)) : null,
      };
    })()`);
    if (!rendererMetrics || rendererMetrics.samples < 1 || !Number.isFinite(rendererMetrics.p95Ms)
      || !Number.isFinite(rendererMetrics.p99Ms) || !Number.isFinite(rendererMetrics.maxMs)) {
      throw new Error('SMOKE_RENDERER_METRICS_MISSING');
    }
    result.rendererEventLoopSamples = rendererMetrics.samples;
    if (result.rendererEventLoopSamples < 100) throw new Error('SMOKE_RENDERER_METRICS_MISSING');
    result.rendererEventLoopP95Ms = rendererMetrics.p95Ms;
    result.rendererEventLoopP99Ms = rendererMetrics.p99Ms;
    result.rendererEventLoopMaxMs = rendererMetrics.maxMs;
    result.performanceWithinTarget = result.loadReplies === 20 && result.loadOrders === 0
      && [result.mainEventLoopP99Ms, result.serverEventLoopP99Ms, result.rendererEventLoopP99Ms]
        .every(value => Number.isFinite(value) && value <= 100);
    if (!result.performanceWithinTarget) throw new Error('SMOKE_LOAD_OR_EVENT_LOOP_LIMIT');

    const hidden = new Promise((resolve, reject) => {
      const hideTimer = setTimeout(() => reject(new Error('SMOKE_WINDOW_HIDE_TIMEOUT')), 15000);
      window.once('hide', async () => {
        clearTimeout(hideTimer);
        result.trayHide = Boolean(tray) && !window.isDestroyed();
        try {
          const response = await fetch(`http://127.0.0.1:${serverPort}/api/health`, { signal: AbortSignal.timeout(5000) });
          const health = await response.json();
          result.serverContinued = response.status === 200 && health.status === 'ok' && health.database === 'ready';
          if (!result.serverContinued) throw new Error('SMOKE_SERVER_NOT_READY_AFTER_HIDE');
          resolve();
        } catch (error) { reject(error); }
      });
    });
    const gotQr = new Promise(resolve => serviceSupervisor.once('qr', qr => {
      result.qrObserved = typeof qr === 'string' && qr.length > 0;
      result.whatsappRuntimeLoaded = result.qrObserved;
      resolve(result.qrObserved);
    }));
    if (!fs.existsSync(whatsappRuntimePackagePath) || !serviceSupervisor?.command('start')) throw new Error('SMOKE_WHATSAPP_START_FAILED');
    qrTimer = setTimeout(() => { void finish(new Error('SMOKE_QR_TIMEOUT')); }, 90000);
    window.close();
    const [, qrLoaded] = await Promise.all([hidden, gotQr]);
    if (!qrLoaded) throw new Error('SMOKE_QR_INVALID');
    clearTimeout(qrTimer);
    qrTimer = null;
    await new Promise(resolve => setTimeout(resolve, 5000));
    const serviceSnapshot = serviceSupervisor.snapshot();
    result.whatsappServiceStateAtSoakStart = serviceSnapshot.state;
    result.serviceContinued = smokeLiveWhatsAppStates.has(serviceSnapshot.state) && Number.isInteger(serviceSnapshot.pid)
      && app.getAppMetrics().some(metric => metric.pid === serviceSnapshot.pid);
    const serviceMetric = app.getAppMetrics().find(metric => metric.pid === serviceSnapshot.pid);
    const serviceMemoryKb = serviceMetric?.memory?.privateBytes ?? serviceMetric?.memory?.workingSetSize;
    result.whatsappServiceMemoryMb = Number.isFinite(serviceMemoryKb) ? Number((serviceMemoryKb / 1024).toFixed(1)) : null;
    if (!result.serviceContinued) throw new Error('SMOKE_SERVICE_NOT_CONTINUED_AFTER_HIDE');
    if (!Number.isFinite(result.whatsappServiceMemoryMb)) throw new Error('SMOKE_SERVICE_MEMORY_UNAVAILABLE');
    if (result.whatsappServiceMemoryMb >= 150) throw new Error('SMOKE_SERVICE_MEMORY_LIMIT');

    const soakStartedAt = Date.now();
    fs.mkdirSync(path.dirname(readyPath), { recursive: true });
    fs.writeFileSync(readyPath, JSON.stringify({ ...result, ready: true, soakStartedAt: new Date(soakStartedAt).toISOString() }), { encoding: 'utf8', flag: 'wx' });
    let lastHealthCheckAt = soakStartedAt;
    while (!fs.existsSync(stopPath)) {
      result.soakDurationMs = Date.now() - soakStartedAt;
      if (Date.now() - soakStartedAt > 11 * 60 * 1000) throw new Error('SMOKE_SOAK_TIMEOUT');
      const current = serviceSupervisor.snapshot();
      if (!smokeLiveWhatsAppStates.has(current.state) || !Number.isInteger(current.pid)
        || !app.getAppMetrics().some(metric => metric.pid === current.pid)
        || !tray || tray.isDestroyed?.()) throw new Error('SMOKE_SOAK_SERVICE_OR_TRAY_LOST');
      const currentServiceMetric = app.getAppMetrics().find(metric => metric.pid === current.pid);
      const currentServiceMemoryKb = currentServiceMetric?.memory?.privateBytes ?? currentServiceMetric?.memory?.workingSetSize;
      const currentServiceMemoryMb = Number.isFinite(currentServiceMemoryKb) ? currentServiceMemoryKb / 1024 : null;
      if (!Number.isFinite(currentServiceMemoryMb)) throw new Error('SMOKE_SERVICE_MEMORY_UNAVAILABLE');
      result.whatsappServiceMemoryMb = Math.max(result.whatsappServiceMemoryMb, Number(currentServiceMemoryMb.toFixed(1)));
      if (result.whatsappServiceMemoryMb >= 150) throw new Error('SMOKE_SERVICE_MEMORY_LIMIT');
      if (Date.now() - lastHealthCheckAt >= 30000) {
        const response = await fetch(`http://127.0.0.1:${serverPort}/api/health`, { signal: AbortSignal.timeout(5000) });
        const health = await response.json();
        if (response.status !== 200 || health.status !== 'ok' || health.database !== 'ready') throw new Error('SMOKE_SOAK_HEALTH_FAILED');
        lastHealthCheckAt = Date.now();
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    result.soakDurationMs = Date.now() - soakStartedAt;
    result.soakCompleted = result.soakDurationMs >= 10 * 60 * 1000;
    if (!result.soakCompleted) throw new Error('SMOKE_SOAK_TOO_SHORT');
    const finalServiceSnapshot = serviceSupervisor.snapshot();
    result.whatsappServiceStateAtSoakEnd = finalServiceSnapshot.state;
    result.serviceContinued = smokeLiveWhatsAppStates.has(finalServiceSnapshot.state) && Number.isInteger(finalServiceSnapshot.pid)
      && app.getAppMetrics().some(metric => metric.pid === finalServiceSnapshot.pid);
    if (!result.serviceContinued) throw new Error('SMOKE_SERVICE_NOT_CONTINUED_AFTER_SOAK');
    await finish(null);
  } catch (error) { await finish(error); }
}

async function shutdownAll() {
  if (serviceSupervisor) {
    try { await serviceSupervisor.stop(); }
    catch (error) { report('WHATSAPP_SERVICE_STOP_FAILED', error); }
  }
  if (conversationCleanupTimer) clearInterval(conversationCleanupTimer);
  conversationCleanupTimer = null;
  if (incomingRecoveryTimer) clearInterval(incomingRecoveryTimer);
  incomingRecoveryTimer = null;
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
    serviceSupervisor = new UtilityServiceSupervisor({
      utilityProcess, app, entry: serviceEntry, serviceName: 'Aura WhatsApp Service',
      log: (code, context = {}) => {
        if (typeof code === 'string' && /^SERVICE_[A-Z0-9_]{1,48}$/.test(code)) {
          whatsAppSupervisorLogCodes.push(code);
          if (whatsAppSupervisorLogCodes.length > 12) whatsAppSupervisorLogCodes.shift();
        }
        console.error(JSON.stringify({ component: 'service-supervisor', code, ...context }));
      },
      childEnv: {
        AURA_WHATSAPP_SESSION_DIR: whatsappSessionDir,
        AURA_WHATSAPP_RUNTIME_PACKAGE: whatsappRuntimePackagePath,
      },
    });
    serviceSupervisor.on('status', publishWhatsAppStatus);
    serviceSupervisor.on('qr', qr => {
      whatsappQr = typeof qr === 'string' && qr.length <= 4096 ? qr : null;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('whatsapp:qr', whatsappQr);
    });
    serviceSupervisor.on('error-code', errorCode => {
      if (typeof errorCode === 'string' && /^[A-Z0-9_]{1,48}$/.test(errorCode)) lastWhatsAppServiceErrorCode = errorCode;
      report('WHATSAPP_SERVICE_REPORTED_ERROR', { code: errorCode });
    });
    serviceSupervisor.on('memory-limit', () => { serviceState = 'reconnecting'; updateTrayMenu(); });
    serviceSupervisor.on('new-order', ({ displayId }) => { showNewOrderNotification(displayId); });
    serviceSupervisor.on('incoming-message', enqueueIncomingWhatsAppMessage);
    serviceSupervisor.on('reply-status', recordWhatsAppReplyStatus);
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
    if (installedSmoke) void runInstalledSmoke();
    await recoverAgentOperations();
    await cleanupOldWhatsAppConversations();
    conversationCleanupTimer = setInterval(() => { void cleanupOldWhatsAppConversations(); }, 24 * 60 * 60 * 1000);
    conversationCleanupTimer.unref?.();
    incomingRecoveryTimer = setInterval(() => { void recoverStaleIncomingMessages(); }, 60 * 1000);
    incomingRecoveryTimer.unref?.();
    void processPendingPrintJobs();
    void flushPendingReplies();
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
