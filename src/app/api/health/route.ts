import { NextResponse } from 'next/server';
import { localStore, storeErrorResponse } from '@/server/localStore';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const smokeEventLoop = process.env.AURA_INSTALLED_SMOKE === '1'
  ? monitorEventLoopDelay({ resolution: 1 })
  : null;
smokeEventLoop?.enable();

export async function GET(request: Request) {
  try {
    if (smokeEventLoop && new URL(request.url).searchParams.get('resetEventLoop') === '1') smokeEventLoop.reset();
    await localStore.initialize();
    const health = {
      status: 'ok',
      database: 'ready',
      timestamp: Date.now(),
      ...(smokeEventLoop ? {
        eventLoopP99Ms: Number((smokeEventLoop.percentile(99) / 1e6).toFixed(1)),
        eventLoopSamples: smokeEventLoop.count,
      } : {}),
    };
    return NextResponse.json(health, {
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
