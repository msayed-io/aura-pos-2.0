import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const { createLocalStore } = require('../local-services/store.cjs');
const { processWhatsAppMessage, createGatewayClient, FALLBACK_REPLY } = require('../local-services/whatsapp-agent.cjs');

const previousTokenHashes = process.env.AURA_INSTALL_TOKEN_HASHES;
const installToken = randomBytes(32).toString('hex');
process.env.AURA_INSTALL_TOKEN_HASHES = createHash('sha256').update(installToken, 'utf8').digest('hex');
const { createGateway } = await import('../mini-services/ai-gateway/server.mjs?whatsapp-agent-e2e');
if (previousTokenHashes === undefined) delete process.env.AURA_INSTALL_TOKEN_HASHES;
else process.env.AURA_INSTALL_TOKEN_HASHES = previousTokenHashes;

test('local Gateway + real SQLite agent flow redacts phone, holds drafts, and creates once only after explicit confirmation', async t => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const seenPayloads = [];
  const gateway = createGateway({
    provider: async payload => {
      seenPayloads.push(payload);
      const latest = payload.messages.at(-1)?.text || '';
      if (latest.includes('أريد بيتزا')) {
        const delivery = latest.includes('توصيل');
        return {
          reply: 'أنشأت الطلب، السعر ٩٩٩٩ ج.م',
          intent: 'request_confirmation',
          items: [{ itemId: 'pizza-1', quantity: 1, notes: '' }],
          orderDetails: delivery
            ? { customerName: 'ضيف', deliveryMethod: 'delivery', deliveryAddress: 'حي الهرم', paymentMethod: 'cash' }
            : { customerName: 'ضيف', deliveryMethod: 'pickup', paymentMethod: 'cash' },
        };
      }
      return { reply: 'سأساعدك في استفسارك.', intent: 'chat', items: [] };
    },
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const address = gateway.address();
  assert.ok(address && typeof address === 'object');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-e2e-'));
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  t.after(async () => {
    await store.checkpointAndClose();
    await new Promise(resolve => { gateway.close(resolve); gateway.closeAllConnections?.(); });
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  await store.dispatch('whatsapp.agent.settings.set', { enabled: true, consentVersion: '1' });
  await store.dispatch('inventory.saveStock', { stock: { id: 'pizza-1', name: 'Pizza', quantity: 10 } });
  await store.dispatch('inventory.saveStock', { stock: { id: 'soldout-1', name: 'نفد', quantity: 0 } });
  await store.dispatch('menu.saveItem', { itemData: { id: 'pizza-1', name: 'بيتزا', price: 50, isActive: true } });
  await store.dispatch('menu.saveItem', { itemData: { id: 'soldout-1', name: 'صنف نافد', price: 8, isActive: true } });
  await store.dispatch('menu.saveItem', { itemData: { id: 'weight-1', name: 'صنف وزني', price: 4, isActive: true, isWeightBased: true } });

  const gatewayStatuses = [];
  const gatewayRequest = createGatewayClient({
    gatewayUrl: `http://127.0.0.1:${address.port}`,
    installToken,
    timeoutMs: 3000,
    fetchImpl: async (url, options) => {
      const response = await fetch(url, options);
      gatewayStatuses.push({ status: response.status, body: await response.clone().text() });
      return response;
    },
  });
  const common = {
    accountId: 'primary',
    conversationHash: 'a'.repeat(64),
    encryptedReplyTarget: 'opaque-encrypted-jid-reference',
    customerPhone: '201234567890',
  };

  const firstMessage = {
    ...common, messageId: 'inbound-1', text: 'أريد بيتزا، السعر ٥٠ جنيه، رقم هاتفي 201234567890 وبريدي mohamed@example.com',
  };
  const firstResults = await Promise.all([
    processWhatsAppMessage(store, firstMessage, { gatewayRequest }),
    processWhatsAppMessage(store, firstMessage, { gatewayRequest }),
  ]);
  const first = firstResults.find(result => !result.duplicate);
  assert.equal(firstResults.filter(result => result.duplicate).length, 1);
  assert.equal(await store.prisma.localWhatsAppMessage.count({ where: { messageId: 'inbound-1' } }), 1);
  assert.ok(first.draft);
  assert.equal(first.awaitingPrint, undefined);
  assert.equal(await store.prisma.localOrder.count(), 0);
  assert.equal((await store.dispatch('whatsapp.message.reply.pending')).length, 1);
  assert.match(first.reply.replyText, /ملخص طلبك/);
  assert.match(first.reply.replyText, /٥٠/);
  assert.doesNotMatch(first.reply.replyText, /٩٩٩٩/);
  assert.doesNotMatch(first.reply.replyText, /201234567890/);
  assert.equal(seenPayloads.length, 1);
  const menuSnapshot = new Map(seenPayloads[0].menu.map(item => [item.id, item]));
  assert.equal(menuSnapshot.get('pizza-1').price, 50);
  assert.equal(menuSnapshot.get('pizza-1').available, true);
  assert.equal(menuSnapshot.get('soldout-1').available, false);
  assert.equal(menuSnapshot.get('weight-1').available, false);
  assert.doesNotMatch(JSON.stringify(seenPayloads[0]), /201234567890|@s\.whatsapp\.net/);
  assert.doesNotMatch(JSON.stringify(seenPayloads[0]), /mohamed@example\.com/i);
  assert.match(seenPayloads[0].messages[0].text, /٥٠/);
  assert.match(seenPayloads[0].messages[0].text, /\[بريد محجوب\]/);
  assert.doesNotMatch(JSON.stringify(seenPayloads[0]), /ملخص طلبك/);
  const savedDraft = await store.prisma.localWhatsAppDraft.findFirst({ where: { accountId: common.accountId, conversationHash: common.conversationHash } });
  const savedDraftData = JSON.parse(savedDraft.data);
  savedDraftData.orderDetails.customerName = 'ضيف 201234567890 mohamed@example.com';
  savedDraftData.orderDetails.address = 'شارع 201234567890 mohamed@example.com';
  savedDraftData.items[0].notes = 'اتصل 201234567890 mohamed@example.com';
  await store.prisma.localWhatsAppDraft.update({ where: { id: savedDraft.id }, data: { data: JSON.stringify(savedDraftData) } });

  const ambiguous = await processWhatsAppMessage(store, {
    ...common, messageId: 'inbound-2', text: 'نعم، هل يوجد فرع قريب؟',
  }, { gatewayRequest });
  assert.ok(ambiguous.reply);
  assert.equal(await store.prisma.localOrder.count(), 0);
  assert.equal(gatewayStatuses.at(-1)?.status, 200, JSON.stringify(gatewayStatuses.map(row => row.status)));
  assert.equal(seenPayloads.length, 2, JSON.stringify({ gatewayFailed: ambiguous.gatewayFailed, reason: ambiguous.reason }));
  assert.equal(seenPayloads[1].menu.find(item => item.id === 'pizza-1').price, 50);
  assert.equal(seenPayloads[1].draft.id, null);
  assert.doesNotMatch(JSON.stringify(seenPayloads[1]), /٩٩٩٩|ملخص طلبك/);
  assert.doesNotMatch(JSON.stringify(seenPayloads[1]), /201234567890|mohamed@example\.com|@s\.whatsapp\.net/i);
  assert.equal(seenPayloads[1].orderDetails.customerName, undefined);
  assert.equal(seenPayloads[1].orderDetails.deliveryAddress, undefined);
  assert.match(seenPayloads[1].draft.items[0].notes, /\[بريد محجوب\]/);

  const softYes = await processWhatsAppMessage(store, {
    ...common, messageId: 'inbound-3', text: 'تمام',
  }, { gatewayRequest });
  assert.ok(softYes.reply);
  assert.equal(await store.prisma.localOrder.count(), 0);

  const confirmationMessage = { ...common, messageId: 'inbound-4', text: 'تأكيد' };
  const confirmationResults = await Promise.all([
    processWhatsAppMessage(store, confirmationMessage, { gatewayRequest }),
    processWhatsAppMessage(store, confirmationMessage, { gatewayRequest }),
  ]);
  const confirmation = confirmationResults.find(result => result.order);
  assert.equal(confirmationResults.filter(result => result.order).length, 1);
  assert.equal(confirmationResults.filter(result => result.duplicate).length, 1);
  assert.equal(confirmation.awaitingPrint, true);
  assert.equal(confirmation.order.source, 'WHATSAPP');
  assert.equal(confirmation.order.summary.total, 50);
  assert.equal(confirmation.order.customer.phone, common.customerPhone);
  assert.equal(await store.prisma.localOrder.count({ where: { source: 'WHATSAPP' } }), 1);
  assert.equal(await store.prisma.localPrintJob.count({ where: { orderId: confirmation.order.id, status: 'pending' } }), 2);
  assert.equal((await store.prisma.localWhatsAppMessage.findFirst({ where: { messageId: 'inbound-4' } })).replyStatus, 'waiting_print');
  assert.equal(await store.prisma.localOrder.count({ where: { source: 'WHATSAPP' } }), 1);
  assert.equal(await store.prisma.localPrintJob.count({ where: { orderId: confirmation.order.id } }), 2);
  const printJobs = await store.dispatch('whatsapp.print.pending');
  for (const job of printJobs.filter(row => row.orderId === confirmation.order.id)) {
    const claims = await Promise.all([
      store.dispatch('whatsapp.print.claim', { jobId: job.id }),
      store.dispatch('whatsapp.print.claim', { jobId: job.id }),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    await store.dispatch('whatsapp.print.complete', { jobId: job.id, status: 'printed' });
  }
  assert.equal(await store.prisma.localPrintJob.count({ where: { orderId: confirmation.order.id, status: 'printed' } }), 2);
  assert.equal((await store.prisma.localWhatsAppMessage.findFirst({ where: { messageId: 'inbound-4' } })).replyStatus, 'pending');

  const delivery = await processWhatsAppMessage(store, {
    ...common, conversationHash: 'b'.repeat(64), messageId: 'delivery-1', text: 'أريد بيتزا توصيل إلى حي الهرم',
  }, { gatewayRequest });
  assert.equal(delivery.handoff, true);
  assert.equal(delivery.needsDeliveryFee, true);
  assert.equal(await store.prisma.localOrder.count({ where: { source: 'WHATSAPP' } }), 1);
  assert.equal((await store.dispatch('whatsapp.agent.snapshot', { accountId: 'primary', conversationHash: 'b'.repeat(64) })).conversation.state, 'needs_staff');
});

test('stale confirmation racing with an item edit returns a fresh summary and creates no order', async t => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const gateway = createGateway({ provider: async () => ({
    reply: 'راجع الطلب قبل التأكيد.',
    intent: 'request_confirmation',
    items: [{ itemId: 'race-item', quantity: 1, notes: '' }],
    orderDetails: { deliveryMethod: 'pickup', paymentMethod: 'cash' },
  }) });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const gatewayAddress = gateway.address();
  assert.ok(gatewayAddress && typeof gatewayAddress === 'object');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-stale-confirm-'));
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  t.after(async () => {
    await store.checkpointAndClose();
    await new Promise(resolve => { gateway.close(resolve); gateway.closeAllConnections?.(); });
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  await store.dispatch('whatsapp.agent.settings.set', { enabled: true, consentVersion: '1' });
  await store.dispatch('inventory.saveStock', { stock: { id: 'race-item', name: 'صنف اختبار', quantity: 10 } });
  await store.dispatch('menu.saveItem', { itemData: { id: 'race-item', name: 'صنف اختبار', price: 50, isActive: true } });
  const gatewayRequest = createGatewayClient({
    gatewayUrl: `http://127.0.0.1:${gatewayAddress.port}`,
    installToken,
    timeoutMs: 3000,
  });
  const common = {
    accountId: 'primary',
    conversationHash: 'e'.repeat(64),
    encryptedReplyTarget: 'opaque-encrypted-jid-reference',
    customerPhone: '201234567890',
  };
  const first = await processWhatsAppMessage(store, {
    ...common, messageId: 'stale-summary-seed', text: 'أريد صنف اختبار',
  }, { gatewayRequest });
  assert.match(first.reply.replyText, /٥٠/);
  const original = await store.dispatch('whatsapp.agent.snapshot', { accountId: common.accountId, conversationHash: common.conversationHash });
  assert.equal(original.draft.status, 'awaiting_confirmation');
  const oldVersion = original.draft.version;

  let editInjected = false;
  const racingStore = {
    dispatch: async (action, payload) => {
      if (action === 'whatsapp.agent.snapshot' && !editInjected) {
        const beforeEdit = await store.dispatch(action, payload);
        const edited = await store.dispatch('whatsapp.draft.update', {
          accountId: common.accountId,
          conversationHash: common.conversationHash,
          draftId: beforeEdit.draft.id,
          items: [{ itemId: 'race-item', quantity: 2, notes: '' }],
          orderDetails: beforeEdit.draft.data.orderDetails,
          customerPhone: common.customerPhone,
        });
        assert.equal(edited.draft.version, oldVersion + 1);
        editInjected = true;
        return beforeEdit;
      }
      return store.dispatch(action, payload);
    },
  };
  const stale = await processWhatsAppMessage(racingStore, {
    ...common, messageId: 'stale-confirmation', text: 'تأكيد',
  }, { gatewayRequest });
  assert.equal(editInjected, true);
  assert.equal(stale.staleSummary, true);
  assert.equal(stale.order, null);
  assert.match(stale.reply.replyText, /لم أُنشئه/);
  assert.match(stale.reply.replyText, /ملخص طلبك/);
  assert.match(stale.reply.replyText, /١٠٠/);
  assert.equal(await store.prisma.localOrder.count(), 0);
  assert.equal(await store.prisma.localPrintJob.count(), 0);
  assert.equal((await store.dispatch('inventory.get')).stockList.find(item => item.id === 'race-item').quantity, 10);

  const updated = await store.dispatch('whatsapp.agent.snapshot', { accountId: common.accountId, conversationHash: common.conversationHash });
  assert.equal(updated.draft.version, oldVersion + 1);
  assert.equal(updated.draft.status, 'awaiting_confirmation');
  assert.equal(updated.draft.summaryVersion, updated.draft.version);
  const confirmed = await processWhatsAppMessage(store, {
    ...common, messageId: 'fresh-confirmation', text: 'تأكيد',
  }, { gatewayRequest });
  assert.equal(confirmed.order.summary.total, 100);
  assert.equal(await store.prisma.localOrder.count({ where: { source: 'WHATSAPP' } }), 1);
  assert.equal(await store.prisma.localPrintJob.count({ where: { orderId: confirmed.order.id } }), 2);
  assert.equal((await store.dispatch('inventory.get')).stockList.find(item => item.id === 'race-item').quantity, 8);
});

test('two distinct customer confirmation message IDs create one order and one print pair', async t => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-confirm-race-'));
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  t.after(async () => {
    await store.checkpointAndClose();
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  await store.dispatch('whatsapp.agent.settings.set', { enabled: true, consentVersion: '1' });
  await store.dispatch('inventory.saveStock', { stock: { id: 'confirm-item', name: 'صنف اختبار', quantity: 3 } });
  await store.dispatch('menu.saveItem', { itemData: { id: 'confirm-item', name: 'صنف اختبار', price: 25, isActive: true } });
  const conversation = 'f'.repeat(64);
  await store.dispatch('whatsapp.message.ingest', {
    accountId: 'primary', conversationHash: conversation, messageId: 'summary-seed', text: 'أريد صنف اختبار', encryptedReplyTarget: 'opaque-encrypted-jid-reference',
  });
  const draftResult = await store.dispatch('whatsapp.draft.update', {
    accountId: 'primary', conversationHash: conversation, items: [{ itemId: 'confirm-item', quantity: 1, notes: '' }],
    orderDetails: { deliveryMethod: 'pickup' }, customerPhone: '201234567890',
  });
  await store.dispatch('whatsapp.draft.awaiting', { draftId: draftResult.draft.id, expectedVersion: draftResult.draft.version });

  const common = { accountId: 'primary', conversationHash: conversation, text: 'تأكيد', encryptedReplyTarget: 'opaque-encrypted-jid-reference', customerPhone: '201234567890' };
  const outcomes = await Promise.all([
    processWhatsAppMessage(store, { ...common, messageId: 'confirm-distinct-1' }),
    processWhatsAppMessage(store, { ...common, messageId: 'confirm-distinct-2' }),
  ]);
  const orderIds = outcomes.map(result => result.order?.id).filter(Boolean);
  assert.equal(orderIds.length, 2);
  assert.equal(new Set(orderIds).size, 1);
  assert.equal(outcomes.filter(result => result.replay).length, 1);
  const savedOrder = await store.prisma.localOrder.findUnique({ where: { id: orderIds[0] } });
  assert.equal(savedOrder.draftId, draftResult.draft.id);
  assert.equal(await store.prisma.localOrder.count({ where: { draftId: draftResult.draft.id } }), 1);
  assert.equal(await store.prisma.localPrintJob.count({ where: { orderId: orderIds[0] } }), 2);
  const jobs = await store.dispatch('whatsapp.print.pending', {});
  for (const job of jobs.filter(row => row.orderId === orderIds[0])) {
    assert.equal(await store.dispatch('whatsapp.print.claim', { jobId: job.id }), true);
    await store.dispatch('whatsapp.print.complete', { jobId: job.id, status: 'printed' });
  }
  assert.equal(await store.prisma.localPrintJob.count({ where: { orderId: orderIds[0], status: 'printed' } }), 2);
});

test('stale processing message resumes through the real local Gateway without a second insert or reply', async t => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let providerCalls = 0;
  const gateway = createGateway({ provider: async () => { providerCalls += 1; return { reply: 'أهلاً، كيف أساعدك؟', intent: 'chat', items: [] }; } });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const gatewayAddress = gateway.address();
  assert.ok(gatewayAddress && typeof gatewayAddress === 'object');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-recovery-'));
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  t.after(async () => {
    await store.checkpointAndClose();
    await new Promise(resolve => { gateway.close(resolve); gateway.closeAllConnections?.(); });
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  await store.dispatch('whatsapp.agent.settings.set', { enabled: true, consentVersion: '1' });
  const message = {
    accountId: 'primary', conversationHash: 'd'.repeat(64), messageId: 'crash-inbound-1',
    text: 'مرحباً', encryptedReplyTarget: 'opaque-encrypted-jid-reference', customerPhone: '',
  };
  await store.dispatch('whatsapp.message.ingest', message);
  await store.dispatch('whatsapp.message.claim', { accountId: message.accountId, conversationHash: message.conversationHash, messageId: message.messageId });
  await store.prisma.localWhatsAppMessage.updateMany({ where: { messageId: message.messageId }, data: { updatedAt: BigInt(Date.now() - 300001) } });
  const recoverable = await store.dispatch('whatsapp.message.recoverable', {});
  assert.equal(recoverable.length, 1);
  assert.equal(recoverable[0].messageId, message.messageId);

  const gatewayRequest = createGatewayClient({
    gatewayUrl: `http://127.0.0.1:${gatewayAddress.port}`, installToken, timeoutMs: 3000,
  });
  const results = await Promise.all([
    processWhatsAppMessage(store, message, { gatewayRequest, resumeExisting: true }),
    processWhatsAppMessage(store, message, { gatewayRequest, resumeExisting: true }),
  ]);
  assert.equal(results.filter(result => result.reply).length, 1);
  assert.equal(providerCalls, 1);
  assert.equal(await store.prisma.localWhatsAppMessage.count({ where: { messageId: message.messageId } }), 1);
  assert.equal((await store.prisma.localWhatsAppMessage.findFirst({ where: { messageId: message.messageId } })).replyStatus, 'pending');
  assert.deepEqual(await store.dispatch('whatsapp.message.recoverable', {}), []);
  assert.equal(await store.prisma.localOrder.count(), 0);
});

test('Gateway outage gets bounded retries and exactly one safe fallback without a draft or order', async t => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-outage-'));
  const store = createLocalStore({ dataDir, seed: false, autoBackup: false });
  await store.initialize();
  t.after(async () => {
    await store.checkpointAndClose();
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  await store.dispatch('whatsapp.agent.settings.set', { enabled: true, consentVersion: '1' });
  let attempts = 0;
  const gatewayRequest = createGatewayClient({
    gatewayUrl: 'https://gateway.example', installToken: 'x'.repeat(64),
    fetchImpl: async () => { attempts += 1; return new Response('{"error":"unavailable"}', { status: 503 }); },
    sleep: async () => {},
  });
  const result = await processWhatsAppMessage(store, {
    accountId: 'primary', conversationHash: 'c'.repeat(64), messageId: 'offline-1',
    text: 'أريد بيتزا', encryptedReplyTarget: 'opaque-encrypted-jid-reference', customerPhone: '201234567890',
  }, { gatewayRequest });
  assert.equal(attempts, 3);
  assert.equal(result.gatewayFailed, true);
  assert.equal(result.reply.replyText, FALLBACK_REPLY);
  assert.equal(await store.prisma.localWhatsAppDraft.count(), 0);
  assert.equal(await store.prisma.localOrder.count(), 0);
  let pending = await store.dispatch('whatsapp.message.reply.pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].replyText, FALLBACK_REPLY);

  let malformedAttempts = 0;
  const malformedGateway = createGatewayClient({
    gatewayUrl: 'https://gateway.example', installToken: 'x'.repeat(64),
    fetchImpl: async () => { malformedAttempts += 1; return new Response('{broken', { status: 200 }); },
    sleep: async () => {},
  });
  const malformed = await processWhatsAppMessage(store, {
    accountId: 'primary', conversationHash: 'c'.repeat(64), messageId: 'offline-2',
    text: 'وأريد بطاطس', encryptedReplyTarget: 'opaque-encrypted-jid-reference', customerPhone: '201234567890',
  }, { gatewayRequest: malformedGateway });
  assert.equal(malformedAttempts, 1);
  assert.equal(malformed.gatewayFailed, true);
  assert.equal(malformed.reply.replyText, FALLBACK_REPLY);
  assert.equal(await store.prisma.localWhatsAppDraft.count(), 0);
  assert.equal(await store.prisma.localOrder.count(), 0);
  pending = await store.dispatch('whatsapp.message.reply.pending');
  assert.equal(pending.length, 2);
  assert.ok(pending.every(reply => reply.replyText === FALLBACK_REPLY));
});
