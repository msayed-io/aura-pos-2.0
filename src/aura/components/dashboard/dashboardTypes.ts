export type OrderStatus = 'Order Received' | 'Preparing' | 'Out for Delivery' | 'Delivered' | 'Cancelled' | 'VOIDED';
export type PaymentMethod = 'cash' | 'vodafone' | 'instapay' | 'etisalat';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  barcode?: string;
  isWeightBased?: boolean;
  weight?: number;
  serialNumbers?: string[];
}

export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
}

export interface OrderSummary {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
}

export interface Order {
  id: string;
  displayId: string;
  createdAt: number;
  items: OrderItem[];
  customer: CustomerInfo;
  status: OrderStatus;
  summary: OrderSummary;
  isArchived?: boolean;
  isEdited?: boolean; // Added to track edited orders
  deliveryMethod: 'pickup' | 'delivery';
  paymentMethod: PaymentMethod;
  editCode?: string;
  _source?: 'POS'; // Internal source tracking field
  couponCode?: string; // To track used coupon
  quantity?: number; // Total quantity from new schema
  cashierId?: string;
  cashierName?: string;
  source?: string;
  orderType?: string;
  _requestId?: string;
  _isReplay?: boolean;
}
