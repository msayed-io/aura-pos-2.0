/* eslint-disable @typescript-eslint/no-require-imports -- Electron worker file is intentionally CommonJS. */
'use strict';
const { createHash } = require('node:crypto');
function isDirectJid(jid) {
  return typeof jid === 'string' && jid.length <= 128 && /^[A-Za-z0-9._:-]{1,100}@(s\.whatsapp\.net|lid)$/.test(jid);
}
function validReply(replyId, jid, text) {
  return typeof replyId === 'string' && replyId.length > 0 && replyId.length <= 128
    && isDirectJid(jid) && typeof text === 'string' && text.length > 0 && text.length <= 8192;
}
function unwrapMessage(message) {
  let current = message;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    const wrapper = current.ephemeralMessage || current.documentWithCaptionMessage || current.deviceSentMessage;
    if (!wrapper || !wrapper.message) break;
    current = wrapper.message;
  }
  return current;
}
function extractPlainText(message) {
  const content = unwrapMessage(message);
  if (!content || typeof content !== 'object') return null;
  if (typeof content.conversation === 'string') return content.conversation;
  if (content.extendedTextMessage && typeof content.extendedTextMessage.text === 'string') return content.extendedTextMessage.text;
  return null;
}
function replyMessageId(replyId) {
  return `3EB0${createHash('sha256').update(replyId, 'utf8').digest('hex').toUpperCase().slice(0, 18)}`;
}
class OutboundReplyQueue {
  constructor({ random = Math.random, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), now = Date.now, isCurrent = () => true, onError, onStatus = () => {}, minimumDelayMs = 500, delayRangeMs = 1200, perChatWindowMs = 8000, globalWindowMs = 60000, globalLimit = 20, maxQueueLength = 100 }) {
    if (typeof onError !== 'function') throw new TypeError('A redacted outbound error handler is required');
    this.random = random; this.sleep = sleep; this.now = now; this.isCurrent = isCurrent;
    this.onError = onError; this.onStatus = onStatus; this.minimumDelayMs = minimumDelayMs;
    this.delayRangeMs = delayRangeMs; this.perChatWindowMs = perChatWindowMs; this.globalWindowMs = globalWindowMs;
    this.globalLimit = globalLimit; this.maxQueueLength = maxQueueLength; this.queue = [];
    this.lastQueuedByChat = new Map(); this.acceptedAt = []; this.stopped = false; this.drainPromise = null;
  }
  enqueue(socket, replyId, jid, text) {
    if (this.stopped || !socket || !validReply(replyId, jid, text) || this.queue.length >= this.maxQueueLength) return false;
    const now = this.now();
    if (this.lastQueuedByChat.size > 10000) {
      for (const [chat, timestamp] of this.lastQueuedByChat) if (now - timestamp >= this.perChatWindowMs) this.lastQueuedByChat.delete(chat);
      while (this.lastQueuedByChat.size > 10000) this.lastQueuedByChat.delete(this.lastQueuedByChat.keys().next().value);
    }
    const previous = this.lastQueuedByChat.get(jid);
    if (previous !== undefined && now - previous < this.perChatWindowMs) return false;
    this.acceptedAt = this.acceptedAt.filter(timestamp => now - timestamp < this.globalWindowMs);
    if (this.acceptedAt.length >= this.globalLimit) return false;
    this.lastQueuedByChat.set(jid, now); this.acceptedAt.push(now); this.queue.push({ socket, replyId, jid, text });
    this.startDrain(); return true;
  }
  startDrain() {
    if (this.drainPromise || this.stopped) return;
    this.drainPromise = this.drain().finally(() => { this.drainPromise = null; if (this.queue.length && !this.stopped) this.startDrain(); });
  }
  async drain() {
    while (this.queue.length && !this.stopped) {
      const job = this.queue.shift();
      if (!this.isCurrent(job.socket)) { this.onStatus(job.replyId, 'failed'); continue; }
      let status = 'failed';
      try {
        await job.socket.sendPresenceUpdate('composing', job.jid);
        await this.sleep(this.minimumDelayMs + Math.floor(this.random() * this.delayRangeMs));
        if (this.stopped || !this.isCurrent(job.socket)) throw new Error('SOCKET_NOT_CURRENT');
        await job.socket.sendMessage(job.jid, { text: job.text }, { messageId: replyMessageId(job.replyId) });
        status = 'sent';
      } catch { this.onError('OUTBOUND_SEND_FAILED'); }
      finally {
        if (this.isCurrent(job.socket)) {
          try { await job.socket.sendPresenceUpdate('paused', job.jid); }
          catch { this.onError('PRESENCE_RESET_FAILED'); }
        }
        this.onStatus(job.replyId, status);
      }
    }
  }
  clearPending() { this.queue.length = 0; }
  stop() { this.stopped = true; this.clearPending(); }
  resume() { this.stopped = false; }
}
module.exports = { isDirectJid, extractPlainText, validReply, replyMessageId, OutboundReplyQueue };
