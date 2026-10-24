'use strict';
const { parentPort } = process;
const token = process.env.AURA_SERVICE_IPC_TOKEN;
const generation = Number(process.env.AURA_SERVICE_GENERATION);
let sequence = 0;
let commandSequence = 0;
let stopped = false;
let state = 'idle';
const timer = setInterval(() => {
  if (!stopped) parentPort.postMessage({ protocol: 1, service: 'whatsapp', token, sequence: ++sequence, type: 'heartbeat', state });
}, 50);
function send(type) { parentPort.postMessage({ protocol: 1, service: 'whatsapp', token, sequence: ++sequence, type, state }); }
parentPort.on('message', event => {
  const message = event?.data ?? event;
  if (!message || message.protocol !== 1 || message.service !== 'whatsapp' || message.token !== token
    || !Number.isSafeInteger(message.sequence) || message.sequence <= commandSequence || message.type !== 'command') return;
  commandSequence = message.sequence;
  if (message.command === 'stop') {
    state = 'stopped'; stopped = true; clearInterval(timer); send('stopped'); setTimeout(() => process.exit(0), 10);
  } else if (message.command === 'suspend') { state = 'paused'; send('status'); }
  else if (message.command === 'resume') { state = 'idle'; send('status'); }
});
send('ready');
if (generation === 1) setTimeout(() => process.exit(73), 50);
if (generation === 2) setTimeout(() => {
  parentPort.postMessage({ protocol: 1, service: 'whatsapp', token: 'forged-token', sequence: ++sequence, type: 'heartbeat', state });
}, 80);
if (generation === 3) setTimeout(() => {
  state = 'connected';
  parentPort.postMessage({ protocol: 1, service: 'whatsapp', token, sequence: ++sequence, type: 'new-order', state, displayId: 'TEST-001' });
}, 20);
