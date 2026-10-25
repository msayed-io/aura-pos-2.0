import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { localStore, storeErrorResponse } from '@/server/localStore';
import { hasLocalGeminiApiKey } from '../../../../local-services/whatsapp-agent.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const envelopeSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.unknown().optional(),
}).strict();
const responseHeaders = { 'Cache-Control': 'no-store' };
const RENDERER_WHATSAPP_ACTIONS = new Set([
  'whatsapp.agent.settings.get', 'whatsapp.agent.settings.set',
  'whatsapp.agent.personality.get', 'whatsapp.agent.personality.set',
  'whatsapp.conversation.list', 'whatsapp.conversation.resume', 'whatsapp.conversation.handoff',
]);

function isGatewayConfigured(): boolean {
  if (hasLocalGeminiApiKey()) return true;
  const rawUrl = process.env.AURA_AI_GATEWAY_URL;
  const token = process.env.AURA_AI_INSTALL_TOKEN;
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048 || typeof token !== 'string' || token.length < 32 || token.length > 512) return false;
  try {
    const url = new URL(rawUrl);
    const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    return !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && localHost && url.protocol === 'http:'));
  } catch {
    return false;
  }
}

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

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    // Next may canonicalize the internal URL hostname to localhost even when the
    // browser loaded 127.0.0.1. Validate the real Host without trusting forwarded
    // headers, and require the actual bound port plus an exact browser Origin.
    const host = request.headers.get('host') || '';
    const localHost = /^(127\.0\.0\.1|localhost|\[::1\]):([1-9]\d{0,4})$/.exec(host);
    const port = localHost ? Number(localHost[2]) : 0;
    const boundPort = Number(process.env.PORT || url.port || 80);
    if (!localHost || port > 65535 || port !== boundPort || request.headers.get('origin') !== `http://${host}`) {
      throw new RequestError('ORIGIN_REJECTED', 403, 'هذه العملية متاحة من نافذة التطبيق المحلية فقط.');
    }
    const parsed = envelopeSchema.safeParse(await readLimitedJson(request));
    if (!parsed.success) throw new RequestError('INVALID_REQUEST', 400, 'صيغة العملية غير صالحة.');
    if (parsed.data.action.startsWith('whatsapp.') && !RENDERER_WHATSAPP_ACTIONS.has(parsed.data.action)) {
      throw new RequestError('ACTION_NOT_ALLOWED', 403, 'هذه العملية متاحة لخدمة التطبيق المحلية فقط.');
    }
    const gatewayConfigured = isGatewayConfigured();
    const settingPayload = parsed.data.payload && typeof parsed.data.payload === 'object'
      ? parsed.data.payload as Record<string, unknown> : {};
    if (parsed.data.action === 'whatsapp.agent.settings.set' && settingPayload.enabled === true && !gatewayConfigured) {
      throw new RequestError('GATEWAY_NOT_CONFIGURED', 409, 'لم يتم إعداد بوابة الذكاء الاصطناعي بأمان بعد.');
    }
    await localStore.initialize();
    const data = await localStore.dispatch(parsed.data.action, parsed.data.payload);
    const safeData = parsed.data.action === 'whatsapp.agent.settings.get' && data && typeof data === 'object'
      ? { ...data, gatewayConfigured } : data;
    return NextResponse.json({ ok: true, data: safeData }, { headers: responseHeaders });
  } catch (error) {
    const failure = error instanceof RequestError
      ? { code: error.code, message: error.message, status: error.status }
      : storeErrorResponse(error);
    if (failure.status >= 500) console.error('[local-store] dispatch failed', { code: failure.code });
    return NextResponse.json({ ok: false, error: { code: failure.code, message: failure.message } }, {
      status: failure.status, headers: responseHeaders,
    });
  }
}
