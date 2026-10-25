import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { localStore } from '@/server/localStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function equalSecret(expected: string | undefined, supplied: string | null): boolean {
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(supplied, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const port = process.env.PORT;
  const expectedHost = port ? `127.0.0.1:${port}` : '';
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  const expectedOrigin = `http://${expectedHost}`;
  const origin = request.headers.get('origin');
  const secret = process.env.AURA_INTERNAL_SHUTDOWN_TOKEN;
  const authorization = request.headers.get('authorization') ?? '';
  const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!secret || !port) {
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL_SHUTDOWN_DISABLED' } }, { status: 503 });
  }
  if (host !== expectedHost || origin !== expectedOrigin) {
    return NextResponse.json({ ok: false, error: { code: 'UNTRUSTED_SHUTDOWN_ORIGIN' } }, { status: 403 });
  }
  if (!equalSecret(secret, suppliedSecret)) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED_SHUTDOWN' } }, { status: 401 });
  }

  try {
    await localStore.checkpointAndClose();
    return NextResponse.json({ ok: true, status: 'checkpointed' });
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'DATABASE_CHECKPOINT_FAILED' } }, { status: 500 });
  }
}
