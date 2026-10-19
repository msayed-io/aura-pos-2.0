
import type { Order, OrderStatus } from '../dashboardTypes';
import { fraudDetectionService } from '../../../services/fraudDetectionService';

class OrderService {
    private subscribers: ((orders: Order[]) => void)[] = [];

    private orders: Order[] = [
        {
            id: 'o1',
            displayId: 'AURA-1001',
            createdAt: Date.now() - 3600000,
            items: [
                { id: 'm1', name: 'برجر أورا سوبريم', quantity: 2, price: 120 }
            ],
            customer: { name: 'عميل نقدي', phone: '-', address: '-' },
            status: 'Delivered' as any,
            summary: { subtotal: 240, deliveryFee: 0, discount: 0, total: 240 },
            isArchived: false,
            deliveryMethod: 'pickup',
            paymentMethod: 'cash'
        },
        {
            id: 'o2',
            displayId: 'AURA-1002',
            createdAt: Date.now() - 1800000,
            items: [
                { id: 'm3', name: 'ساندوتش دجاج راب', quantity: 1, price: 85 },
                { id: 'm5', name: 'بيبسي كانز', quantity: 2, price: 35 }
            ],
            customer: { name: 'محمد أحمد', phone: '0123456789', address: 'بنها' },
            status: 'Preparing' as any,
            summary: { subtotal: 155, deliveryFee: 20, discount: 0, total: 175 },
            isArchived: false,
            deliveryMethod: 'delivery',
            paymentMethod: 'cash'
        }
    ];

    constructor() {
        // Service is now stateful in-memory to preserve design.
    }
    
    private notifySubscribers() {
        this.subscribers.forEach(callback => callback([...this.orders]));
    }
    
    public reset() { }

    subscribe(callback: (orders: Order[]) => void) {
        this.subscribers.push(callback);
        callback([...this.orders]);
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }
    
    async addOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'isArchived' | 'displayId'>, cashierId: string, cashierName: string): Promise<Order> {
        const newOrder: Order = {
            id: `order_${Date.now()}`,
            displayId: `AURA-${1000 + this.orders.length + 1}`,
            createdAt: Date.now(),
            isArchived: false,
            ...orderData as any
        };
        
        // AI Fraud Detection Hook: Detect massive local discount applied at checkout
        if (newOrder.summary && newOrder.summary.discount > 0 && newOrder.summary.subtotal > 0) {
            fraudDetectionService.analyzeDiscount(
                newOrder.summary.subtotal,
                newOrder.summary.discount,
                false, // Assume absolute number for now
                cashierId,
                cashierName
            );
        }

        this.orders.push(newOrder);
        this.notifySubscribers();
        return newOrder;
    }

    public getPreviewDisplayId(): string {
        return `HB-POS-PREVIEW`;
    }

    async updateOrderStatus(orderId: string, status: OrderStatus, cashierId: string = 'system', cashierName: string = 'System') {
        const order = this.orders.find(o => o.id === orderId);
        if (order) {
            order.status = status;
            
            // AI Fraud Detection Hook: Detect Voiding
            if (status === 'Cancelled' || status === 'VOIDED') {
                 // Pass it through as any until types match DashboardOrder vs Master Order 
                 const orderObj: any = { totalPrice: order.summary?.total || 0, id: order.id };
                 fraudDetectionService.analyzeVoid(orderObj, cashierId, cashierName);
            }

            this.notifySubscribers();
        }
    }

    async updateOrder(orderId: string, updates: { customer: any; items: any[], summary: any, couponCode?: string }): Promise<void> {
        const orderIdx = this.orders.findIndex(o => o.id === orderId);
        if (orderIdx > -1) {
            this.orders[orderIdx] = { ...this.orders[orderIdx], ...updates as any };
            this.notifySubscribers();
        }
    }
    
    async archiveOrder(orderId: string) {
       const order = this.orders.find(o => o.id === orderId);
       if (order) {
           order.isArchived = true;
           this.notifySubscribers();
       }
    }
    
    async archiveAllActiveOrders() {
        this.orders = this.orders.map(o => ({ ...o, isArchived: true }));
        this.notifySubscribers();
    }

    async unarchiveOrder(orderId: string) {
       const order = this.orders.find(o => o.id === orderId);
       if (order) {
           order.isArchived = false;
           this.notifySubscribers();
       }
    }

    async deleteOrder(orderId: string) {
        this.orders = this.orders.filter(o => o.id !== orderId);
        this.notifySubscribers();
    }

    async deleteMultipleOrders(orderIds: string[]): Promise<boolean> {
        this.orders = this.orders.filter(o => !orderIds.includes(o.id));
        this.notifySubscribers();
        return true;
    }
}

export const dashboardOrderService = new OrderService();
