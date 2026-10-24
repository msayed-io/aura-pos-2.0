import type { Coupon, CouponUsageLog } from '../../../types';
import { localStoreClient } from '../../../services/localStoreClient';
class CouponService {
  private subscribers: ((data: Coupon[]) => void)[] = [];
  private coupons: Coupon[] = [];
  private async refresh() { this.coupons = await localStoreClient.call<Coupon[]>('coupons.list'); this.notify(); }
  private notify() { this.subscribers.forEach(callback => callback([...this.coupons])); }
  public reset() { this.coupons = []; this.notify(); }
  subscribe(callback: (data: Coupon[]) => void): () => void {
    this.subscribers.push(callback); callback([...this.coupons]);
    const unsubscribe = localStoreClient.subscribe(() => { void this.refresh().catch(error => localStoreClient.report(error, 'coupons.subscribe')); });
    void this.refresh().catch(error => localStoreClient.report(error, 'coupons.subscribe'));
    return () => { this.subscribers = this.subscribers.filter(cb => cb !== callback); unsubscribe(); };
  }
  async saveCoupon(couponData: Partial<Coupon>): Promise<Coupon> { const result = await localStoreClient.call<Coupon>('coupons.save', { couponData }); await this.refresh(); return result; }
  async deleteCoupon(couponIdOrCode: string): Promise<boolean> { const result = await localStoreClient.call<boolean>('coupons.delete', { couponIdOrCode }); await this.refresh(); return result; }
  async validateAndApplyCoupon(code: string): Promise<{ success: boolean; coupon?: Coupon; message?: string }> { return localStoreClient.call('coupons.validate', { code }); }
  async incrementCouponUsage(code: string): Promise<void> { await localStoreClient.call('coupons.increment', { code }); await this.refresh(); }
  async logCouponUsage(logData: Omit<CouponUsageLog, 'id' | 'timestamp'>): Promise<void> { await localStoreClient.call('coupons.log', { logData }); }
  async getAllLogs(): Promise<CouponUsageLog[]> { return localStoreClient.call('coupons.logs'); }
}
export const couponService = new CouponService();
