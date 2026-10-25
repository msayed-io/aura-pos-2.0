import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localRequire = createRequire(import.meta.url);
const runtimeRequire = createRequire(path.join(root, 'electron', 'whatsapp-runtime', 'package.json'));
const { WhatsAppSession } = localRequire('../electron/whatsapp-session.cjs');
const { OutboundReplyQueue, isDirectJid, extractPlainText, validReply, replyMessageId } = localRequire('../electron/whatsapp-messaging.cjs');
const { DisconnectReason } = runtimeRequire('@whiskeysockets/baileys');
const tick = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function makeHarness(t, { registered = false, authSequence, now = Date.now, backoffBaseMs = 1, pairingCodeDisplayMs = 30000, saveCreds = async () => {}, useDefaultCredentialPersistence = false } = {}) {
  const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-baileys-state-test-'));
  t.after(async () => { await fs.rm(sessionDir, { recursive: true, force: true }); });
  const sockets = [];
  const optionsSeen = [];
  const authValues = authSequence ? [...authSequence] : [registered];
  const manager = new WhatsAppSession({
    sessionDir,
    useMultiFileAuthState: async () => ({ state: { creds: { registered: authValues.length ? authValues.shift() : false } }, saveCreds }),
    makeWASocket: options => {
      optionsSeen.push(options);
      const socket = {
        ev: new EventEmitter(),
        auth: options.auth,
        sent: [],
        presence: [],
        async sendPresenceUpdate(state, jid) { this.presence.push({ state, jid }); },
        async sendMessage(jid, content, options) { this.sent.push({ jid, content, options }); if (this.failSend) throw new Error('fixture failure'); return { key: { id: 'fixture-send' } }; },
        async requestPairingCode(phoneNumber) {
          this.requestedPairingPhone = phoneNumber;
          this.pairingRequests = (this.pairingRequests || 0) + 1;
          const code = this.pairingRequests === 1 ? 'ABCDEFGH' : 'CDEFGH23';
          this.auth.creds.pairingCode = code;
          this.auth.creds.me = { id: `${phoneNumber}@s.whatsapp.net`, name: '~' };
          this.auth.creds.testBuffer = Buffer.from([1, 2, 3]);
          this.ev.emit('creds.update', this.auth.creds);
          return code;
        },
        async logout() {},
        end() {},
      };
      sockets.push(socket);
      return socket;
    },
    DisconnectReason,
    logger: { level: 'silent' },
    random: () => 0,
    now,
    sleep: async () => {},
    pairingCodeDisplayMs,
    ...(useDefaultCredentialPersistence ? {} : { persistCredentials: auth => auth.saveCreds() }),
    backoffBaseMs,
    backoffMaxMs: backoffBaseMs,
    backoffJitter: 0,
  });
  const errors = [];
  manager.on('error-code', code => errors.push(code));
  return { manager, sockets, optionsSeen, sessionDir, errors };
}

test('disconnect waits for an in-flight credential write before clearing the auth directory', async t => {
  let releaseSave;
  let notifySaveStarted;
  let harness;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const saveStarted = new Promise(resolve => { notifySaveStarted = resolve; });
  harness = await makeHarness(t, {
    saveCreds: async () => {
      notifySaveStarted();
      await saveGate;
      await fs.mkdir(harness.sessionDir, { recursive: true });
      await fs.writeFile(path.join(harness.sessionDir, 'creds.json'), 'saved-after-gate');
    },
  });
  await harness.manager.connect();
  harness.sockets[0].ev.emit('creds.update', {});
  let disconnected = false;
  const disconnect = harness.manager.disconnect().then(value => {
    disconnected = true;
    return value;
  });
  await saveStarted;
  await tick(0);
  assert.equal(disconnected, false);
  assert.equal(await fs.stat(harness.sessionDir).then(() => true, () => false), true);

  releaseSave();
  assert.equal(await disconnect, true);
  assert.equal(await fs.stat(harness.sessionDir).then(() => true, () => false), false);
  await harness.manager.stop();
});

const closeWith = (socket, statusCode) => socket.ev.emit('connection.update', {
  connection: 'close',
  lastDisconnect: { error: { output: { statusCode } } },
});

test('unregistered local auth waits for a user start; a real Baileys open event is the only connected state', async t => {
  const h = await makeHarness(t);
  const status = [];
  const qrs = [];
  h.manager.on('status', value => status.push(value.state));
  h.manager.on('qr', value => qrs.push(value));
  assert.equal(await h.manager.initialize(), true);
  assert.equal(h.manager.state, 'idle');
  assert.equal(h.sockets.length, 0);
  assert.equal(await h.manager.connect(), true);
  assert.equal(h.sockets.length, 1);
  const options = h.optionsSeen[0];
  assert.equal(options.printQRInTerminal, false);
  assert.equal(options.markOnlineOnConnect, false);
  assert.equal(options.syncFullHistory, false);
  assert.equal(options.shouldSyncHistoryMessage(), false);
  assert.equal(options.generateHighQualityLinkPreview, false);
  h.sockets[0].ev.emit('connection.update', { connection: 'connecting', qr: 'synthetic-qr-payload' });
  await tick(0);
  assert.equal(h.manager.state, 'qr');
  assert.equal(qrs.at(-1), 'synthetic-qr-payload');
  h.sockets[0].ev.emit('connection.update', { connection: 'open' });
  await tick(0);
  assert.equal(h.manager.state, 'connected');
  assert.equal(qrs.at(-1), null);
  assert.ok(status.includes('qr') && status.includes('connected'));
  await h.manager.stop();
});

test('phone pairing waits for Baileys QR readiness, never persists the code, hides stale codes and allows renewal', async t => {
  const h = await makeHarness(t, { pairingCodeDisplayMs: 20, useDefaultCredentialPersistence: true });
  const codes = [];
  const qrs = [];
  h.manager.on('pairing-code', value => codes.push(value));
  h.manager.on('qr', value => qrs.push(value));
  assert.equal(await h.manager.initialize(), true);
  assert.equal(await h.manager.connectWithPairing('201012345678'), true);
  assert.equal(h.manager.state, 'connecting');
  const socket = h.sockets[0];
  socket.ev.emit('connection.update', { connection: 'connecting', qr: 'must-not-be-shown-in-phone-mode' });
  await tick(0);
  assert.equal(h.manager.state, 'pairing');
  assert.equal(socket.requestedPairingPhone, '201012345678');
  assert.equal(socket.pairingRequests, 1);
  assert.equal(codes.at(-1), 'ABCDEFGH');
  await h.manager.authSaveQueue;
  const savedCredentials = JSON.parse(await fs.readFile(path.join(h.sessionDir, 'creds.json'), 'utf8'));
  assert.equal(savedCredentials.pairingCode, undefined);
  assert.deepEqual(savedCredentials.testBuffer, { type: 'Buffer', data: 'AQID' });
  assert.equal(h.manager.authState.state.creds.pairingCode, 'ABCDEFGH');
  assert.equal(qrs.includes('must-not-be-shown-in-phone-mode'), false);
  socket.ev.emit('connection.update', { qr: 'duplicate-qr-event' });
  await tick(0);
  assert.equal(socket.pairingRequests, 1);
  await tick(35);
  assert.equal(codes.at(-1), null);
  assert.equal(h.manager.authState.state.creds.pairingCode, undefined);
  assert.equal(h.manager.state, 'pairing');
  assert.equal(await h.manager.connectWithPairing('201012345678'), true);
  assert.equal(socket.pairingRequests, 2);
  assert.equal(h.sockets.length, 1);
  assert.equal(codes.at(-1), 'CDEFGH23');
  await h.manager.authSaveQueue;
  const renewedCredentials = JSON.parse(await fs.readFile(path.join(h.sessionDir, 'creds.json'), 'utf8'));
  assert.equal(renewedCredentials.pairingCode, undefined);
  assert.equal(renewedCredentials.me.id, '201012345678@s.whatsapp.net');
  assert.equal(await h.manager.disconnect(), true);
  assert.equal(h.manager.state, 'idle');
  assert.equal(h.manager.pairingPhoneNumber, null);
  assert.equal(codes.at(-1), null);
  assert.equal(await h.manager.stop(), undefined);
});

test('logged-out sessions are cleared and replaced with a fresh QR session', async t => {
  const h = await makeHarness(t, { authSequence: [true, false] });
  await h.manager.initialize();
  assert.equal(h.sockets.length, 1);
  closeWith(h.sockets[0], DisconnectReason.loggedOut);
  await tick(20);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.manager.state, 'connecting');
  assert.equal(await fs.stat(h.sessionDir).then(() => true), true);
  await h.manager.stop();
});

test('bad sessions are quarantined once; a repeated bad session stops rather than crash-looping', async t => {
  const h = await makeHarness(t, { authSequence: [true, false, false], now: () => 1234 });
  await fs.writeFile(path.join(h.sessionDir, 'fixture-session.json'), 'synthetic-auth-only');
  await h.manager.initialize();
  closeWith(h.sockets[0], DisconnectReason.badSession);
  await tick(20);
  assert.equal(h.sockets.length, 2);
  assert.ok(await fs.stat(`${h.sessionDir}.quarantine-1234`).then(() => true));
  closeWith(h.sockets[1], DisconnectReason.badSession);
  await tick(10);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.manager.state, 'needs-attention');
  await h.manager.stop();
});

test('connection replacement does not compete; restartRequired reconnects immediately; network loss backs off', async t => {
  const h = await makeHarness(t, { registered: true, backoffBaseMs: 4 });
  await h.manager.initialize();
  closeWith(h.sockets[0], DisconnectReason.connectionReplaced);
  await tick(0);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.manager.state, 'needs-attention');
  await h.manager.stop();

  const restart = await makeHarness(t, { registered: true, backoffBaseMs: 4 });
  await restart.manager.initialize();
  closeWith(restart.sockets[0], DisconnectReason.restartRequired);
  await tick(10);
  assert.equal(restart.sockets.length, 2);
  assert.equal(restart.manager.state, 'connecting');
  await restart.manager.stop();

  const network = await makeHarness(t, { registered: true, backoffBaseMs: 4 });
  await network.manager.initialize();
  closeWith(network.sockets[0], 503);
  await tick(1);
  assert.equal(network.manager.state, 'reconnecting');
  await tick(20);
  assert.equal(network.sockets.length, 2);
  await network.manager.stop();
});

test('resume rebuilds a formerly active socket without deleting local credentials', async t => {
  const h = await makeHarness(t, { registered: true });
  await h.manager.initialize();
  h.sockets[0].ev.emit('connection.update', { connection: 'open' });
  await tick(0);
  await h.manager.suspend();
  assert.equal(h.manager.state, 'paused');
  await h.manager.resume();
  assert.equal(h.sockets.length, 2);
  assert.equal(h.manager.state, 'connecting');
  await h.manager.stop();
});

test('notify-only direct-message filter emits text only and silently ignores groups, status, channels, media and history', async t => {
  const h = await makeHarness(t);
  await h.manager.connect();
  const socket = h.sockets[0];
  socket.ev.emit('connection.update', { connection: 'open' });
  await tick(0);
  const texts = [];
  h.manager.on('text-message', value => texts.push(value));
  const direct = { remoteJid: 'customer@s.whatsapp.net', id: 'text-1', fromMe: false };
  socket.ev.emit('messages.upsert', { type: 'append', messages: [{ key: direct, message: { conversation: 'history' } }] });
  socket.ev.emit('messages.upsert', { type: 'notify', messages: [
    { key: { ...direct, id: 'self', fromMe: true }, message: { conversation: 'outgoing' } },
    { key: { remoteJid: 'group@g.us', id: 'group', fromMe: false }, message: { conversation: 'group' } },
    { key: { remoteJid: 'status@broadcast', id: 'status', fromMe: false }, message: { conversation: 'status' } },
    { key: { remoteJid: 'news@newsletter', id: 'channel', fromMe: false }, message: { conversation: 'channel' } },
    { key: direct, message: { conversation: 'hello from customer' } },
    { key: direct, message: { conversation: 'duplicate' } },
    { key: { remoteJid: direct.remoteJid, id: 'media-1', fromMe: false }, message: { imageMessage: { caption: 'not treated as text' } } },
    { key: { remoteJid: direct.remoteJid, id: 'media-1', fromMe: false }, message: { imageMessage: {} } },
  ] });
  await tick(20);
  assert.deepEqual(texts.map(item => item.text), ['hello from customer']);
  assert.equal(socket.sent.length, 0);
  assert.deepEqual(texts[0], { messageId: 'text-1', jid: direct.remoteJid, text: 'hello from customer' });
  await h.manager.stop();
});

test('message parser accepts plain and extended text only; direct-JID boundary excludes broadcasts', () => {
  assert.equal(extractPlainText({ conversation: 'plain' }), 'plain');
  assert.equal(extractPlainText({ extendedTextMessage: { text: 'extended' } }), 'extended');
  assert.equal(extractPlainText({ ephemeralMessage: { message: { conversation: 'wrapped' } } }), 'wrapped');
  assert.equal(extractPlainText({ viewOnceMessage: { message: { conversation: 'hidden' } } }), null);
  assert.equal(extractPlainText({ imageMessage: { caption: 'not text-only' } }), null);
  assert.equal(isDirectJid('customer@s.whatsapp.net'), true);
  assert.equal(isDirectJid('opaque@lid'), true);
  for (const jid of ['status@broadcast', 'room@g.us', 'channel@newsletter', 'all@broadcast', 'malformed']) assert.equal(isDirectJid(jid), false);
});

test('central outbound queue serializes composing/send/paused and enforces a global rate cap', async () => {
  const sent = [];
  const events = [];
  const socket = {
    async sendPresenceUpdate(state, jid) { events.push({ type: state, jid }); },
    async sendMessage(jid, content, options) { sent.push({ jid, content, options }); },
  };
  const queue = new OutboundReplyQueue({
    now: () => 1000,
    random: () => 0,
    sleep: async () => {},
    isCurrent: candidate => candidate === socket,
    onError: code => { throw new Error(code); },
    minimumDelayMs: 0,
    delayRangeMs: 0,
    globalLimit: 1,
  });
  assert.equal(queue.enqueue(socket, 'inbound-1', 'a@s.whatsapp.net', 'fixed reply'), true);
  assert.equal(queue.enqueue(socket, 'inbound-2', 'b@s.whatsapp.net', 'fixed reply'), false);
  await queue.drainPromise;
  assert.deepEqual(events.map(item => item.type), ['composing', 'paused']);
  assert.deepEqual(sent, [{ jid: 'a@s.whatsapp.net', content: { text: 'fixed reply' }, options: { messageId: replyMessageId('inbound-1') } }]);
  queue.stop();
});

test('reply validation is bounded and queue emits redacted sent/failed statuses', async () => {
  assert.equal(validReply('r-1', 'a@s.whatsapp.net', 'reply'), true);
  assert.equal(validReply('x'.repeat(129), 'a@s.whatsapp.net', 'reply'), false);
  assert.equal(validReply('r-1', 'group@g.us', 'reply'), false);
  assert.equal(validReply('r-1', 'a@s.whatsapp.net', 'x'.repeat(8193)), false);
  const expected = `3EB0${(await import('node:crypto')).createHash('sha256').update('r-1').digest('hex').toUpperCase().slice(0, 18)}`;
  assert.equal(replyMessageId('r-1'), expected);
  const statuses = []; const errors = []; const sentOptions = [];
  const socket = { async sendPresenceUpdate() {}, async sendMessage(jid, content, options) { sentOptions.push(options); if (jid.startsWith('bad')) throw new Error('private details'); } };
  const queue = new OutboundReplyQueue({ now: () => 1, sleep: async () => {}, minimumDelayMs: 0, delayRangeMs: 0, isCurrent: () => true, onError: code => errors.push(code), onStatus: (replyId, status) => statuses.push({ replyId, status }) });
  assert.equal(queue.enqueue(socket, 'reply-good', 'good@s.whatsapp.net', 'secret reply'), true);
  assert.equal(queue.enqueue(socket, 'reply-bad', 'bad@s.whatsapp.net', 'secret reply'), true);
  await queue.drainPromise;
  assert.deepEqual(statuses, [{ replyId: 'reply-good', status: 'sent' }, { replyId: 'reply-bad', status: 'failed' }]);
  assert.deepEqual(errors, ['OUTBOUND_SEND_FAILED']);
  assert.deepEqual(sentOptions, [{ messageId: replyMessageId('reply-good') }, { messageId: replyMessageId('reply-bad') }]);
  queue.stop();
});
