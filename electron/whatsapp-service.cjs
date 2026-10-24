/* eslint-disable @typescript-eslint/no-require-imports -- Runs only inside Electron utilityProcess. */
'use strict';

const { parentPort } = process;
const { timingSafeEqual } = require('node:crypto');

const token = process.env.AURA_SERVICE_IPC_TOKEN;
const VALID_COMMANDS = new Set(['stop', 'suspend', 'resume']);
let state = 'idle';
let sendSequence = 0;
let receiveSequence = 0;
let stopped = false;
let heartbeatTimer;

function matchesToken(supplied) {
  if (typeof token !== 'string' || typeof supplied !== 'string') return false;
  const expected = Buffer.from(token, 'utf8');
  const actual = Buffer.from(supplied, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function send(type) {
  if (stopped || !parentPort) return;
  parentPort.postMessage({
    protocol: 1,
    service: 'whatsapp',
    token,
    sequence: ++sendSequence,
    type,
    state,
  });
}

function accept(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)
    || message.protocol !== 1 || message.service !== 'whatsapp'
    || !matchesToken(message.token)
    || !Number.isSafeInteger(message.sequence) || message.sequence <= receiveSequence
    || message.type !== 'command' || !VALID_COMMANDS.has(message.command)) return;
  receiveSequence = message.sequence;
  if (message.command === 'suspend') {
    state = 'paused';
    send('status');
  } else if (message.command === 'resume') {
    state = 'idle';
    send('status');
  } else if (message.command === 'stop') {
    state = 'stopped';
    stopped = true;
    clearInterval(heartbeatTimer);
    if (parentPort) parentPort.postMessage({ protocol: 1, service: 'whatsapp', token, sequence: ++sendSequence, type: 'stopped', state });
    setTimeout(() => process.exit(0), 10);
  }
}

if (!parentPort || !token || token.length !== 64) {
  process.exit(2);
} else {
  parentPort.on('message', event => accept(event?.data ?? event));
  send('ready');
  heartbeatTimer = setInterval(() => send('heartbeat'), 5000);
}
