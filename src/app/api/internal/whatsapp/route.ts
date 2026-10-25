import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { localStore, storeErrorResponse } from '@/server/localStore';
import { processWhatsAppMessage } from '../../../../../local-services/whatsapp-agent.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 48 * 1024;
const responseHeaders = { 'Cache-Control': 'no-store' };
const processPayloadSchema = z.object({
  accountId: z.literal('primary'),
  conversationHash: z.string().regex(/^[a-f0-9]{64}$/),
  messageId: z.string().min(1).max(128),
  text: z.string().min(1).max(8192),
  encryptedReplyTarget: z.string().min(16).max(4096),
  customerPhone: z.string().max(64),
}).strict();
const replyClaimSchema = z.object({ replyId: z.string().min(8).max(128) }).strict();
const replyCompleteSchema = z.object({
  replyId: z.string().min(8).max(128),
  status: z.enum(['sent', 'failed', 'unknown']),
}).strict();
const printClaimSchema = z.object({ jobId: z.string().min(1).max(128) }).strict();
const printCompleteSchema = z.object({
  jobId: z.string().min(1).max(128),
  status: z.enum(['printed', 'failed', 'unknown']),
  errorCode: z.string().max(48).optional(),
}).strict();
const envelopeSchema = z.object({
  action: z.enum(['message.process', 'message.recoverable', 'message.recover', 'reply.pending', 'reply.claim', 'reply.complete', 'reply.recover', 'print.pending', 'print.claim', 'print.complete', 'print.recover', 'conversation.list', 'conversation.cleanup']),
  payload: z.unknown().optional(),
}).strict();

class RequestError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

async function readLimitedJson(request: NextRequest): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new RequestError('INVALID_CONTENT_TYPE', 415, 'الطلب يجب أن يكون JSON.');
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) {
    throw new RequestError('REQUEST_TOO_LARGE', 413, 'حجم العملية أكبر من الحد المحلي المسموح.');
  }
  if (!request.body) throw new RequestError('INVALID_REQUEST', 400, 'محتوى العملية مفقود.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError('REQUEST_TOO_LARGE', 413, 'حجم العملية أكبر من الحد المحلي المسموح.');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestError('INVALID_JSON', 400, 'بيانات العملية غير صالحة.');
  }
}

function validateInternalCaller(request: NextRequest) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';
  const localHost = /^(127\.0\.0\.1|localhost|\[::1\]):([1-9]\d{0,4})$/.exec(host);
  const port = localHost ? Number(localHost[2]) : 0;
  const boundPort = Number(process.env.PORT || url.port || 80);
  const expectedToken = process.env.AURA_INTERNAL_WHATSAPP_TOKEN;
  const auth = request.headers.get('authorization') || '';
  if (!localHost || port > 65535 || port !== boundPort || request.headers.get('origin') !== `http://${host}`
    || typeof expectedToken !== 'string' || expectedToken.length < 64 || auth !== `Bearer ${expectedToken}`) {
    throw new RequestError('ORIGIN_REJECTED', 403, 'هذه العملية متاحة لخدمة التطبيق المحلية فقط.');
  }
}

export async function POST(request: NextRequest) {
  try {
    validateInternalCaller(request);
    const parsed = envelopeSchema.safeParse(await readLimitedJson(request));
    if (!parsed.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة العملية غير صالحة.');
    await localStore.initialize();
    const payload = parsed.data.payload;
    let data: unknown;
    switch (parsed.data.action) {
      case 'message.process': {
        const checked = processPayloadSchema.safeParse(payload);
        if (!checked.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة الرسالة غير صالحة.');
        data = await processWhatsAppMessage(localStore, checked.data);
        break;
      }
      case 'message.recoverable':
        data = await localStore.dispatch('whatsapp.message.recoverable', {});
        break;
      case 'message.recover': {
        const checked = processPayloadSchema.safeParse(payload);
        if (!checked.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة الرسالة غير صالحة.');
        data = await processWhatsAppMessage(localStore, checked.data, { resumeExisting: true });
        break;
      }
      case 'reply.pending':
        data = await localStore.dispatch('whatsapp.message.reply.pending', {});
        break;
      case 'reply.claim': {
        const checked = replyClaimSchema.safeParse(payload);
        if (!checked.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة الرد غير صالحة.');
        data = await localStore.dispatch('whatsapp.message.reply.claim', checked.data);
        break;
      }
      case 'reply.complete': {
        const checked = replyCompleteSchema.safeParse(payload);
        if (!checked.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة نتيجة الرد غير صالحة.');
        data = await localStore.dispatch('whatsapp.message.reply.complete', checked.data);
        break;
      }
      case 'reply.recover':
        data = await localStore.dispatch('whatsapp.message.reply.recover', {});
        break;
      case 'print.pending':
        data = await localStore.dispatch('whatsapp.print.pending', {});
        break;
      case 'print.claim': {
        const checked = printClaimSchema.safeParse(payload);
        if (!checked.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة مهمة الطباعة غير صالحة.');
        data = await localStore.dispatch('whatsapp.print.claim', checked.data);
        break;
      }
      case 'print.complete': {
        const checked = printCompleteSchema.safeParse(payload);
        if (!checked.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة نتيجة الطباعة غير صالحة.');
        data = await localStore.dispatch('whatsapp.print.complete', checked.data);
        break;
      }
      case 'print.recover':
        data = await localStore.dispatch('whatsapp.print.recover', {});
        break;
      case 'conversation.list':
        data = await localStore.dispatch('whatsapp.conversation.list', {});
        break;
      case 'conversation.cleanup':
        data = await localStore.dispatch('whatsapp.cleanup', { days: 30 });
        break;
    }
    return NextResponse.json({ ok: true, data }, { headers: responseHeaders });
  } catch (error) {
    const failure = error instanceof RequestError
      ? { code: error.code, message: error.message, status: error.status }
      : storeErrorResponse(error);
    if (failure.status >= 500) console.error('[whatsapp-agent] internal operation failed', { code: failure.code });
    return NextResponse.json({ ok: false, error: { code: failure.code, message: failure.message } }, {
      status: failure.status, headers: responseHeaders,
    });
  }
}
