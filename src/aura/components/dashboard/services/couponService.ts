import type { Coupon, CouponUsageLog } from '../../../types';

class CouponService {
    private subscribers: ((data: Coupon[]) => void)[] = [];

    constructor() {
        // Service is now stateless and does not connect to Firebase.
    }

    private notifySubscribers() {
        this.subscribers.forEach(callback => callback([]));
    }

    public reset() {}

    subscribe(callback: (data: Coupon[]) => void): () => void {
        this.subscribers.push(callback);
        callback([]); // Immediately return empty data
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    async saveCoupon(couponData: Partial<Coupon>): Promise<Coupon> {
        console.log("Coupon service is offline. Action ignored.");
        return couponData as Coupon;
    }

    async deleteCoupon(couponIdOrCode: string): Promise<boolean> {
        console.log("Coupon service is offline. Action ignored.");
        return true;
    }
    
    async validateAndApplyCoupon(code: string): Promise<{ success: boolean; coupon?: Coupon; message?: string }> {
        console.log("Coupon service is offline. Validation will always fail.");
        return { success: false, message: 'النظام غير متصل حالياً.' };
    }

    async incrementCouponUsage(code: string): Promise<void> {
        console.log("Coupon service is offline. Action ignored.");
    }

    async logCouponUsage(logData: Omit<CouponUsageLog, 'id' | 'timestamp'>): Promise<void> {
        console.log("Coupon service is offline. Action ignored.");
    }

    async getAllLogs(): Promise<CouponUsageLog[]> {
        console.log("Coupon service is offline. Returning empty logs.");
        return [];
    }
}

export const couponService = new CouponService();
