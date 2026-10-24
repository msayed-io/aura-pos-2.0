import type { PrismaClient } from '@prisma/client';
import { localStore } from '@/server/localStore';

function requireReadyClient(): PrismaClient {
  const client = localStore.prisma;
  if (!localStore.ready || !client) {
    throw Object.assign(new Error('قاعدة البيانات غير جاهزة؛ يجب انتظار التهيئة المحلية قبل الاستعلام.'), {
      code: 'DATABASE_NOT_READY',
    });
  }
  return client;
}

export async function getDb(): Promise<PrismaClient> {
  await localStore.initialize();
  return requireReadyClient();
}

// Keep the previous server export shape, but never capture null or open a second,
// unconfigured Prisma connection. Normal application operations use dispatch.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = requireReadyClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
