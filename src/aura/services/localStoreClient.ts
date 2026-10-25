export interface LocalStoreError extends Error {
  code: string;
  status?: number;
  ambiguous?: boolean;
}

type Listener = () => void;
type NoticeResponse = { notices?: Array<{ id?: string; message?: string }> };
const listeners = new Set<Listener>();
const seenNotices = new Set<string>();
let bootstrapPromise: Promise<void> | null = null;

function publishNotices(data: NoticeResponse): void {
  if (typeof window === 'undefined') return;
  for (const notice of data.notices || []) {
    if (typeof notice.message !== 'string' || (notice.id && seenNotices.has(notice.id))) continue;
    if (notice.id) {
      if (seenNotices.size >= 100) seenNotices.clear();
      seenNotices.add(notice.id);
    }
    window.dispatchEvent(new CustomEvent('aura:local-store-notice', { detail: { id: notice.id, message: notice.message } }));
  }
}

export const localStoreClient = {
  async call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 45000);
    const mayMutate = !['bootstrap', 'orders.list', 'menu.get', 'inventory.get', 'coupons.list', 'coupons.logs', 'coupons.validate'].includes(action);
    try {
      const response = await fetch('/api/local-store', {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }),
      });
      let result: { ok?: boolean; data?: T; error?: { code?: string; message?: string } };
      try {
        result = await response.json();
      } catch {
        if (controller.signal.aborted) throw this.makeError('LOCAL_REQUEST_TIMEOUT', 'انتهت مهلة تأكيد العملية المحلية؛ لا تفترض أن الحفظ لم يحدث.', undefined, mayMutate);
        throw this.makeError('INVALID_RESPONSE', 'تعذر قراءة نتيجة العملية المحلية؛ حالة الحفظ غير مؤكدة.', response.status, mayMutate);
      }
      if (!result || typeof result !== 'object') throw this.makeError('INVALID_RESPONSE', 'استجابة الخادم المحلي غير صالحة.', response.status, mayMutate);
      if (!response.ok || result.ok !== true) {
        throw this.makeError(result.error?.code || `HTTP_${response.status}`, result.error?.message || 'تعذرت العملية المحلية.', response.status, mayMutate && response.status >= 500);
      }
      return result.data as T;
    } catch (error) {
      if (error instanceof Error && 'code' in error) throw error;
      throw this.makeError(controller.signal.aborted ? 'LOCAL_REQUEST_TIMEOUT' : 'LOCAL_SERVER_UNAVAILABLE',
        controller.signal.aborted ? 'انتهت مهلة تأكيد العملية المحلية.' : 'تعذر الاتصال بالخادم المحلي لتأكيد نتيجة العملية.', undefined, mayMutate);
    } finally {
      clearTimeout(deadline);
    }
  },
  makeError(code: string, message: string, status?: number, ambiguous = false): LocalStoreError {
    const error = new Error(message) as LocalStoreError;
    error.code = code;
    error.status = status;
    error.ambiguous = ambiguous;
    return error;
  },
  report(error: unknown, context: string): void {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'LOCAL_STORE_ERROR';
    console.error(`[local-store:${context}] ${code}`);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aura:local-store-error', { detail: { code, context } }));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (!bootstrapPromise) {
      bootstrapPromise = this.call<NoticeResponse>('bootstrap').then(data => {
        publishNotices(data);
        listeners.forEach(refresh => refresh());
      }).catch(error => {
        bootstrapPromise = null;
        this.report(error, 'bootstrap');
      });
    }
    return () => listeners.delete(listener);
  },
  async refresh(): Promise<void> {
    publishNotices(await this.call<NoticeResponse>('bootstrap'));
    listeners.forEach(listener => listener());
  },
};
