/* eslint-disable @typescript-eslint/no-require-imports -- Electron service runtime is CommonJS. */
'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { OutboundReplyQueue, NON_TEXT_REPLY, isDirectJid, extractPlainText } = require('./whatsapp-messaging.cjs');

const STATES = new Set(['idle', 'connecting', 'qr', 'connected', 'reconnecting', 'needs-attention', 'paused', 'stopping', 'stopped']);
const SAFE_ERROR_CODES = new Set([
  'AUTH_STATE_FAILED', 'SOCKET_START_FAILED', 'CREDS_PERSIST_FAILED', 'SESSION_CLEAR_FAILED',
  'SESSION_QUARANTINE_FAILED', 'CONNECTION_EVENT_FAILED', 'OUTBOUND_SEND_FAILED', 'PRESENCE_RESET_FAILED',
  'LOGOUT_FAILED', 'SOCKET_END_FAILED', 'COMMAND_FAILED',
]);

function disconnectStatus(error) {
  const status = error?.output?.statusCode ?? error?.statusCode;
  return Number.isInteger(status) ? status : null;
}

class WhatsAppSession extends EventEmitter {
  constructor({
    sessionDir,
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    logger,
    browser,
    random = Math.random,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    backoffBaseMs = 1000,
    backoffMaxMs = 30000,
    backoffJitter = 0.2,
    maximumImmediateRestarts = 2,
  }) {
    super();
    if (typeof sessionDir !== 'string' || !path.isAbsolute(sessionDir)) throw new TypeError('An absolute session directory is required');
    if (typeof makeWASocket !== 'function' || typeof useMultiFileAuthState !== 'function' || !DisconnectReason) {
      throw new TypeError('Baileys socket, auth state and disconnect reasons are required');
    }
    this.sessionDir = sessionDir;
    this.makeWASocket = makeWASocket;
    this.useMultiFileAuthState = useMultiFileAuthState;
    this.DisconnectReason = DisconnectReason;
    this.logger = logger;
    this.browser = browser;
    this.random = random;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.sleep = sleep;
    this.backoffBaseMs = backoffBaseMs;
    this.backoffMaxMs = backoffMaxMs;
    this.backoffJitter = backoffJitter;
    this.maximumImmediateRestarts = maximumImmediateRestarts;
    this.state = 'idle';
    this.socket = null;
    this.authState = null;
    this.authSaveQueue = Promise.resolve();
    this.desired = false;
    this.suspended = false;
    this.wasDesiredBeforeSuspend = false;
    this.stopped = false;
    this.disconnectRequested = false;
    this.retryCount = 0;
    this.badSessionCount = 0;
    this.immediateRestartCount = 0;
    this.retryTimer = null;
    this.seenMessages = new Set();
    this.seenMessageOrder = [];
    this.outbound = new OutboundReplyQueue({
      random,
      now,
      sleep,
      isCurrent: socket => this.socket === socket && this.state === 'connected' && !this.suspended,
      onError: code => this.report(code),
    });
  }

  snapshot() {
    return { state: this.state };
  }

  setState(state) {
    if (!STATES.has(state) || this.state === state) return;
    this.state = state;
    this.emit('status', this.snapshot());
  }

  report(code) {
    if (SAFE_ERROR_CODES.has(code)) this.emit('error-code', code);
  }

  clearQr() {
    this.emit('qr', null);
  }

  async initialize() {
    if (this.stopped) return false;
    try {
      await fs.mkdir(this.sessionDir, { recursive: true, mode: 0o700 });
      if (this.stopped) return false;
      const auth = await this.useMultiFileAuthState(this.sessionDir);
      if (this.stopped) return false;
      if (!auth?.state?.creds || typeof auth.saveCreds !== 'function') {
        this.report('AUTH_STATE_FAILED');
        this.setState('needs-attention');
        return false;
      }
      if (auth.state.creds.registered === true) {
        this.desired = true;
        return this.openSocket(auth);
      }
      this.setState('idle');
      return true;
    } catch {
      this.report('AUTH_STATE_FAILED');
      this.setState('needs-attention');
      return false;
    }
  }

  async connect() {
    if (this.stopped || this.suspended) return false;
    if (this.state === 'connected' || this.state === 'connecting' || this.state === 'qr' || this.state === 'reconnecting') return true;
    this.desired = true;
    this.retryCount = 0;
    this.outbound.resume();
    return this.openSocket();
  }

  async openSocket(existingAuth) {
    if (this.stopped || this.suspended || !this.desired) return false;
    this.cancelRetry();
    this.clearQr();
    this.setState('connecting');
    try {
      await this.authSaveQueue;
      await fs.mkdir(this.sessionDir, { recursive: true, mode: 0o700 });
      const auth = existingAuth || await this.useMultiFileAuthState(this.sessionDir);
      if (this.stopped || this.suspended || !this.desired) return false;
      if (!auth?.state?.creds || typeof auth.saveCreds !== 'function') throw new Error('AUTH_STATE_INVALID');
      const socket = this.makeWASocket({
        auth: auth.state,
        logger: this.logger,
        ...(this.browser ? { browser: this.browser } : {}),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false,
      });
      if (!socket?.ev?.on || typeof socket.end !== 'function' || typeof socket.sendMessage !== 'function') {
        throw new Error('BAILEYS_SOCKET_INVALID');
      }
      this.socket = socket;
      this.authState = auth;
      socket.ev.on('creds.update', () => {
        if (socket !== this.socket || this.disconnectRequested || this.stopped || this.suspended) return;
        const save = this.authSaveQueue.then(() => auth.saveCreds());
        this.authSaveQueue = save.catch(() => this.report('CREDS_PERSIST_FAILED'));
      });
      socket.ev.on('connection.update', update => {
        void this.handleConnectionUpdate(socket, update).catch(() => this.report('CONNECTION_EVENT_FAILED'));
      });
      socket.ev.on('messages.upsert', event => this.handleMessages(socket, event));
      return true;
    } catch {
      this.report('SOCKET_START_FAILED');
      this.setState('needs-attention');
      return false;
    }
  }

  async handleConnectionUpdate(socket, update) {
    if (socket !== this.socket || this.stopped || !update || typeof update !== 'object') return;
    const hasQr = typeof update.qr === 'string' && update.qr.length > 0 && update.qr.length <= 4096;
    if (hasQr) {
      this.setState('qr');
      this.emit('qr', update.qr);
    }
    if (update.connection === 'connecting' && !hasQr) this.setState('connecting');
    if (update.connection === 'open') {
      this.retryCount = 0;
      this.badSessionCount = 0;
      this.immediateRestartCount = 0;
      this.clearQr();
      this.setState('connected');
      this.outbound.resume();
    }
    if (update.connection === 'close') await this.handleConnectionClose(socket, disconnectStatus(update.lastDisconnect?.error));
  }

  async handleConnectionClose(socket, statusCode) {
    if (socket !== this.socket) return;
    this.socket = null;
    this.authState = null;
    this.outbound.clearPending();
    this.clearQr();
    if (this.suspended) {
      this.setState('paused');
      return;
    }
    if (this.stopped || !this.desired || this.disconnectRequested) {
      if (!this.stopped) this.setState('idle');
      return;
    }
    const reason = this.DisconnectReason;
    if (statusCode === reason.connectionReplaced) {
      this.desired = false;
      this.setState('needs-attention');
      return;
    }
    if (statusCode === reason.loggedOut) {
      await this.authSaveQueue;
      if (!await this.clearSession()) {
        this.desired = false;
        this.setState('needs-attention');
        return;
      }
      this.retryCount = 0;
      await this.openSocket();
      return;
    }
    if (statusCode === reason.badSession) {
      this.badSessionCount += 1;
      await this.authSaveQueue;
      if (this.badSessionCount > 1 || !await this.quarantineSession()) {
        this.desired = false;
        this.setState('needs-attention');
        return;
      }
      await this.openSocket();
      return;
    }
    if (statusCode === reason.restartRequired && this.immediateRestartCount < this.maximumImmediateRestarts) {
      this.immediateRestartCount += 1;
      await this.openSocket();
      return;
    }
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stopped || this.suspended || !this.desired || this.retryTimer) return;
    this.retryCount += 1;
    const base = Math.min(this.backoffMaxMs, this.backoffBaseMs * (2 ** Math.min(this.retryCount - 1, 12)));
    const factor = 1 + ((this.random() * 2 - 1) * this.backoffJitter);
    const delay = Math.max(0, Math.round(base * factor));
    this.setState('reconnecting');
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      void this.openSocket();
    }, delay);
    this.retryTimer?.unref?.();
  }

  cancelRetry() {
    if (this.retryTimer) this.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  async clearSession() {
    try {
      await fs.rm(this.sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return true;
    } catch {
      this.report('SESSION_CLEAR_FAILED');
      return false;
    }
  }

  async quarantineSession() {
    const quarantinePath = `${this.sessionDir}.quarantine-${this.now()}`;
    try {
      await fs.rename(this.sessionDir, quarantinePath);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return true;
      this.report('SESSION_QUARANTINE_FAILED');
      return false;
    }
  }

  rememberMessage(key) {
    if (this.seenMessages.has(key)) return false;
    this.seenMessages.add(key);
    this.seenMessageOrder.push(key);
    while (this.seenMessageOrder.length > 10000) {
      const oldest = this.seenMessageOrder.shift();
      this.seenMessages.delete(oldest);
    }
    return true;
  }

  handleMessages(socket, event) {
    if (socket !== this.socket || this.state !== 'connected' || !event || event.type !== 'notify' || !Array.isArray(event.messages)) return;
    for (const message of event.messages.slice(0, 100)) {
      const key = message?.key;
      const jid = key?.remoteJid;
      const messageId = key?.id;
      if (key?.fromMe === true || !isDirectJid(jid) || typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 128) continue;
      if (!this.rememberMessage(`${jid}\u0000${messageId}`)) continue;
      const text = extractPlainText(message.message);
      if (text !== null) {
        if (text.length <= 8192) this.emit('text-message', { messageId, jid, text });
        continue;
      }
      this.outbound.enqueue(socket, jid, NON_TEXT_REPLY, messageId);
    }
  }

  async disconnect() {
    if (this.stopped) return false;
    this.desired = false;
    this.disconnectRequested = true;
    this.cancelRetry();
    this.clearQr();
    this.outbound.clearPending();
    const socket = this.socket;
    this.socket = null;
    this.authState = null;
    if (socket) {
      try {
        if (typeof socket.logout === 'function') await socket.logout();
        else socket.end();
      } catch {
        this.report('LOGOUT_FAILED');
        try { socket.end(); } catch { this.report('SOCKET_END_FAILED'); }
      }
    }
    await this.authSaveQueue;
    const cleared = await this.clearSession();
    this.disconnectRequested = false;
    this.setState(cleared ? 'idle' : 'needs-attention');
    return cleared;
  }

  async suspend() {
    if (this.stopped || this.suspended) return;
    this.suspended = true;
    this.wasDesiredBeforeSuspend = this.desired;
    this.cancelRetry();
    this.clearQr();
    this.outbound.clearPending();
    const socket = this.socket;
    this.socket = null;
    this.authState = null;
    if (socket) {
      try { socket.end(); } catch { this.report('SOCKET_END_FAILED'); }
    }
    await this.authSaveQueue;
    this.setState('paused');
  }

  async resume() {
    if (this.stopped || !this.suspended) return;
    this.suspended = false;
    this.desired = this.wasDesiredBeforeSuspend;
    this.wasDesiredBeforeSuspend = false;
    if (this.desired) {
      this.retryCount = 0;
      this.outbound.resume();
      await this.openSocket();
    } else {
      this.setState('idle');
    }
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.desired = false;
    this.suspended = false;
    this.cancelRetry();
    this.clearQr();
    this.outbound.stop();
    this.setState('stopping');
    const socket = this.socket;
    this.socket = null;
    this.authState = null;
    if (socket) {
      try { socket.end(); } catch { this.report('SOCKET_END_FAILED'); }
    }
    await this.authSaveQueue;
    this.setState('stopped');
  }
}

module.exports = { WhatsAppSession, disconnectStatus, STATES };
