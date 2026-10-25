/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS is required by Electron's utilityProcess. */
'use strict';

const { EventEmitter } = require('node:events');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const path = require('node:path');

const VALID_STATES = new Set(['idle', 'paused', 'stopping', 'stopped', 'connecting', 'qr', 'connected', 'reconnecting', 'needs-attention']);
const COMMANDS = new Set(['start', 'disconnect', 'stop', 'suspend', 'resume']);
const MESSAGE_TYPES = new Set(['ready', 'heartbeat', 'status', 'stopped', 'new-order', 'qr', 'error']);
const BASE_MESSAGE_KEYS = ['protocol', 'service', 'token', 'sequence', 'type', 'state'];
const SAFE_ERROR_CODES = new Set(['AUTH_STATE_FAILED', 'SOCKET_START_FAILED', 'CREDS_PERSIST_FAILED', 'SESSION_CLEAR_FAILED', 'SESSION_QUARANTINE_FAILED', 'CONNECTION_EVENT_FAILED', 'OUTBOUND_SEND_FAILED', 'PRESENCE_RESET_FAILED', 'LOGOUT_FAILED', 'SOCKET_END_FAILED', 'COMMAND_FAILED']);
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
    this.spawnedAt = 0;
    this.readyAt = 0;
    this.state = 'stopped';
    this.started = false;
    this.stopping = false;
    this.terminating = false;
    this.restartTimer = null;
    this.monitorTimer = null;
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
    this.spawnedAt = Date.now();
    this.readyAt = 0;
    this.terminating = false;

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
    child.on('message', message => this.handleMessage(child, generation, message));
    child.on('error', type => this.log('SERVICE_PROCESS_ERROR', { generation, errorType: String(type || 'UNKNOWN').slice(0, 40) }));
    child.on('exit', code => this.handleExit(child, generation, code));
    this.emit('spawn', { pid: child.pid, generation });
  }

  handleMessage(child, generation, message) {
    if (child !== this.child || generation !== this.generation || this.stopping) return;
    const allowedKeys = message?.type === 'new-order' ? [...BASE_MESSAGE_KEYS, 'displayId']
      : message?.type === 'qr' ? [...BASE_MESSAGE_KEYS, 'qr']
        : message?.type === 'error' ? [...BASE_MESSAGE_KEYS, 'errorCode'] : BASE_MESSAGE_KEYS;
    const validEnvelope = message && typeof message === 'object' && !Array.isArray(message)
      && message.protocol === 1 && message.service === 'whatsapp'
      && tokenMatches(this.token, message.token)
      && Number.isSafeInteger(message.sequence) && message.sequence > this.inSequence
      && MESSAGE_TYPES.has(message.type) && VALID_STATES.has(message.state)
      && Object.keys(message).length === allowedKeys.length && Object.keys(message).every(key => allowedKeys.includes(key))
      && (message.type !== 'new-order' || (message.state === 'connected' && typeof message.displayId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(message.displayId)))
      && (message.type !== 'qr' || (message.state === 'qr' && typeof message.qr === 'string' && message.qr.length > 0 && message.qr.length <= 4096))
      && (message.type !== 'error' || (typeof message.errorCode === 'string' && SAFE_ERROR_CODES.has(message.errorCode)));
    if (!validEnvelope) {
      this.invalidMessages += 1;
      this.log('SERVICE_MESSAGE_REJECTED', { generation, count: this.invalidMessages });
      this.emit('protocol-rejected', { generation });
      this.terminating = true;
      try { child.kill(); } catch { this.log('SERVICE_KILL_FAILED', { generation, reason: 'protocol' }); }
      return;
    }
    if (!MESSAGE_TYPES.has(message.type) || message.sequence <= this.inSequence) {
      this.invalidMessages += 1;
      this.log('SERVICE_MESSAGE_REJECTED', { generation, count: this.invalidMessages });
      this.emit('protocol-rejected', { generation });
      this.terminating = true;
      try { child.kill(); } catch { this.log('SERVICE_KILL_FAILED', { generation, reason: 'protocol' }); }
      return;
    }
    if (message.type === 'ready' && this.readyAt) return;
    if (message.type !== 'ready' && message.type !== 'heartbeat' && message.type !== 'status' && message.type !== 'stopped' && message.type !== 'new-order' && message.type !== 'qr' && message.type !== 'error') return;
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
    } else if (message.type === 'error') {
      this.emit('error-code', message.errorCode, generation);
    }
  }

  handleExit(child, generation, code) {
    if (child !== this.child || generation !== this.generation) return;
    this.child = null;
    this.readyAt = 0;
    this.lastHeartbeatAt = 0;
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
    if (!this.readyAt && now - this.spawnedAt > this.startupTimeoutMs) {
      this.log('SERVICE_STARTUP_TIMEOUT', { generation: this.generation });
      this.terminating = true;
      try { child.kill(); } catch { this.log('SERVICE_KILL_FAILED', { generation: this.generation, reason: 'startup-timeout' }); }
      return;
    }
    if (this.readyAt && now - this.lastHeartbeatAt > this.heartbeatTimeoutMs) {
      this.log('SERVICE_HEARTBEAT_TIMEOUT', { generation: this.generation });
      this.terminating = true;
      try { child.kill(); } catch { this.log('SERVICE_KILL_FAILED', { generation: this.generation, reason: 'heartbeat-timeout' }); }
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
        try { child.kill(); } catch { this.log('SERVICE_KILL_FAILED', { generation: this.generation, reason: 'memory-limit' }); }
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

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    this.started = false;
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.monitorTimer = null;
    this.restartTimer = null;
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
        try { child.kill(); } catch (error) { this.log('SERVICE_KILL_FAILED', { generation: this.generation, errorCode: error?.code || error?.name || 'KILL_ERROR' }); }
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
