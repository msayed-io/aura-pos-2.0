import type { Order, OrderStatus } from '../dashboardTypes';
import { fraudDetectionService } from '../../../services/fraudDetectionService';
import { localStoreClient } from '../../../services/localStoreClient';

class OrderService {
  private subscribers: ((orders: Order[]) => void)[] = [];
  private orders: Order[] = [];
  private refreshInFlight: Promise<void> | null = null;

  private notifySubscribers() { this.subscribers.forEach(callback => callback([...this.orders])); }
  private async refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = localStoreClient.call<Order[]>('orders.list').then(orders => { this.orders = orders; this.notifySubscribers(); }).finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }
  public reset() { this.orders = []; this.notifySubscribers(); }
  subscribe(callback: (orders: Order[]) => void) {
    this.subscribers.push(callback);
    callback([...this.orders]);
    const unsubscribeStore = localStoreClient.subscribe(() => { void this.refresh().catch(error => localStoreClient.report(error, 'orders.subscribe')); });
    void this.refresh().catch(error => localStoreClient.report(error, 'orders.subscribe'));
    return () => { this.subscribers = this.subscribers.filter(cb => cb !== callback); unsubscribeStore(); };
  }
  async addOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'isArchived' | 'displayId'>, cashierId: string, cashierName: string): Promise<Order> {
    const order = await localStoreClient.call<Order>('orders.add', { orderData, cashierId, cashierName });
    this.orders = [order, ...this.orders.filter(existing => existing.id !== order.id)];
    this.notifySubscribers();
    if (!order._isReplay && order.summary?.discount > 0 && order.summary?.subtotal > 0) {
      fraudDetectionService.analyzeDiscount(order.summary.subtotal, order.summary.discount, false, cashierId, cashierName);
    }
    return order;
  }
  public getPreviewDisplayId(): string { return 'HB-POS-PREVIEW'; }
  async updateOrderStatus(orderId: string, status: OrderStatus, cashierId = 'system', cashierName = 'System') {
    await localStoreClient.call('orders.status', { orderId, status, cashierId, cashierName });
    await this.refresh();
    if (status === 'Cancelled' || status === 'VOIDED') {
      const order = this.orders.find(item => item.id === orderId);
      fraudDetectionService.analyzeVoid({ totalPrice: order?.summary?.total || 0, id: orderId } as never, cashierId, cashierName);
    }
  }
  async updateOrder(orderId: string, updates: { customer: any; items: any[]; summary: any; couponCode?: string }): Promise<void> {
    await localStoreClient.call('orders.update', { orderId, updates }); await this.refresh();
  }
  async archiveOrder(orderId: string) { await localStoreClient.call('orders.archive', { orderId, isArchived: true }); await this.refresh(); }
  async archiveAllActiveOrders() { await localStoreClient.call('orders.archiveAll'); await this.refresh(); }
  async unarchiveOrder(orderId: string) { await localStoreClient.call('orders.archive', { orderId, isArchived: false }); await this.refresh(); }
  async deleteOrder(orderId: string) { await localStoreClient.call('orders.delete', { orderIds: [orderId] }); await this.refresh(); }
  async deleteMultipleOrders(orderIds: string[]): Promise<boolean> { const result = await localStoreClient.call<boolean>('orders.delete', { orderIds }); await this.refresh(); return result; }
}
export const dashboardOrderService = new OrderService();
