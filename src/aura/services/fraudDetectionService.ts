import { FraudAlert, FraudSeverity, FraudType, Order, LogEntry, LogActionType } from '../types';

class FraudDetectionService {
  private alerts: FraudAlert[] = [];

  // Analyze a recently cancelled or voided order
  analyzeVoid(order: Order, cashierId: string, cashierName: string): FraudAlert | null {
    // Heuristic 1: Large void amount
    if (order.totalPrice > 1000) {
      return this.triggerAlert({
        cashierId,
        cashierName,
        orderId: order.id,
        severity: FraudSeverity.CRITICAL,
        type: FraudType.EXCESSIVE_VOIDS,
        description: `تم رصد إلغاء طلب ضخم بقيمة ${order.totalPrice} جنيه.`,
        value: order.totalPrice
      });
    }

    return null;
  }

  // Analyze applied discount
  analyzeDiscount(orderTotal: number, discountValue: number, isPercentage: boolean, cashierId: string, cashierName: string): FraudAlert | null {
    const discountAmount = isPercentage ? (orderTotal * discountValue) / 100 : discountValue;
    
    // Heuristic 2: Unusually high discount (> 40% or > 200 EGP)
    const discountRatio = discountAmount / orderTotal;
    
    if (discountRatio > 0.4 || discountAmount > 200) {
       return this.triggerAlert({
        cashierId,
        cashierName,
        severity: FraudSeverity.HIGH,
        type: FraudType.UNUSUAL_DISCOUNTS,
        description: `تم إعطاء خصم غير اعتيادي بقيمة ${discountAmount} جنيه (${(discountRatio * 100).toFixed(0)}%).`,
        value: discountAmount
      });
    }
    return null;
  }

  private triggerAlert(data: Omit<FraudAlert, 'id' | 'timestamp' | 'isResolved'>): FraudAlert {
    const newAlert: FraudAlert = {
      ...data,
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      isResolved: false
    };
    
    this.alerts.push(newAlert);
    
    // In a real env, this would persist to DB and push notification
    console.warn('[AI Fraud Detection] Suspicious Activity Flagged:', newAlert);
    
    return newAlert;
  }

  getAlerts(): FraudAlert[] {
    return this.alerts;
  }
}

export const fraudDetectionService = new FraudDetectionService();
