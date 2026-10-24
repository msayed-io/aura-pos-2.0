import type { PrismaClient } from '@prisma/client';
import { getDefaultStore, StoreError as CoreStoreError } from '../../local-services/store.cjs';

export interface LocalStore {
  readonly ready: boolean;
  readonly prisma: PrismaClient | null;
  initialize(): Promise<unknown>;
  dispatch(action: string, payload?: unknown): Promise<unknown>;
  checkpointAndClose(): Promise<void>;
  createBackup(): Promise<string>;
  verifySettings(): Promise<{ journalMode: string; synchronous: number; foreignKeys: number; busyTimeout: number }>;
}

// Only API/server modules may import this facade. The browser uses localStoreClient.
export const localStore = getDefaultStore() as LocalStore;

export function storeErrorResponse(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof CoreStoreError) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
      ? error.status : 500;
    return { code: error.code, message: error.message, status };
  }
  return {
    code: 'LOCAL_STORE_UNAVAILABLE',
    message: 'تعذر الوصول إلى قاعدة البيانات المحلية. لم يُؤكَّد حفظ العملية؛ راجع التنبيه وأعد المحاولة.',
    status: 503,
  };
}
