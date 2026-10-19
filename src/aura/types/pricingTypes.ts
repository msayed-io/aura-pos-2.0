// =============================================================================
// Aura POS 2.0 - Smart Dynamic Pricing Types
// أنواع نظام التسعير الديناميكي الذكي
// =============================================================================

// --- Condition Types (متى يتم تفعيل القاعدة) ---

export type PricingConditionType =
  | 'EXPIRY_APPROACHING'    // قرب انتهاء الصلاحية
  | 'LOW_STOCK'             // مخزون منخفض
  | 'TIME_OF_DAY'           // ساعات محددة
  | 'DAY_OF_WEEK'           // أيام محددة
  | 'SEASONAL_PERIOD'       // فترات موسمية (رمضان، عيد)
  | 'CUSTOMER_SEGMENT'      // شريحة العملاء (VIP، جديد، عائد)
  | 'QUANTITY_PURCHASED'    // خصم الكمية
  | 'COMBINATION_DEAL';     // اشترِ X واحصل على Y

// --- Action Types (ماذا يحدث عند تحقق الشرط) ---

export type PricingActionType =
  | 'PERCENTAGE_DISCOUNT'      // خصم بنسبة مئوية
  | 'FIXED_PRICE'              // سعر محدد
  | 'GRADUAL_DISCOUNT'         // خصم تدريجي يزداد مع الوقت
  | 'BUY_X_GET_Y'             // اشترِ X واحصل على Y مجاناً/بخصم
  | 'LOYALTY_POINTS_BONUS';   // نقاط ولاء إضافية بدلاً من خصم

// --- Condition & Action Interfaces ---

export interface PricingCondition {
  type: PricingConditionType;
  params: Record<string, string | number | boolean>;
  // Examples:
  // { hoursStart: 13, hoursEnd: 16 } for TIME_OF_DAY
  // { thresholdPercent: 20 } for LOW_STOCK
  // { daysBeforeExpiry: 7 } for EXPIRY_APPROACHING
  // { days: [5, 6] } for DAY_OF_WEEK (Friday=5, Saturday=6)
  // { seasonName: 'ramadan', startMonth: 3, startDay: 1, endMonth: 4, endDay: 1 } for SEASONAL_PERIOD
  // { segment: 'VIP' } for CUSTOMER_SEGMENT
  // { minQuantity: 5 } for QUANTITY_PURCHASED
  // { requiredProductId: 'prod_1', freeProductId: 'prod_2', freeQuantity: 1 } for COMBINATION_DEAL
}

export interface PricingAction {
  type: PricingActionType;
  params: Record<string, string | number | boolean>;
  // Examples:
  // { discountPercent: 10 } for PERCENTAGE_DISCOUNT
  // { fixedPrice: 50 } for FIXED_PRICE
  // { initialDiscountPercent: 5, incrementPercent: 5, incrementIntervalDays: 2 } for GRADUAL_DISCOUNT
  // { buyQuantity: 2, getQuantity: 1, discountPercent: 100 } for BUY_X_GET_Y
  // { pointsMultiplier: 2 } for LOYALTY_POINTS_BONUS
}

// --- Safety Limits ---

export interface PricingSafetyLimits {
  minPrice: number;           // الحد الأدنى المطلق للسعر المسموح
  maxPrice: number;           // الحد الأقصى المطلق للسعر المسموح
  maxDailyDiscount: number;   // أقصى إجمالي خصم يومي (جنيه)
  maxUsesPerCustomer: number; // أقصى عدد مرات استخدام لكل عميل (-1 = بلا حدود)
  validFrom: number;          // تاريخ بدء تفعيل القاعدة (timestamp)
  validUntil: number;         // تاريخ انتهاء القاعدة (timestamp)
}

// --- Pricing Rule ---

export interface PricingRule {
  id: string;
  name: string;               // الاسم العربي للعرض
  description: string;        // الوصف العربي
  productIds: string[];       // المنتجات المطبقة (فارغ = الكل)
  categoryIds: string[];      // الفئات المطبقة (فارغ = الكل)
  conditions: PricingCondition[];
  actions: PricingAction[];
  safetyLimits: PricingSafetyLimits;
  priority: number;           // الأعلى = الأكثر أهمية
  canCombineWithOthers: boolean; // هل يمكن تجميعه مع قواعد أخرى
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  totalAppliedCount: number;  // عدد مرات التطبيق
  totalRevenueImpact: number; // إجمالي الخصم المعطى (جنيه)
}

// --- Pricing Result ---

export interface PricingResultAppliedRule {
  ruleId: string;
  ruleName: string;
  discountAmount: number;
  reason: string;  // التفسير العربي
}

export interface PricingResult {
  originalPrice: number;
  finalPrice: number;
  appliedRules: PricingResultAppliedRule[];
  totalSavings: number;
  isWithinSafetyLimits: boolean;
}

// --- Pricing Suggestion (for learning/suggestions system) ---

export type PricingSuggestionType =
  | 'INCREASE_DISCOUNT'
  | 'DECREASE_DISCOUNT'
  | 'CHANGE_TIMING'
  | 'DEACTIVATE_RULE'
  | 'NEW_RULE';

export type PricingSuggestionImpact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface PricingSuggestion {
  id: string;
  ruleId: string;
  type: PricingSuggestionType;
  title: string;          // العربي
  description: string;    // العربي
  confidence: number;     // 0-1
  impact: PricingSuggestionImpact;
  suggestedChanges: Partial<PricingRule>;
  createdAt: number;
  isRead: boolean;
  isApproved: boolean;
}

// --- Expiry Pricing Tier ---

export interface ExpiryPricingTier {
  daysBeforeExpiry: number;
  discountPercent: number;
}

// --- Audit Entry ---

export interface PricingAuditEntry {
  id: string;
  timestamp: number;
  ruleId: string;
  ruleName: string;
  productId: string;
  productName: string;
  originalPrice: number;
  newPrice: number;
  cashierId: string;
  orderId: string;
}

// --- Price Calculation Context ---

export interface PriceCalculationContext {
  quantity: number;
  customerId?: string;
  customerSegment?: 'VIP' | 'NEW' | 'RETURNING';
  currentStock?: number;
  expiryDate?: number;
  currentTime?: number; // defaults to Date.now()
  orderItems?: { productId: string; quantity: number }[]; // for combo deals
}

// --- Reporting Types ---

export interface PricingReport {
  totalRulesActive: number;
  totalDiscountsGiven: number;   // جنيه
  totalRevenueImpact: number;    // جنيه (يمكن أن يكون سالباً)
  mostEffectiveRule: { id: string; name: string; appliedCount: number } | null;
  leastEffectiveRule: { id: string; name: string; appliedCount: number } | null;
  wastePrevented: number;        // جنيه تم توفيره من خصومات الصلاحية
  suggestionsCount: number;
  periodStart: number;
  periodEnd: number;
}

export interface PricingRulePerformanceOverTime {
  date: string;
  appliedCount: number;
  revenueImpact: number;
}

export interface PricingComparisonResult {
  period1Label: string;
  period2Label: string;
  period1: PricingReport;
  period2: PricingReport;
  discountChange: number;       // percentage change
  revenueImpactChange: number;  // percentage change
  wastePreventedChange: number; // percentage change
}

// --- Daily Discount Tracker ---

export interface DailyDiscountRecord {
  date: string;            // YYYY-MM-DD
  ruleId: string;
  totalDiscount: number;   // جنيه
  usageCount: number;
}

// --- Customer Usage Tracker ---

export interface CustomerUsageRecord {
  customerId: string;
  ruleId: string;
  usageCount: number;
}
