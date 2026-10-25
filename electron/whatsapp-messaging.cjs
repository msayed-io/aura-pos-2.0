'use strict';

const NON_TEXT_REPLY = 'عذراً، الطلبات النصية فقط مدعومة حالياً. أرسل طلبك كتابةً من فضلك.';

function isDirectJid(jid) {
  if (typeof jid !== 'string' || jid.length === 0 || jid.length > 128) return false;
  return /^[A-Za-z0-9._:-]{1,100}@(s\.whatsapp\.net|lid)$/.test(jid);
}

function unwrapMessage(message) {
  let current = message;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    const wrapper = current.ephemeralMessage
      || current.viewOnceMessage
      || current.viewOnceMessageV2
      || current.viewOnceMessageV2Extension
      || current.documentWithCaptionMessage
      || current.deviceSentMessage;
    if (!wrapper || !wrapper.message) break;
    current = wrapper.message;
  }
  return current;
}

function extractPlainText(message) {
  const content = unwrapMessage(message);
  if (!content || typeof content !== 'object') return null;
  if (typeof content.conversation === 'string') return content.conversation;
  const extended = content.extendedTextMessage;
  if (extended && typeof extended.text === 'string') return extended.text;
  return null;
}

class OutboundReplyQueue {
  constructor({
    random = Math.random,
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    now = Date.now,
    isCurrent = () => true,
    onError,
    minimumDelayMs = 500,
    delayRangeMs = 1200,
    perChatWindowMs = 8000,
    globalWindowMs = 60000,
    globalLimit = 20,
    maxQueueLength = 100,
  }) {
    if (typeof onError !== 'function') throw new TypeError('A redacted outbound error handler is required');
    this.random = random;
    this.sleep = sleep;
    this.now = now;
    this.isCurrent = isCurrent;
    this.onError = onError;
    this.minimumDelayMs = minimumDelayMs;
    this.delayRangeMs = delayRangeMs;
    this.perChatWindowMs = perChatWindowMs;
    this.globalWindowMs = globalWindowMs;
    this.globalLimit = globalLimit;
    this.maxQueueLength = maxQueueLength;
    this.queue = [];
    this.lastQueuedByChat = new Map();
    this.acceptedAt = [];
    this.stopped = false;
    this.drainPromise = null;
  }

  enqueue(socket, jid, text, messageKey) {
    if (this.stopped || !socket || !isDirectJid(jid) || typeof text !== 'string' || !text || typeof messageKey !== 'string') return false;
    if (this.queue.length >= this.maxQueueLength) return false;
    const now = this.now();
    if (this.lastQueuedByChat.size > 10000) {
      for (const [chat, timestamp] of this.lastQueuedByChat) {
        if (now - timestamp >= this.perChatWindowMs) this.lastQueuedByChat.delete(chat);
      }
      while (this.lastQueuedByChat.size > 10000) this.lastQueuedByChat.delete(this.lastQueuedByChat.keys().next().value);
    }
    const previous = this.lastQueuedByChat.get(jid);
    if (previous !== undefined && now - previous < this.perChatWindowMs) return false;
    this.acceptedAt = this.acceptedAt.filter(timestamp => now - timestamp < this.globalWindowMs);
    if (this.acceptedAt.length >= this.globalLimit) return false;
    this.lastQueuedByChat.set(jid, now);
    this.acceptedAt.push(now);
    this.queue.push({ socket, jid, text, messageKey });
    this.startDrain();
    return true;
  }

  startDrain() {
    if (this.drainPromise || this.stopped) return;
    this.drainPromise = this.drain().finally(() => {
      this.drainPromise = null;
      if (this.queue.length && !this.stopped) this.startDrain();
    });
  }

  async drain() {
    while (this.queue.length && !this.stopped) {
      const job = this.queue.shift();
      if (!this.isCurrent(job.socket)) continue;
      try {
        await job.socket.sendPresenceUpdate('composing', job.jid);
        const delay = this.minimumDelayMs + Math.floor(this.random() * this.delayRangeMs);
        await this.sleep(delay);
        if (this.stopped || !this.isCurrent(job.socket)) continue;
        await job.socket.sendMessage(job.jid, { text: job.text });
      } catch {
        this.onError('OUTBOUND_SEND_FAILED');
      } finally {
        if (this.isCurrent(job.socket)) {
          try { await job.socket.sendPresenceUpdate('paused', job.jid); }
          catch { this.onError('PRESENCE_RESET_FAILED'); }
        }
      }
    }
  }

  clearPending() {
    this.queue.length = 0;
  }

  stop() {
    this.stopped = true;
    this.clearPending();
  }

  resume() {
    this.stopped = false;
  }
}

module.exports = { NON_TEXT_REPLY, isDirectJid, extractPlainText, OutboundReplyQueue };
