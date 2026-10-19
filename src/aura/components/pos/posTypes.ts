import { MenuItem, Coupon } from '../../types';
import type { PricingResult } from '../../types/pricingTypes';

// --- Local Types for Checkout UI ---
export type DeliveryMethod = 'delivery' | 'pickup';
export type PaymentMethod = 'cash' | 'vodafone' | 'instapay';

// --- Cart Item Type (Local to POS) ---
export interface CartItem extends MenuItem {
    quantity: number;
    notes?: string;
    // [PRICING ENGINE INTEGRATION] Extended fields for pricing engine results
    _originalPrice?: number;
    _pricingResult?: PricingResult;
}

// --- Checkout Step Type ---
export type CheckoutStep = 'cart' | 'type_selection' | 'delivery_details' | 'dine_in_payment';

// --- Promotion Type ---
// Use the global Coupon type for promotions to ensure consistency
export type Promotion = Coupon;