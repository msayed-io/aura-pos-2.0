





export enum OrderSource {
  ONLINE = 'ONLINE',
  AGGREGATOR = 'AGGREGATOR', // Talabat/Jahez simulation
  POS = 'POS'
}

export enum BusinessMode {
  RESTAURANT = 'RESTAURANT',
  RETAIL = 'RETAIL', // Supermarkets, Retail
}

export enum InventoryUnit {
  PIECE = 'PIECE', // القطعة
  GRAM = 'GRAM', // جرام
  KG = 'KG', // كيلوجرام
  ML = 'ML', // مليلتر
  LITER = 'LITER', // لتر
  BOX = 'BOX', // كرتونة/صندوق
}

export enum InventoryItemType {
  MATERIAL = 'MATERIAL', // مواد خام (دقيق، جبنة)
  PRODUCT = 'PRODUCT', // منتج نهائي يتباع للعميل (بيتزا، موبايل)
  BUNDLE = 'BUNDLE', // عرض تجميعي (ثلاجة + غسالة)
}

export interface RecipeIngredient {
  inventoryItemId: string;
  quantity: number;
  unit: InventoryUnit;
}

export interface InventoryStock {
  id: string;
  name: string;
  type: InventoryItemType;
  unit: InventoryUnit;
  quantity: number;
  costPerUnit: number;
  lowStockThreshold: number;
  supplierId?: string;
  barcode?: string;
}

export interface SerialNumberRecord {
  serialNumber: string;
  productId: string;
  status: 'AVAILABLE' | 'SOLD' | 'RETURNED';
  addedAt: number;
  soldAt?: number;
  orderId?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  creditBalance: number; // For deferred payments
}

export interface PurchaseInvoiceItem {
  inventoryItemId: string;
  quantity: number;
  unit: InventoryUnit;
  costPerUnit: number;
  totalCost: number;
}

export interface PurchaseInvoice {
  id: string;
  supplierId: string;
  date: number;
  items: PurchaseInvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
}

export interface InventoryAlert {
  id: string;
  timestamp: number;
  itemId: string;
  itemName: string;
  currentStock: number;
  predictedDepletionDays: number; // AI Insight
  message: string;
  isResolved: boolean;
}

export enum OfflineSyncStatus {
  SYNCED = 'SYNCED',
  PENDING = 'PENDING',
  FAILED = 'FAILED'
}

export enum FraudSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum FraudType {
  EXCESSIVE_VOIDS = 'EXCESSIVE_VOIDS',
  UNUSUAL_DISCOUNTS = 'UNUSUAL_DISCOUNTS',
  GHOST_ORDERS = 'GHOST_ORDERS',
  OFFLINE_MANIPULATION = 'OFFLINE_MANIPULATION',
  SUSPICIOUS_REFUND = 'SUSPICIOUS_REFUND'
}

export interface FraudAlert {
  id: string;
  timestamp: number;
  cashierId: string;
  cashierName?: string;
  orderId?: string;
  severity: FraudSeverity;
  type: FraudType;
  description: string;
  isResolved: boolean;
  value?: number; // Related monetary value
}

export enum AIAlertCategory {
  PROFIT_OPPORTUNITY = 'PROFIT_OPPORTUNITY',
  INVENTORY_RISK = 'INVENTORY_RISK',
  FINANCIAL_FRAUD = 'FINANCIAL_FRAUD',
  SYSTEM_ANOMALY = 'SYSTEM_ANOMALY'
}

export interface SmartNotification {
  id: string;
  timestamp: number;
  category: AIAlertCategory;
  title: string;
  message: string;
  actionRequired?: string;
  isRead: boolean;
  relatedData?: any;
}

export interface DynamicPricingRule {
  isEnabled: boolean;
  basePrice: number;
  minPrice: number;
  maxPrice: number;
  peakHoursIncreasePct?: number;
  lowStockIncreasePct?: number;
  happyHourDecreasePct?: number;
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY'
}

export enum OrderStatus {
  COMPLETED = 'COMPLETED',
  PENDING = 'PENDING',
  VOIDED = 'VOIDED',
  PENDING_APPROVAL = 'PENDING_APPROVAL'
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  cost: number; // For profit calc
  category: string;
  notes?: string;
  barcode?: string; // Retail mode
  isWeightBased?: boolean; // Retail mode
  weight?: number; // Retail mode
  serialNumbers?: string[]; // Track which serials were sold for this item
}

export interface Order {
  id:string;
  timestamp: number;
  totalPrice: number;
  items: OrderItem[];
  source: OrderSource;
  type: OrderType;
  status: OrderStatus;
  customerId?: string; // Phone or User ID
  customerName?: string; // Added for search functionality in InvoicesTab
  cashierId?: string;
  discount: number;
  preparationTimeSeconds: number;
  branchId: string;
  isArchived?: boolean;
  isEdited?: boolean;
  
  // Offline & Hybrid Data
  syncStatus?: OfflineSyncStatus;
  offlineCreatedAt?: number;

  // AI Fraud Detection Metadata
  fraudScore?: number;
  isFlaggedForReview?: boolean;
}

export interface Customer {
  id: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: number;
}

export interface StaffMetrics {
  id: string;
  name: string;
  role: string;
  ordersHandled: number;
  voidsCount: number;
  totalSales: number;
}

// Props for Tab components
export interface TabProps {
  orders: Order[];
  isLoading: boolean;
  dateRange: { start: Date; end: Date };
}

// New types for export functionality
export enum ExportFormat {
  CSV = 'CSV',
  JSON = 'JSON',
  PDF = 'PDF', // Added PDF format
}

export type OrderKeys = keyof Omit<Order, 'items'> | 'itemDetails' | 'itemCount' | 'orderDate' | 'orderTime';

export interface ExportOptions {
  format: ExportFormat;
  startDate: Date;
  endDate: Date;
  selectedFields: OrderKeys[];
}

// Types for Settings -> Menu Management
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  /** Legacy category identifiers retained for existing menu records. */
  category?: string;
  categoryKey?: string;
  _originalPrice?: number;
  _pricingResult?: import('./types/pricingTypes').PricingResult;
  primaryCategory: string; // The main category (can be 'new_release' or a regular category id)
  libraryCategories?: string[]; // For display in library tabs
  isNewRelease?: boolean; // True if it should appear on the homepage
  isActive?: boolean;
  position?: number;
  tags?: string[];
  
  // Retail (Supermarket) Additions
  barcode?: string;
  sku?: string;
  stockQuantity?: number; // Total available stock computed or manual
  isWeightBased?: boolean; // E.g., for produce/cheese
  cost?: number; // Needed for margin analysis

  // Universal Inventory Fields
  inventoryType?: InventoryItemType;
  baseUnit?: InventoryUnit;
  recipe?: RecipeIngredient[]; // For BOM logic (what it consumes when sold)
  requiresSerial?: boolean; // For tech/electronics tracking
  batchTracking?: boolean; // For perishables
  supplierId?: string; // Link to supplier

  // AI Dynamic Pricing & Recommendations
  dynamicPricing?: DynamicPricingRule; // For AI Dynamic Pricing
  aiTags?: string[]; // E.g., ['breakfast', 'high_margin', 'goes_well_with_coffee']
  crossSellItems?: string[]; // IDs of items frequently bought together
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface Offer {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  categoryKey: string; // usually fixed to cat_offers; retain legacy string values
  isActive?: boolean;
  durationInSeconds?: number | null;
  expiresAt?: number | null;
  createdAt?: number; // Added for new spec
}

// New type for user management
export interface User {
  id: string;
  username: string;
  password?: string; // Should be optional when fetching, required on creation
  profilePicture: string;
  accessLevel: 'Admin' | 'Cashier';
  // New fields for VIP Admin identity verification
  fullName?: string; // الاسم الخماسي
  nationalId?: string; // الرقم القومي
  dateOfBirth?: string; // YYYY-MM-DD
  idExpiryDate?: string; // YYYY-MM-DD
}

// New types for Coupon Management
export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  usageLimit: number;
  usageCount: number;
  expiresAt: number | null;
  createdAt: number;
  isActive: boolean;
}

export interface CouponUsageLog {
  id: string;
  couponId: string;
  orderId: string;
  timestamp: number;
  discountApplied: number;
  customerName: string; // Simplified for this view
}

// New Types for Cashier Logging
export enum LogActionType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_PRINTED_CUSTOMER = 'ORDER_PRINTED_CUSTOMER',
  ORDER_PRINTED_KITCHEN = 'ORDER_PRINTED_KITCHEN',
  // FIX: Added missing enum members.
  ORDER_VOIDED = 'ORDER_VOIDED',
  ORDER_VOID_ATTEMPT = 'ORDER_VOID_ATTEMPT',
  SHIFT_START = 'SHIFT_START',
  SHIFT_END = 'SHIFT_END',
}

export interface LogEntry {
  id: string;
  timestamp: number;
  cashierId: string;
  cashierName: string;
  action: LogActionType;
  orderId?: string;
  details?: Record<string, any>; // e.g., { total: 150, type: 'DINE_IN' }
  isArchived?: boolean; // New: For archiving void logs
  
  // Offline tracking
  syncStatus?: OfflineSyncStatus;

  // Realtime fraud flags
  isSuspicious?: boolean;
  fraudAlertId?: string;
}

export interface StaffPerformanceSummary {
    id: string;
    name: string;
    totalSales: number;
    orderCount: number;
    voidCount: number;
    printCount: number;
    lastActivity: number;
}

export interface Complaint {
  id: string;
  customerName: string;
  customerPhone: string;
  complaintText: string;
  timestamp: number;
  isRead: boolean;
  isReplied?: boolean;
  replyText?: string;
  isArchived?: boolean;
  archivedAt?: number;
}

// New types for CRM Page
export interface CrmCustomer {
  id: string; // phone number
  name: string;
  phone: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: number;
  firstOrderDate: number;
  orders: Order[];
  itemFrequency: Map<string, { name: string; count: number }>;
}

// Updated type for promotions
export type PromotionType = 'SIMPLE_ANNOUNCEMENT' | 'COUPON_DISCOUNT' | 'FREE_DELIVERY';

export interface Promotion {
  id: string;
  type: PromotionType | 'offer' | 'promotion';
  title?: string;
  description?: string;
  imageUrl?: string;
  textKey?: string;
  targetView?: 'home' | 'menu' | 'offers';
  couponCode?: string | null;
  discountPercentage?: number | null;
  discountAmount?: number | null;
  discountMessageKey?: string | null;
  freeDeliveryMinAmount?: number | null;
  freeDeliveryMessageKey?: string | null;
}

// New type for reservation items
export interface ReservationItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

// Updated type for reservations
export interface Reservation {
  id: string;
  displayId: string;
  name: string;
  phone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h format)
  guests: number;
  notes?: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  createdAt: number;
  paymentMethod?: 'vodafone' | 'instapay' | string;
  items?: ReservationItem[];
  subtotal?: number;
  downPayment?: number;
  total?: number;
}
