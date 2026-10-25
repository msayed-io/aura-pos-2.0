/* eslint-disable @typescript-eslint/no-require-imports -- Runs only inside Electron utilityProcess. */
'use strict';

const { parentPort } = process;
const { timingSafeEqual } = require('node:crypto');
const { isDirectJid, isValidPairingPhoneNumber } = require('./whatsapp-messaging.cjs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { WhatsAppSession } = require('./whatsapp-session.cjs');
const { createSerialCommandQueue } = require('./whatsapp-command-queue.cjs');

const token = process.env.AURA_SERVICE_IPC_TOKEN;
const sessionDir = process.env.AURA_WHATSAPP_SESSION_DIR;
const runtimePackagePath = process.env.AURA_WHATSAPP_RUNTIME_PACKAGE
  || path.join(__dirname, 'whatsapp-runtime', 'package.json');
const VALID_COMMANDS = new Set(['start', 'disconnect', 'stop', 'suspend', 'resume', 'reply', 'pair']);
const VALID_ERROR_CODES = new Set([
  'AUTH_STATE_FAILED', 'SOCKET_START_FAILED', 'CREDS_PERSIST_FAILED', 'SESSION_CLEAR_FAILED',
  'SESSION_QUARANTINE_FAILED', 'CONNECTION_EVENT_FAILED', 'OUTBOUND_SEND_FAILED', 'PRESENCE_RESET_FAILED',
  'LOGOUT_FAILED', 'SOCKET_END_FAILED', 'COMMAND_FAILED', 'PAIRING_CODE_FAILED', 'PAIRING_PHONE_INVALID',
  'PAIRING_SESSION_ALREADY_REGISTERED',
]);

let state = 'idle';
let sendSequence = 0;
let receiveSequence = 0;
let exiting = false;
let heartbeatTimer;
let session;
let initializationPromise = Promise.resolve();

function matchesToken(supplied) {
  if (typeof token !== 'string' || typeof supplied !== 'string') return false;
  const expected = Buffer.from(token, 'utf8');
  const actual = Buffer.from(supplied, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function send(type, extra = {}) {
  if (exiting || !parentPort) return;
  parentPort.postMessage({
    protocol: 1,
    service: 'whatsapp',
    token,
    sequence: ++sendSequence,
    type,
    state,
    ...extra,
  });
}

function accept(message) {
  const allowedKeys = message?.type === 'command'
    ? (message.command === 'reply' ? ['protocol', 'service', 'token', 'sequence', 'type', 'command', 'replyId', 'jid', 'text']
      : message.command === 'pair' ? ['protocol', 'service', 'token', 'sequence', 'type', 'command', 'phoneNumber']
        : ['protocol', 'service', 'token', 'sequence', 'type', 'command'])
    : [];
  if (!message || typeof message !== 'object' || Array.isArray(message)
    || Object.keys(message).length !== allowedKeys.length || Object.keys(message).some(key => !allowedKeys.includes(key))
    || message.protocol !== 1 || message.service !== 'whatsapp'
    || !matchesToken(message.token)
    || !Number.isSafeInteger(message.sequence) || message.sequence <= receiveSequence
    || message.type !== 'command' || !VALID_COMMANDS.has(message.command)
    || (message.command === 'reply' && (typeof message.replyId !== 'string' || !message.replyId || message.replyId.length > 128 || !isDirectJid(message.jid) || typeof message.text !== 'string' || !message.text || message.text.length > 8192))
    || (message.command === 'pair' && !isValidPairingPhoneNumber(message.phoneNumber))) return;
  receiveSequence = message.sequence;
  void enqueueCommand(message).catch(() => sendError('COMMAND_FAILED'));
}

function sendError(code) {
  if (VALID_ERROR_CODES.has(code)) send('error', { errorCode: code });
}

async function runCommand(message) {
  const command = message.command;
  if (!session || exiting) return;
  if (command === 'start') {
    await session.connect();
  } else if (command === 'pair') {
    await session.connectWithPairing(message.phoneNumber);
  } else if (command === 'disconnect') {
    await session.disconnect();
  } else if (command === 'suspend') {
    await session.suspend();
  } else if (command === 'resume') {
    await session.resume();
  } else if (command === 'reply') {
    session.reply(message.replyId, message.jid, message.text);
  } else if (command === 'stop') {
    clearInterval(heartbeatTimer);
    await session.stop();
    state = 'stopped';
    send('stopped');
    exiting = true;
    setTimeout(() => process.exit(0), 10);
  }
}

const enqueueCommand = createSerialCommandQueue(async message => {
  await initializationPromise;
  return runCommand(message);
});

function startSession() {
  if (!path.isAbsolute(sessionDir || '')) throw new Error('WHATSAPP_SESSION_PATH_UNAVAILABLE');
  if (!path.isAbsolute(runtimePackagePath)) throw new Error('WHATSAPP_RUNTIME_PATH_UNAVAILABLE');
  const runtimeRequire = createRequire(runtimePackagePath);
  const baileys = runtimeRequire('@whiskeysockets/baileys');
  const makeWASocket = baileys.makeWASocket;
  const useMultiFileAuthState = baileys.useMultiFileAuthState;
  const DisconnectReason = baileys.DisconnectReason;
  const Browsers = baileys.Browsers;
  const logger = runtimeRequire('pino')({ level: 'silent', base: null, timestamp: false });
  session = new WhatsAppSession({
    sessionDir,
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    logger,
    browser: Browsers.windows('Chrome'),
  });
  session.on('status', snapshot => {
    state = snapshot.state;
    send('status');
  });
  session.on('qr', qr => {
    if (typeof qr === 'string' && qr.length > 0 && qr.length <= 4096) send('qr', { qr });
  });
  session.on('pairing-code', code => {
    if (code === null || (typeof code === 'string' && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code))) send('pairing-code', { code });
  });
  session.on('error-code', sendError);
  session.on('text-message', payload => send('incoming-message', payload));
  session.on('reply-status', payload => send('reply-status', payload));
}

async function startService() {
  try {
    startSession();
    parentPort.on('message', event => accept(event?.data ?? event));
    heartbeatTimer = setInterval(() => send('heartbeat'), 5000);
    heartbeatTimer.unref?.();
    initializationPromise = session.initialize();
    await initializationPromise;
    send('ready');
  } catch {
    sendError(session ? 'AUTH_STATE_FAILED' : 'SOCKET_START_FAILED');
    process.exit(3);
  }
}

if (!parentPort || typeof token !== 'string' || token.length !== 64 || !path.isAbsolute(sessionDir || '')) process.exit(2);
else void startService();
