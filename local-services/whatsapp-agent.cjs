/* eslint-disable @typescript-eslint/no-require-imports -- Runs only in the local Next.js server. */
'use strict';

const { setTimeout: sleepTimer } = require('node:timers/promises');

const CONSENT_VERSION = '1';
const MAX_MESSAGE_LENGTH = 8192;
const MAX_ITEMS = 20;
const MAX_QUANTITY = 20;
const MAX_GATEWAY_BYTES = 16 * 1024;
const MAX_GATEWAY_ATTEMPTS = 3;
const GATEWAY_RETRY_DELAYS = [350, 900];
const FALLBACK_REPLY = 'عذراً، تعذر معالجة رسالتك الآن. لم يُنشأ أي طلب. سيستطيع أحد الموظفين مساعدتك.';
const EXPLICIT_CONFIRMATION = /^(?:تأكيد|تأكيد الطلب|أؤكد|أؤكد الطلب|أكد الطلب|confirm|confirm order)$/iu;
const DIRECT_PHONE = /(?:\+|00)?[0-9٠-٩][0-9٠-٩\s().-]{7,}[0-9٠-٩]/u;
const DIRECT_PHONE_GLOBAL = /(?:\+|00)?[0-9٠-٩][0-9٠-٩\s().-]{7,}[0-9٠-٩]/gu;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const EMAIL_ADDRESS_GLOBAL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const WHATSAPP_JID = /\b[0-9a-z._:-]{1,100}@(s\.whatsapp\.net|g\.us|lid)\b/iu;
const WHATSAPP_JID_GLOBAL = /\b[0-9a-z._:-]{1,100}@(s\.whatsapp\.net|g\.us|lid)\b/giu;
const CURRENCY_OR_PRICE = /(?:[0-9٠-٩]+(?:[.,٫][0-9٠-٩]{1,2})?\s*(?:جنيه(?:اً|ًا)?|ج\.م|EGP|LE)|(?:السعر|الإجمالي|التكلفة)\s*[:：]?\s*[0-9٠-٩])/iu;

class WhatsAppAgentError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WhatsAppAgentError';
    this.code = code;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redactPersonalIdentifiers(value) {
  return String(value ?? '').replace(WHATSAPP_JID_GLOBAL, '[معرّف محجوب]')
    .replace(EMAIL_ADDRESS_GLOBAL, '[بريد محجوب]').replace(DIRECT_PHONE_GLOBAL, '[رقم محجوب]');
}

function redactGatewayText(value) {
  return redactPersonalIdentifiers(value);
}

function isSafeText(value, maximum = 1000, allowEmpty = false) {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0)
    && !WHATSAPP_JID.test(value) && !DIRECT_PHONE.test(value) && !EMAIL_ADDRESS.test(value);
}

function validateGatewayOutput(value) {
  if (!isPlainObject(value) || !['reply', 'intent', 'items'].every(key => Object.hasOwn(value, key))) return false;
  if (Object.keys(value).some(key => !['reply', 'intent', 'items', 'orderDetails'].includes(key))) return false;
  if (!isSafeText(value.reply, 1000) || !['chat', 'update_draft', 'request_confirmation', 'confirm', 'handoff'].includes(value.intent)) return false;
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS) return false;
  for (const item of value.items) {
    if (!isPlainObject(item) || Object.keys(item).some(key => !['itemId', 'quantity', 'notes'].includes(key))
      || Object.keys(item).length !== 3 || !isSafeText(item.itemId, 128)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY
      || !isSafeText(item.notes, 300, true)) return false;
  }
  if (Object.hasOwn(value, 'orderDetails')) {
    const details = value.orderDetails;
    if (!isPlainObject(details) || Object.keys(details).some(key => !['customerName', 'deliveryMethod', 'deliveryAddress', 'couponCode', 'paymentMethod'].includes(key))) return false;
    if (Object.hasOwn(details, 'customerName') && !isSafeText(details.customerName, 120, true)) return false;
    if (Object.hasOwn(details, 'deliveryMethod') && !['pickup', 'delivery'].includes(details.deliveryMethod)) return false;
    if (Object.hasOwn(details, 'deliveryAddress') && !isSafeText(details.deliveryAddress, 300, true)) return false;
    if (Object.hasOwn(details, 'couponCode') && !isSafeText(details.couponCode, 80, true)) return false;
    if (Object.hasOwn(details, 'paymentMethod') && !['cash', 'vodafone', 'instapay', 'etisalat'].includes(details.paymentMethod)) return false;
  }
  return true;
}

function readBoundedJson(response, limit = MAX_GATEWAY_BYTES) {
  return (async () => {
    if (!response.body) throw new WhatsAppAgentError('GATEWAY_INVALID_RESPONSE');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new WhatsAppAgentError('GATEWAY_INVALID_RESPONSE');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new WhatsAppAgentError('GATEWAY_INVALID_RESPONSE');
    }
  })();
}

function validateGatewayUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new WhatsAppAgentError('GATEWAY_NOT_CONFIGURED');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new WhatsAppAgentError('GATEWAY_NOT_CONFIGURED');
  }
  if (url.username || url.password || url.search || url.hash) throw new WhatsAppAgentError('GATEWAY_NOT_CONFIGURED');
  const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const allowLocalHttp = localHost && url.protocol === 'http:'
    && (process.env.NODE_ENV !== 'production' || process.env.AURA_INSTALLED_SMOKE === '1');
  if (url.protocol !== 'https:' && !allowLocalHttp) {
    throw new WhatsAppAgentError('GATEWAY_NOT_CONFIGURED');
  }
  return url.toString().replace(/\/$/, '');
}

function createGatewayClient({
  gatewayUrl = process.env.AURA_AI_GATEWAY_URL,
  installToken = process.env.AURA_AI_INSTALL_TOKEN,
  fetchImpl = globalThis.fetch,
  sleep = milliseconds => sleepTimer(milliseconds),
  timeoutMs = 12000,
} = {}) {
  return async function callGateway(payload) {
    const url = validateGatewayUrl(gatewayUrl);
    if (typeof installToken !== 'string' || installToken.length < 32 || installToken.length > 512 || typeof fetchImpl !== 'function') {
      throw new WhatsAppAgentError('GATEWAY_NOT_CONFIGURED');
    }
    let lastCode = 'GATEWAY_UNAVAILABLE';
    for (let attempt = 0; attempt < MAX_GATEWAY_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchImpl(`${url}/v1/agent/respond`, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${installToken}` },
          body: JSON.stringify(payload),
        });
        if (response.status === 429 || response.status >= 500) {
          lastCode = 'GATEWAY_UNAVAILABLE';
        } else if (!response.ok) {
          throw new WhatsAppAgentError('GATEWAY_REJECTED');
        } else {
          const answer = await readBoundedJson(response);
          if (!validateGatewayOutput(answer)) throw new WhatsAppAgentError('GATEWAY_INVALID_RESPONSE');
          return answer;
        }
      } catch (error) {
        if (error instanceof WhatsAppAgentError && error.code !== 'GATEWAY_UNAVAILABLE') throw error;
        lastCode = 'GATEWAY_UNAVAILABLE';
      }
      if (attempt < GATEWAY_RETRY_DELAYS.length) await sleep(GATEWAY_RETRY_DELAYS[attempt]);
    }
    throw new WhatsAppAgentError(lastCode);
  };
}

function parseDraftData(draft) {
  if (!draft) return null;
  if (isPlainObject(draft.data)) return draft.data;
  if (typeof draft.data === 'string') {
    try {
      const data = JSON.parse(draft.data);
      return isPlainObject(data) ? data : null;
    } catch {
      throw new WhatsAppAgentError('DRAFT_DATA_INVALID');
    }
  }
  return null;
}

function buildLocalSummary(draft) {
  const data = parseDraftData(draft) || draft || {};
  if (data.needsDeliveryFee) return null;
  const items = Array.isArray(data.items) ? data.items : [];
  const summary = isPlainObject(data.summary) ? data.summary : {};
  const details = isPlainObject(data.orderDetails) ? data.orderDetails : {};
  const deliveryMethod = data.deliveryMethod || details.deliveryMethod;
  const deliveryAddress = data.customer?.address || details.address;
  if (items.length === 0) return null;
  const lines = ['ملخص طلبك:'];
  for (const item of items) {
    const name = String(item.name || item.id || 'صنف').slice(0, 120);
    const quantity = Number(item.quantity);
    const price = Number(item.price);
    const lineTotal = Number.isFinite(quantity * price) ? quantity * price : 0;
    lines.push(`• ${name} × ${quantity} — ${lineTotal.toLocaleString('ar-EG')} ج.م`);
  }
  lines.push(`طريقة الاستلام: ${deliveryMethod === 'delivery' ? 'توصيل' : 'استلام من الفرع'}`);
  if (deliveryMethod === 'delivery' && deliveryAddress) lines.push(`العنوان: ${String(deliveryAddress).slice(0, 300)}`);
  lines.push(`الإجمالي: ${Number(summary.total || 0).toLocaleString('ar-EG')} ج.م`);
  lines.push('إذا كان الملخص صحيحاً، أرسل كلمة «تأكيد».');
  return lines.join('\n');
}

function buildGatewayPayload(snapshot, conversationHash, latestText) {
  const history = Array.isArray(snapshot.messages) ? snapshot.messages.slice(-14) : [];
  const messages = history.flatMap(message => {
    const customerText = redactGatewayText(message.text || '').slice(0, 1000);
    const rows = customerText.trim() ? [{ role: 'customer', text: customerText }] : [];
    if (message.replyText) rows.push({ role: 'assistant', text: '[رد سابق من النظام المحلي]' });
    return rows;
  });
  if (!messages.some(message => message.text === redactGatewayText(latestText).slice(0, 1000))) {
    messages.push({ role: 'customer', text: redactGatewayText(latestText).slice(0, 1000) });
  }
  const draftRow = snapshot.draft || null;
  const draftData = parseDraftData(draftRow) || {};
  const savedDetails = isPlainObject(draftData.orderDetails) ? draftData.orderDetails : {};
  const menuRows = Array.isArray(snapshot.menu) ? snapshot.menu : [];
  const inventoryRows = Array.isArray(snapshot.inventory) ? snapshot.inventory : [];
  const recipeRows = Array.isArray(snapshot.recipes) ? snapshot.recipes : [];
  const stockById = new Map(inventoryRows.map(item => [item.id, Number(item.quantity)]));
  const recipeById = new Map(recipeRows.map(item => [item.id, item]));
  const availableForOne = item => {
    if (item.isWeightBased === true) return false;
    const recipe = recipeById.get(item.id);
    if (Array.isArray(recipe?.recipe) && recipe.recipe.length) {
      return recipe.recipe.every(ingredient => {
        const required = Number(ingredient.quantity);
        return typeof ingredient.inventoryItemId === 'string' && Number.isFinite(required) && required >= 0
          && stockById.has(ingredient.inventoryItemId) && stockById.get(ingredient.inventoryItemId) >= required;
      });
    }
    return !stockById.has(item.id) || stockById.get(item.id) >= 1;
  };
  return {
    conversationHash,
    messages: messages.slice(-15),
    menu: menuRows.slice(0, 500).map(item => ({
      id: String(item.id || '').slice(0, 128),
      name: redactGatewayText(String(item.name || '')).slice(0, 200),
      price: Number(item.price) || 0,
      available: item.available !== false && item.isActive !== false && availableForOne(item),
    })).filter(item => item.id && item.name),
    draft: {
      id: null,
      version: Number(draftRow?.version || 0),
      status: String(draftRow?.status || 'collecting'),
      items: (Array.isArray(draftData.items) ? draftData.items : []).slice(0, MAX_ITEMS).map(item => ({
        itemId: String(item.id || item.itemId || '').slice(0, 128),
        quantity: Math.min(MAX_QUANTITY, Number(item.quantity) || 1),
        notes: redactGatewayText(item.notes || '').slice(0, 300),
      })).filter(item => item.itemId),
    },
    ...(savedDetails.deliveryMethod || savedDetails.couponCode || savedDetails.paymentMethod ? { orderDetails: {
      ...(savedDetails.deliveryMethod ? { deliveryMethod: savedDetails.deliveryMethod } : {}),
      ...(savedDetails.couponCode ? { couponCode: redactGatewayText(savedDetails.couponCode).slice(0, 80) } : {}),
      ...(savedDetails.paymentMethod ? { paymentMethod: savedDetails.paymentMethod } : {}),
    } } : {}),
  };
}

function normalizeOrderDetails(details, previous = {}) {
  const source = isPlainObject(details) ? details : {};
  const old = isPlainObject(previous) ? previous : {};
  return {
    customerName: String(source.customerName ?? old.customerName ?? 'عميل واتساب').trim().slice(0, 120),
    deliveryMethod: source.deliveryMethod ?? old.deliveryMethod ?? 'pickup',
    address: String(source.deliveryAddress ?? source.address ?? old.address ?? old.deliveryAddress ?? '').trim().slice(0, 300),
    couponCode: String(source.couponCode ?? old.couponCode ?? '').trim().slice(0, 80),
    paymentMethod: source.paymentMethod ?? old.paymentMethod ?? 'cash',
  };
}

function isExplicitConfirmation(text) {
  return EXPLICIT_CONFIRMATION.test(String(text || '').trim().replace(/[.!؟?]+$/u, '').trim());
}

function safeModelReply(reply) {
  const sanitized = String(reply || '').trim();
  if (!sanitized || sanitized.length > 1000 || WHATSAPP_JID.test(sanitized) || DIRECT_PHONE.test(sanitized)
    || EMAIL_ADDRESS.test(sanitized) || CURRENCY_OR_PRICE.test(sanitized)) return FALLBACK_REPLY;
  return sanitized;
}

function itemRejectionText(rejectedItems) {
  const rows = Array.isArray(rejectedItems) ? rejectedItems : [];
  if (rows.length === 0) return '';
  const messages = rows.slice(0, 5).map(item => {
    const name = String(item.name || item.itemId || 'الصنف').slice(0, 80);
    if (item.reason === 'unsupported_weight_based') return `لا أستطيع إضافة ${name} لأن الطلب الآلي لا يدعم حساب الوزن حالياً.`;
    if (item.reason === 'unavailable_stock') return `لم أضف ${name} لأن الكمية المتاحة لا تكفي.`;
    return `لم أضف ${name} لأنه غير متاح أو غير موجود في المنيو الحالي.`;
  });
  return messages.join('\n');
}

async function prepareReply(store, input, replyText, { waitForPrint = false } = {}) {
  return store.dispatch('whatsapp.message.reply.prepare', {
    accountId: input.accountId,
    conversationHash: input.conversationHash,
    messageId: input.messageId,
    replyText,
    encryptedReplyTarget: input.encryptedReplyTarget,
    waitForPrint,
  });
}

async function processWhatsAppMessage(store, input, { gatewayRequest, resumeExisting = false } = {}) {
  if (!store || typeof store.dispatch !== 'function') throw new WhatsAppAgentError('LOCAL_STORE_UNAVAILABLE');
  if (!isPlainObject(input) || input.accountId !== 'primary' || !/^[a-f0-9]{64}$/.test(input.conversationHash || '')
    || typeof input.messageId !== 'string' || !input.messageId || input.messageId.length > 128
    || typeof input.text !== 'string' || !input.text.trim() || input.text.length > MAX_MESSAGE_LENGTH
    || typeof input.encryptedReplyTarget !== 'string' || input.encryptedReplyTarget.length > 4096
    || typeof input.customerPhone !== 'string' || input.customerPhone.length > 64) {
    throw new WhatsAppAgentError('INVALID_INBOUND_MESSAGE');
  }

  const settings = await store.dispatch('whatsapp.agent.settings.get');
  if (!settings?.enabled || settings.consentVersion !== CONSENT_VERSION || !settings.consentAcceptedAt) return { ignored: true, reason: 'agent_disabled' };

  if (!resumeExisting) {
    const inserted = await store.dispatch('whatsapp.message.ingest', {
      accountId: input.accountId,
      conversationHash: input.conversationHash,
      messageId: input.messageId,
      text: input.text,
      encryptedReplyTarget: input.encryptedReplyTarget,
    });
    if (inserted?.duplicate) return { duplicate: true };
  }

  const claim = await store.dispatch('whatsapp.message.claim', {
    accountId: input.accountId,
    conversationHash: input.conversationHash,
    messageId: input.messageId,
  });
  if (!claim?.claimed) return { ignored: true, reason: claim?.reason || 'not_claimed' };

  const snapshot = await store.dispatch('whatsapp.agent.snapshot', {
    accountId: input.accountId,
    conversationHash: input.conversationHash,
  });
  if (snapshot?.conversation?.state === 'needs_staff') return { ignored: true, reason: 'needs_staff' };

  const draft = snapshot?.draft || null;
  const draftData = parseDraftData(draft) || {};
  if (isExplicitConfirmation(input.text)) {
    if (!draft || draft.status !== 'awaiting_confirmation' || draft.summaryVersion !== draft.version) {
      const reply = await prepareReply(store, input, 'لم أجد ملخصاً حالياً صالحاً للتأكيد. أرسل طلبك أو اطلب ملخصاً جديداً أولاً.');
      return { reply: reply || null };
    }
    let confirmed;
    try {
      confirmed = await store.dispatch('whatsapp.draft.confirm', {
        accountId: input.accountId,
        conversationHash: input.conversationHash,
        draftId: draft.id,
        expectedVersion: draft.version,
        customerPhone: input.customerPhone,
        confirmationMessageId: input.messageId,
        confirmationEncryptedReplyTarget: input.encryptedReplyTarget,
      });
    } catch (error) {
      if (error?.code !== 'STALE_SUMMARY') throw error;
      const latestSnapshot = await store.dispatch('whatsapp.agent.snapshot', {
        accountId: input.accountId,
        conversationHash: input.conversationHash,
      });
      let latestDraft = latestSnapshot?.draft || null;
      const latestData = parseDraftData(latestDraft) || {};
      if (latestDraft?.status === 'collecting' && Array.isArray(latestData.items) && latestData.items.length > 0) {
        const refreshed = await store.dispatch('whatsapp.draft.awaiting', {
          draftId: latestDraft.id,
          expectedVersion: latestDraft.version,
        });
        if (!refreshed?.conflict) latestDraft = refreshed.draft;
      }
      const currentSummary = latestDraft?.status === 'awaiting_confirmation'
        && latestDraft.summaryVersion === latestDraft.version ? buildLocalSummary(latestDraft) : null;
      const staleReplyText = currentSummary
        ? `تغيّر الطلب أثناء التأكيد؛ لم أُنشئه. راجع هذا الملخص المحدّث ثم أرسل «تأكيد» من جديد.\n${currentSummary}`
        : 'تغيّر الطلب أثناء التأكيد؛ لم أُنشئه. أرسل طلبك مجدداً لأعدّ ملخصاً جديداً، ثم أرسل «تأكيد».';
      const reply = await prepareReply(store, input, staleReplyText);
      return { staleSummary: true, order: null, reply: reply || null };
    }
    return { order: confirmed?.order || null, printJobs: confirmed?.printJobs || [], replay: Boolean(confirmed?.replay), awaitingPrint: true };
  }

  const makeGatewayRequest = gatewayRequest || createGatewayClient();
  let answer;
  try {
    const payload = buildGatewayPayload(snapshot || {}, input.conversationHash, input.text);
    answer = await makeGatewayRequest(payload);
  } catch {
    const fallback = await prepareReply(store, input, FALLBACK_REPLY);
    return { gatewayFailed: true, reply: fallback || null, orderCreated: false };
  }
  if (!validateGatewayOutput(answer)) {
    const fallback = await prepareReply(store, input, FALLBACK_REPLY);
    return { gatewayFailed: true, reply: fallback || null, orderCreated: false };
  }

  if (answer.intent === 'handoff') {
    await store.dispatch('whatsapp.conversation.handoff', { accountId: input.accountId, conversationHash: input.conversationHash });
    const reply = await prepareReply(store, input, 'سأحوّلك إلى أحد الموظفين لمساعدتك.');
    return { handoff: true, reply: reply || null };
  }
  if (answer.intent === 'confirm') {
    const reply = await prepareReply(store, input, 'لإنشاء الطلب، أرسل كلمة «تأكيد» بعد استلام ملخص الطلب الحالي.');
    return { confirmationRequired: true, reply: reply || null };
  }
  if (answer.intent === 'chat') {
    const reply = await prepareReply(store, input, safeModelReply(answer.reply));
    return { reply: reply || null };
  }

  const hasExistingDraft = Boolean(draft && Array.isArray(draftData.items) && draftData.items.length);
  if (answer.items.length === 0 && !hasExistingDraft) {
    const reply = await prepareReply(store, input, safeModelReply(answer.reply));
    return { reply: reply || null };
  }

  const updated = await store.dispatch('whatsapp.draft.update', {
    accountId: input.accountId,
    conversationHash: input.conversationHash,
    items: answer.items.length ? answer.items : draftData.items.map(item => ({ itemId: item.id || item.itemId, quantity: item.quantity, notes: item.notes || '' })),
    orderDetails: normalizeOrderDetails(answer.orderDetails, draftData.orderDetails),
    customerPhone: input.customerPhone,
    maximumQuantity: MAX_QUANTITY,
  });
  const rejection = itemRejectionText(updated?.rejectedItems);
  if (updated?.needsAddress) {
    const reply = await prepareReply(store, input, `${rejection ? `${rejection}\n` : ''}أرسل عنوان التوصيل لنكمل الطلب.`);
    return { reply: reply || null, draft: updated?.draft || null };
  }
  if (updated?.needsDeliveryFee) {
    await store.dispatch('whatsapp.conversation.handoff', { accountId: input.accountId, conversationHash: input.conversationHash });
    const reply = await prepareReply(store, input, 'رسوم التوصيل غير مهيأة محلياً؛ أحلت المحادثة إلى موظف لمراجعة السعر قبل تأكيد أي طلب.');
    return { handoff: true, needsDeliveryFee: true, reply: reply || null, draft: updated?.draft || null };
  }
  const updatedDraft = updated?.draft;
  const updatedData = parseDraftData(updatedDraft) || {};
  if (!updatedDraft || !Array.isArray(updatedData.items) || updatedData.items.length === 0) {
    const reply = await prepareReply(store, input, rejection || safeModelReply(answer.reply));
    return { reply: reply || null };
  }

  const awaiting = await store.dispatch('whatsapp.draft.awaiting', {
    accountId: input.accountId,
    conversationHash: input.conversationHash,
    draftId: updatedDraft.id,
    expectedVersion: updatedDraft.version,
  });
  if (awaiting?.conflict) {
    const reply = await prepareReply(store, input, 'تغيّر الطلب أثناء المراجعة؛ أرسل طلب ملخص جديد قبل التأكيد.');
    return { conflict: true, reply: reply || null };
  }
  const summary = buildLocalSummary(awaiting?.draft || updatedDraft);
  const replyText = `${rejection ? `${rejection}\n\n` : ''}${summary || FALLBACK_REPLY}`;
  const reply = await prepareReply(store, input, replyText);
  return { reply: reply || null, draft: awaiting?.draft || updatedDraft };
}

module.exports = {
  CONSENT_VERSION,
  MAX_ITEMS,
  MAX_QUANTITY,
  FALLBACK_REPLY,
  WhatsAppAgentError,
  createGatewayClient,
  validateGatewayOutput,
  redactPersonalIdentifiers,
  buildLocalSummary,
  isExplicitConfirmation,
  processWhatsAppMessage,
};
