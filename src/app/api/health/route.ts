import { NextResponse } from 'next/server';
import { localStore, storeErrorResponse } from '@/server/localStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await localStore.initialize();
    return NextResponse.json({ status: 'ok', database: 'ready', timestamp: Date.now() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const failure = storeErrorResponse(error);
    console.error('[local-store] startup health failed', { code: failure.code });
    return NextResponse.json({ status: 'error', error: { code: failure.code, message: failure.message } }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
