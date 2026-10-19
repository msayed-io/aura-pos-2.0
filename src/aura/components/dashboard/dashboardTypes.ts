export type OrderStatus = 'Order Received' | 'Preparing' | 'Out for Delivery' | 'Delivered';
export type PaymentMethod = 'cash' | 'vodafone' | 'instapay' | 'etisalat';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
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
}
