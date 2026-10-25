/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS is required by Electron's utilityProcess. */
'use strict';

const { EventEmitter } = require('node:events');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const { isDirectJid, isValidPairingPhoneNumber } = require('./whatsapp-messaging.cjs');

const VALID_STATES = new Set(['idle', 'paused', 'stopping', 'stopped', 'connecting', 'qr', 'pairing', 'connected', 'reconnecting', 'needs-attention']);
const COMMANDS = new Set(['start', 'disconnect', 'stop', 'suspend', 'resume', 'reply']);
const MESSAGE_TYPES = new Set(['ready', 'heartbeat', 'status', 'stopped', 'new-order', 'qr', 'pairing-code', 'error', 'incoming-message', 'reply-status']);
const BASE_MESSAGE_KEYS = ['protocol', 'service', 'token', 'sequence', 'type', 'state'];
const SAFE_ERROR_CODES = new Set(['AUTH_STATE_FAILED', 'SOCKET_START_FAILED', 'CREDS_PERSIST_FAILED', 'SESSION_CLEAR_FAILED', 'SESSION_QUARANTINE_FAILED', 'CONNECTION_EVENT_FAILED', 'OUTBOUND_SEND_FAILED', 'PRESENCE_RESET_FAILED', 'LOGOUT_FAILED', 'SOCKET_END_FAILED', 'COMMAND_FAILED', 'PAIRING_CODE_FAILED', 'PAIRING_PHONE_INVALID', 'PAIRING_SESSION_ALREADY_REGISTERED']);
const INHERITED_ENV = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'TZ', 'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR'];

function tokenMatches(expected, supplied) {
  if (typeof expected !== 'string' || typeof supplied !== 'string') return false;
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(supplied, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function workerEnvironment(generation, token, extra = {}) {
  const env = {};
  for (const key of INHERITED_ENV) if (process.env[key] !== undefined) env[key] = process.env[key];
  env.NODE_ENV = 'production';
  env.AURA_SERVICE_IPC_TOKEN = token;
  env.AURA_SERVICE_GENERATION = String(generation);
  for (const [key, value] of Object.entries(extra)) {
    if (/^AURA_TEST_[A-Z0-9_]+$/.test(key) && typeof value === 'string') env[key] = value;
    if (key === 'AURA_WHATSAPP_SESSION_DIR' && typeof value === 'string' && value.length <= 32768
      && !/[\r\n\0]/.test(value) && path.isAbsolute(value)) env[key] = value;
    if (key === 'AURA_WHATSAPP_RUNTIME_PACKAGE' && typeof value === 'string' && value.length <= 32768
      && !/[\r\n\0]/.test(value) && path.isAbsolute(value)) env[key] = value;
  }
  return env;
}

function withTimeout(promise, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ completed: false });
    }, timeoutMs);
    promise.then(value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ completed: true, value });
    }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ completed: true });
    });
  });
}

class UtilityServiceSupervisor extends EventEmitter {
  constructor({
    utilityProcess,
    app,
    entry,
    serviceName = 'Aura WhatsApp Service',
    log = (code, context = {}) => console.error(JSON.stringify({ component: 'service-supervisor', code, ...context })),
    heartbeatTimeoutMs = 20000,
    startupTimeoutMs = 20000,
    spawnTimeoutMs = 30000,
    monitorIntervalMs = 5000,
    memoryLimitBytes = 256 * 1024 * 1024,
    backoffBaseMs = 1000,
    backoffMaxMs = 30000,
    backoffJitter = 0.2,
    gracefulStopMs = 5000,
    forcedStopMs = 3000,
    stdio = 'ignore',
    childEnv = {},
  }) {
    super();
    if (!utilityProcess?.fork || !app?.getAppMetrics || typeof entry !== 'string') throw new TypeError('utilityProcess, app metrics and a worker entry are required');
    this.utilityProcess = utilityProcess;
    this.app = app;
    this.entry = entry;
    this.serviceName = serviceName;
    this.log = log;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.startupTimeoutMs = startupTimeoutMs;
    this.spawnTimeoutMs = spawnTimeoutMs;
    this.monitorIntervalMs = monitorIntervalMs;
    this.memoryLimitBytes = memoryLimitBytes;
    this.backoffBaseMs = backoffBaseMs;
    this.backoffMaxMs = backoffMaxMs;
    this.backoffJitter = backoffJitter;
    this.gracefulStopMs = gracefulStopMs;
    this.forcedStopMs = forcedStopMs;
    this.stdio = stdio;
    this.childEnv = childEnv;
    this.child = null;
    this.exitPromise = null;
    this.token = null;
    this.generation = 0;
    this.restartCount = 0;
    this.outSequence = 0;
    this.inSequence = 0;
    this.invalidMessages = 0;
    this.lastHeartbeatAt = 0;
    this.spawnRequestedAt = 0;
    this.spawnedAt = 0;
    this.readyAt = 0;
    this.state = 'stopped';
    this.started = false;
    this.stopping = false;
    this.terminating = false;
    this.restartTimer = null;
    this.monitorTimer = null;
    this.spawnAbandonTimer = null;
    this.stopPromise = null;
  }

  start() {
    if (this.started && !this.stopping) return;
    this.started = true;
    this.stopping = false;
    this.monitorTimer = setInterval(() => this.monitor(), this.monitorIntervalMs);
    this.monitorTimer.unref?.();
    this.launch();
  }

  snapshot() {
    return { service: 'whatsapp', state: this.state, pid: this.child?.pid || null, generation: this.generation, restarts: this.restartCount };
  }

  setState(state) {
    if (!VALID_STATES.has(state)) return;
    this.state = state;
    this.emit('status', this.snapshot());
  }

  launch() {
    if (this.stopping || !this.started) return;
    const generation = ++this.generation;
    this.token = randomBytes(32).toString('hex');
    this.inSequence = 0;
    this.outSequence = 0;
    this.invalidMessages = 0;
    this.lastHeartbeatAt = Date.now();
    this.spawnRequestedAt = Date.now();
    this.spawnedAt = 0;
    this.readyAt = 0;
    this.terminating = false;
    if (this.spawnAbandonTimer) clearTimeout(this.spawnAbandonTimer);
    this.spawnAbandonTimer = null;

    let child;
    try {
      child = this.utilityProcess.fork(this.entry, [], {
        cwd: require('node:path').dirname(this.entry),
        serviceName: this.serviceName,
        windowsHide: true,
        stdio: this.stdio,
        env: workerEnvironment(generation, this.token, this.childEnv),
      });
    } catch (error) {
      this.log('SERVICE_SPAWN_FAILED', { generation, errorCode: error?.code || error?.name || 'SPAWN_ERROR' });
      this.scheduleRestart('spawn-failed');
      return;
    }

    this.child = child;
    this.setState('connecting');
    this.exitPromise = new Promise(resolve => {
      child.once('exit', code => resolve({ code }));
    });
    child.once('spawn', () => this.handleSpawn(child, generation));
    child.on('message', message => this.handleMessage(child, generation, message));
    child.on('error', type => this.log('SERVICE_PROCESS_ERROR', { generation, errorType: String(type || 'UNKNOWN').slice(0, 40) }));
    child.on('exit', code => this.handleExit(child, generation, code));
  }

  handleSpawn(child, generation) {
    if (child !== this.child || generation !== this.generation || this.stopping) {
      this.log('SERVICE_LATE_SPAWN', { generation });
      this.killChild(child, generation, 'late-spawn');
      return;
    }
    if (this.spawnAbandonTimer) clearTimeout(this.spawnAbandonTimer);
    this.spawnAbandonTimer = null;
    this.spawnedAt = Date.now();
    this.log('SERVICE_SPAWNED', { generation, pid: Number.isInteger(child.pid) ? child.pid : null });
    this.emit('spawn', { pid: child.pid, generation });
    if (this.terminating) this.killChild(child, generation, 'spawn-timeout');
  }

  killChild(child, generation, reason) {
    let accepted = false;
    try {
      accepted = child.kill();
    } catch (error) {
      this.log('SERVICE_KILL_FAILED', { generation, reason, errorCode: error?.code || error?.name || 'KILL_ERROR' });
      return false;
    }
    if (!accepted) this.log('SERVICE_KILL_FAILED', { generation, reason, errorCode: 'KILL_NOT_ACCEPTED' });
    return accepted;
  }

  abandonUnspawnedChild(child, generation) {
    if (this.spawnAbandonTimer) clearTimeout(this.spawnAbandonTimer);
    this.spawnAbandonTimer = setTimeout(() => {
      this.spawnAbandonTimer = null;
      if (child !== this.child || generation !== this.generation || this.stopping) return;
      if (Number.isInteger(child.pid)) {
        this.spawnedAt ||= Date.now();
        this.killChild(child, generation, 'spawn-timeout');
        return;
      }
      this.log('SERVICE_SPAWN_ABANDONED', { generation });
      this.child = null;
      this.exitPromise = null;
      this.spawnedAt = 0;
      this.terminating = false;
      this.scheduleRestart('spawn-timeout');
    }, this.forcedStopMs);
    this.spawnAbandonTimer.unref?.();
  }

  handleMessage(child, generation, message) {
    if (child !== this.child || generation !== this.generation || this.stopping) return;
    const allowedKeys = message?.type === 'incoming-message' ? [...BASE_MESSAGE_KEYS, 'messageId', 'jid', 'text']
      : message?.type === 'reply-status' ? [...BASE_MESSAGE_KEYS, 'replyId', 'status']
      : message?.type === 'new-order' ? [...BASE_MESSAGE_KEYS, 'displayId']
      : message?.type === 'qr' ? [...BASE_MESSAGE_KEYS, 'qr']
        : message?.type === 'pairing-code' ? [...BASE_MESSAGE_KEYS, 'code']
        : message?.type === 'error' ? [...BASE_MESSAGE_KEYS, 'errorCode'] : BASE_MESSAGE_KEYS;
    const validEnvelope = message && typeof message === 'object' && !Array.isArray(message)
      && message.protocol === 1 && message.service === 'whatsapp'
      && tokenMatches(this.token, message.token)
      && Number.isSafeInteger(message.sequence) && message.sequence > this.inSequence
      && MESSAGE_TYPES.has(message.type) && VALID_STATES.has(message.state)
      && Object.keys(message).length === allowedKeys.length && Object.keys(message).every(key => allowedKeys.includes(key))
      && (message.type !== 'new-order' || (message.state === 'connected' && typeof message.displayId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(message.displayId)))
      && (message.type !== 'qr' || (message.state === 'qr' && typeof message.qr === 'string' && message.qr.length > 0 && message.qr.length <= 4096))
      && (message.type !== 'pairing-code' || message.code === null || (message.state === 'pairing' && typeof message.code === 'string' && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(message.code)))
      && (message.type !== 'error' || (typeof message.errorCode === 'string' && SAFE_ERROR_CODES.has(message.errorCode)))
      && (message.type !== 'incoming-message' || (typeof message.messageId === 'string' && message.messageId.length > 0 && message.messageId.length <= 128 && isDirectJid(message.jid) && typeof message.text === 'string' && message.text.length <= 8192))
      && (message.type !== 'reply-status' || (typeof message.replyId === 'string' && message.replyId.length > 0 && message.replyId.length <= 128 && ['sent', 'failed'].includes(message.status)));
    if (!validEnvelope) {
      this.invalidMessages += 1;
      this.log('SERVICE_MESSAGE_REJECTED', { generation, count: this.invalidMessages });
      this.emit('protocol-rejected', { generation });
      this.terminating = true;
      this.killChild(child, generation, 'protocol');
      return;
    }
    if (!MESSAGE_TYPES.has(message.type) || message.sequence <= this.inSequence) {
      this.invalidMessages += 1;
      this.log('SERVICE_MESSAGE_REJECTED', { generation, count: this.invalidMessages });
      this.emit('protocol-rejected', { generation });
      this.terminating = true;
      this.killChild(child, generation, 'protocol');
      return;
    }
    if (message.type === 'ready' && this.readyAt) return;
    if (message.type !== 'ready' && message.type !== 'heartbeat' && message.type !== 'status' && message.type !== 'stopped' && message.type !== 'new-order' && message.type !== 'qr' && message.type !== 'pairing-code' && message.type !== 'error' && message.type !== 'incoming-message' && message.type !== 'reply-status') return;
    this.inSequence = message.sequence;
    this.lastHeartbeatAt = Date.now();
    if (message.type === 'ready') {
      this.readyAt = Date.now();
      this.setState(message.state);
      this.emit('ready', { pid: child.pid, generation, state: message.state });
    } else if (message.type === 'heartbeat' || message.type === 'status') {
      this.setState(message.state);
    } else if (message.type === 'stopped') {
      this.setState('stopped');
    } else if (message.type === 'new-order') {
      this.emit('new-order', { displayId: message.displayId, generation });
    } else if (message.type === 'qr') {
      this.emit('qr', message.qr, generation);
    } else if (message.type === 'pairing-code') {
      this.emit('pairing-code', message.code, generation);
    } else if (message.type === 'error') {
      this.emit('error-code', message.errorCode, generation);
    } else if (message.type === 'incoming-message') {
      this.emit('incoming-message', { messageId: message.messageId, jid: message.jid, text: message.text });
    } else if (message.type === 'reply-status') {
      this.emit('reply-status', { replyId: message.replyId, status: message.status });
    }
  }

  handleExit(child, generation, code) {
    if (child !== this.child || generation !== this.generation) return;
    if (this.spawnAbandonTimer) clearTimeout(this.spawnAbandonTimer);
    this.spawnAbandonTimer = null;
    this.child = null;
    this.readyAt = 0;
    this.lastHeartbeatAt = 0;
    this.spawnedAt = 0;
    if (this.stopping) {
      this.setState('stopped');
      this.emit('stopped', { generation, code });
      return;
    }
    this.log('SERVICE_EXITED', { generation, code: Number.isInteger(code) ? code : -1 });
    this.scheduleRestart('exit');
  }

  scheduleRestart(reason) {
    if (this.stopping || !this.started || this.restartTimer) return;
    this.restartCount += 1;
    const base = Math.min(this.backoffMaxMs, this.backoffBaseMs * (2 ** Math.min(this.restartCount - 1, 12)));
    const factor = 1 + ((Math.random() * 2 - 1) * this.backoffJitter);
    const delayMs = Math.max(0, Math.round(base * factor));
    this.setState('reconnecting');
    this.log('SERVICE_RESTART_SCHEDULED', { restart: this.restartCount, delayMs, reason });
    this.emit('restart-scheduled', { restart: this.restartCount, delayMs, reason });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.launch();
    }, delayMs);
    this.restartTimer.unref?.();
  }

  monitor() {
    const child = this.child;
    if (!child || this.stopping || this.terminating) return;
    const now = Date.now();
    if (!Number.isInteger(child.pid)) {
      if (now - this.spawnRequestedAt > this.spawnTimeoutMs) {
        this.log('SERVICE_SPAWN_TIMEOUT', { generation: this.generation, elapsedMs: now - this.spawnRequestedAt });
        this.terminating = true;
        this.killChild(child, this.generation, 'spawn-timeout');
        this.abandonUnspawnedChild(child, this.generation);
      }
      return;
    }
    if (!this.spawnedAt) this.spawnedAt = now;
    if (!this.readyAt && now - this.spawnedAt > this.startupTimeoutMs) {
      this.log('SERVICE_STARTUP_TIMEOUT', { generation: this.generation, pid: child.pid, elapsedMs: now - this.spawnedAt });
      this.terminating = true;
      this.killChild(child, this.generation, 'startup-timeout');
      return;
    }
    if (this.readyAt && now - this.lastHeartbeatAt > this.heartbeatTimeoutMs) {
      this.log('SERVICE_HEARTBEAT_TIMEOUT', { generation: this.generation });
      this.terminating = true;
      this.killChild(child, this.generation, 'heartbeat-timeout');
      return;
    }
    if (this.readyAt && now - this.readyAt > 60000) this.restartCount = 0;
    if (!this.readyAt || !Number.isInteger(child.pid)) return;
    try {
      const metric = this.app.getAppMetrics().find(item => item.pid === child.pid);
      if (!metric) return;
      const kilobytes = Number.isFinite(metric.memory?.privateBytes) ? metric.memory.privateBytes : metric.memory?.workingSetSize;
      const bytes = Number.isFinite(kilobytes) ? kilobytes * 1024 : null;
      if (Number.isFinite(bytes) && bytes > this.memoryLimitBytes) {
        this.log('SERVICE_MEMORY_LIMIT', { generation: this.generation, memoryBytes: bytes, limitBytes: this.memoryLimitBytes });
        this.emit('memory-limit', { pid: child.pid, generation: this.generation, memoryBytes: bytes, limitBytes: this.memoryLimitBytes });
        this.terminating = true;
        this.killChild(child, this.generation, 'memory-limit');
      }
    } catch (error) {
      this.log('SERVICE_METRICS_FAILED', { generation: this.generation, errorCode: error?.code || error?.name || 'METRICS_ERROR' });
    }
  }

  command(command) {
    if (!COMMANDS.has(command) || !this.child || this.stopping) return false;
    try {
      this.child.postMessage({ protocol: 1, service: 'whatsapp', token: this.token, sequence: ++this.outSequence, type: 'command', command });
      return true;
    } catch (error) {
      this.log('SERVICE_COMMAND_FAILED', { generation: this.generation, command, errorCode: error?.code || error?.name || 'IPC_ERROR' });
      return false;
    }
  }

  reply(replyId, jid, text) {
    if (typeof replyId !== 'string' || replyId.length === 0 || replyId.length > 128 || !isDirectJid(jid) || typeof text !== 'string' || text.length === 0 || text.length > 8192 || !this.child || this.stopping) return false;
    try {
      this.child.postMessage({ protocol: 1, service: 'whatsapp', token: this.token, sequence: ++this.outSequence, type: 'command', command: 'reply', replyId, jid, text });
      return true;
    } catch (error) {
      this.log('SERVICE_COMMAND_FAILED', { generation: this.generation, command: 'reply', errorCode: error?.code || error?.name || 'IPC_ERROR' });
      return false;
    }
  }

  pair(phoneNumber) {
    if (!isValidPairingPhoneNumber(phoneNumber) || !this.child || this.stopping) return false;
    try {
      this.child.postMessage({ protocol: 1, service: 'whatsapp', token: this.token, sequence: ++this.outSequence, type: 'command', command: 'pair', phoneNumber });
      return true;
    } catch (error) {
      this.log('SERVICE_COMMAND_FAILED', { generation: this.generation, command: 'pair', errorCode: error?.code || error?.name || 'IPC_ERROR' });
      return false;
    }
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    this.started = false;
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.spawnAbandonTimer) clearTimeout(this.spawnAbandonTimer);
    this.monitorTimer = null;
    this.restartTimer = null;
    this.spawnAbandonTimer = null;
    const child = this.child;
    const exitPromise = this.exitPromise;
    if (!child || !exitPromise) {
      this.setState('stopped');
      return;
    }
    this.setState('stopping');
    try {
      child.postMessage({ protocol: 1, service: 'whatsapp', token: this.token, sequence: ++this.outSequence, type: 'command', command: 'stop' });
    } catch (error) {
      this.log('SERVICE_STOP_COMMAND_FAILED', { generation: this.generation, errorCode: error?.code || error?.name || 'IPC_ERROR' });
    }
    this.stopPromise = (async () => {
      let result = await withTimeout(exitPromise, this.gracefulStopMs);
      if (!result.completed) {
        this.log('SERVICE_STOP_TIMEOUT', { generation: this.generation });
        this.killChild(child, this.generation, 'stop-timeout');
        result = await withTimeout(exitPromise, this.forcedStopMs);
      }
      if (!result.completed) throw new Error('Utility service did not exit after graceful and forced stop');
      if (this.child === child) this.child = null;
      this.setState('stopped');
      this.emit('stopped', { generation: this.generation, code: result.value?.code ?? null });
    })();
    return this.stopPromise;
  }
}

module.exports = { UtilityServiceSupervisor, tokenMatches, workerEnvironment };
