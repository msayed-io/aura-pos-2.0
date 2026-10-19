// =============================================================================
// Aura POS 2.0 - Smart Dynamic Pricing Engine
// محرك التسعير الديناميكي الذكي
// =============================================================================

import type {
  PricingRule,
  PricingCondition,
  PricingAction,
  PricingSafetyLimits,
  PricingResult,
  PricingResultAppliedRule,
  PricingSuggestion,
  ExpiryPricingTier,
  PricingAuditEntry,
  PriceCalculationContext,
  DailyDiscountRecord,
  CustomerUsageRecord,
  PricingConditionType,
} from '../types/pricingTypes';

// --- Helper: Generate unique ID ---
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// --- Helper: Get today's date string YYYY-MM-DD ---
function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// --- Helper: Safe localStorage access ---
function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Graceful fallback - storage may be full or unavailable
  }
}

// =============================================================================
// PricingEngine Singleton Class
// =============================================================================

class PricingEngine {
  private rules: PricingRule[] = [];
  private suggestions: PricingSuggestion[] = [];
  private auditLog: PricingAuditEntry[] = [];
  private dailyDiscounts: DailyDiscountRecord[] = [];
  private customerUsage: CustomerUsageRecord[] = [];

  // localStorage keys
  private static RULES_KEY = 'aura_pricing_rules';
  private static SUGGESTIONS_KEY = 'aura_pricing_suggestions';
  private static AUDIT_KEY = 'aura_pricing_audit';
  private static DAILY_DISCOUNTS_KEY = 'aura_pricing_daily_discounts';
  private static CUSTOMER_USAGE_KEY = 'aura_pricing_customer_usage';

  constructor() {
    this.loadFromStorage();
    this.resetDailyDiscountsIfNeeded();
  }

  // ===========================================================================
  // Rule Management
  // ===========================================================================

  addRule(
    rule: Omit<PricingRule, 'id' | 'createdAt' | 'updatedAt' | 'totalAppliedCount' | 'totalRevenueImpact'>
  ): PricingRule {
    try {
      const now = Date.now();
      const newRule: PricingRule = {
        ...rule,
        id: generateId('rule'),
        createdAt: now,
        updatedAt: now,
        totalAppliedCount: 0,
        totalRevenueImpact: 0,
      };
      this.rules.push(newRule);
      this.saveRulesToStorage();
      return newRule;
    } catch (error) {
      console.error('خطأ في إضافة قاعدة التسعير:', error);
      throw error;
    }
  }

  updateRule(ruleId: string, updates: Partial<PricingRule>): PricingRule {
    try {
      const index = this.rules.findIndex(r => r.id === ruleId);
      if (index === -1) {
        throw new Error(`قاعدة التسعير غير موجودة: ${ruleId}`);
      }
      const updatedRule: PricingRule = {
        ...this.rules[index],
        ...updates,
        id: this.rules[index].id, // id cannot be changed
        createdAt: this.rules[index].createdAt, // createdAt cannot be changed
        updatedAt: Date.now(),
      };
      this.rules[index] = updatedRule;
      this.saveRulesToStorage();
      return updatedRule;
    } catch (error) {
      console.error('خطأ في تحديث قاعدة التسعير:', error);
      throw error;
    }
  }

  deleteRule(ruleId: string): void {
    try {
      this.rules = this.rules.filter(r => r.id !== ruleId);
      // Also clean up related daily discount records
      this.dailyDiscounts = this.dailyDiscounts.filter(d => d.ruleId !== ruleId);
      this.customerUsage = this.customerUsage.filter(c => c.ruleId !== ruleId);
      this.saveRulesToStorage();
      this.saveDailyDiscountsToStorage();
      this.saveCustomerUsageToStorage();
    } catch (error) {
      console.error('خطأ في حذف قاعدة التسعير:', error);
      throw error;
    }
  }

  getRules(): PricingRule[] {
    return [...this.rules];
  }

  getActiveRules(): PricingRule[] {
    const now = Date.now();
    return this.rules.filter(rule => {
      if (!rule.isActive) return false;
      if (now < rule.safetyLimits.validFrom || now > rule.safetyLimits.validUntil) return false;
      return true;
    });
  }

  toggleRule(ruleId: string): void {
    try {
      const rule = this.rules.find(r => r.id === ruleId);
      if (rule) {
        rule.isActive = !rule.isActive;
        rule.updatedAt = Date.now();
        this.saveRulesToStorage();
      }
    } catch (error) {
      console.error('خطأ في تبديل حالة القاعدة:', error);
      throw error;
    }
  }

  // ===========================================================================
  // Price Calculation
  // ===========================================================================

  calculatePrice(
    productId: string,
    basePrice: number,
    context: PriceCalculationContext,
    productName: string = '',
    cashierId: string = '',
    orderId: string = ''
  ): PricingResult {
    try {
      const currentTime = context.currentTime ?? Date.now();
      const appliedRules: PricingResultAppliedRule[] = [];
      let finalPrice = basePrice;
      let totalSavings = 0;
      let isWithinSafetyLimits = true;

      // Get active rules sorted by priority (highest first)
      const activeRules = this.getActiveRules()
        .filter(rule => this.ruleAppliesToProduct(rule, productId))
        .sort((a, b) => b.priority - a.priority);

      // Check daily discount limit context
      const today = getTodayString();

      for (const rule of activeRules) {
        // Check if all conditions are met
        const conditionsMet = this.evaluateConditions(rule.conditions, {
          ...context,
          currentTime,
        });

        if (!conditionsMet) continue;

        // Check customer usage limit
        if (context.customerId && rule.safetyLimits.maxUsesPerCustomer !== -1) {
          const usage = this.getCustomerUsage(context.customerId, rule.id);
          if (usage >= rule.safetyLimits.maxUsesPerCustomer) continue;
        }

        // Check daily discount limit
        const dailyRecord = this.getDailyDiscount(today, rule.id);
        if (dailyRecord.totalDiscount >= rule.safetyLimits.maxDailyDiscount) continue;

        // Calculate discount from this rule's actions
        const discountResult = this.applyActions(rule.actions, finalPrice, {
          ...context,
          currentTime,
          basePrice,
        });

        if (discountResult.discountAmount <= 0 && discountResult.newPrice === finalPrice) continue;

        const discountAmount = finalPrice - discountResult.newPrice;

        // Check if price would go below safety minimum
        const proposedPrice = discountResult.newPrice;
        if (proposedPrice < rule.safetyLimits.minPrice) {
          const adjustedPrice = rule.safetyLimits.minPrice;
          const adjustedDiscount = finalPrice - adjustedPrice;
          if (adjustedDiscount > 0) {
            finalPrice = adjustedPrice;
            totalSavings += adjustedDiscount;
            appliedRules.push({
              ruleId: rule.id,
              ruleName: rule.name,
              discountAmount: adjustedDiscount,
              reason: this.buildReasonText(rule, adjustedDiscount, true),
            });
            this.recordDiscount(today, rule.id, adjustedDiscount);
            this.updateRuleStats(rule.id, adjustedDiscount);
            this.incrementCustomerUsage(context.customerId, rule.id);
          }
          isWithinSafetyLimits = false;
        } else if (proposedPrice > rule.safetyLimits.maxPrice) {
          finalPrice = rule.safetyLimits.maxPrice;
          const adjustedDiscount = finalPrice - rule.safetyLimits.maxPrice;
          if (adjustedDiscount > 0) {
            totalSavings += adjustedDiscount;
            appliedRules.push({
              ruleId: rule.id,
              ruleName: rule.name,
              discountAmount: adjustedDiscount,
              reason: this.buildReasonText(rule, adjustedDiscount, false),
            });
          }
          isWithinSafetyLimits = false;
        } else {
          finalPrice = proposedPrice;
          totalSavings += discountAmount;
          appliedRules.push({
            ruleId: rule.id,
            ruleName: rule.name,
            discountAmount,
            reason: this.buildReasonText(rule, discountAmount, false),
          });
          this.recordDiscount(today, rule.id, discountAmount);
          this.updateRuleStats(rule.id, discountAmount);
          this.incrementCustomerUsage(context.customerId, rule.id);
        }

        // If rule cannot combine with others, stop after first applicable rule
        if (!rule.canCombineWithOthers) break;
      }

      // Round final price to 2 decimal places
      finalPrice = Math.round(finalPrice * 100) / 100;
      totalSavings = Math.round(totalSavings * 100) / 100;

      const result: PricingResult = {
        originalPrice: basePrice,
        finalPrice,
        appliedRules,
        totalSavings,
        isWithinSafetyLimits,
      };

      // Log to audit trail
      if (appliedRules.length > 0 && productName) {
        this.logAudit({
          productId,
          productName,
          originalPrice: basePrice,
          newPrice: finalPrice,
          cashierId,
          orderId,
          appliedRules,
        });
      }

      return result;
    } catch (error) {
      console.error('خطأ في حساب السعر:', error);
      return {
        originalPrice: basePrice,
        finalPrice: basePrice,
        appliedRules: [],
        totalSavings: 0,
        isWithinSafetyLimits: true,
      };
    }
  }

  // ===========================================================================
  // Expiry Pricing
  // ===========================================================================

  calculateExpiryPrice(
    productId: string,
    basePrice: number,
    expiryDate: number,
    tiers: ExpiryPricingTier[]
  ): number {
    try {
      const now = Date.now();

      // If expired, return -1 (product should be blocked from sale)
      if (now >= expiryDate) {
        return -1;
      }

      if (tiers.length === 0) return basePrice;

      // Sort tiers by daysBeforeExpiry descending (most urgent first)
      const sortedTiers = [...tiers].sort((a, b) => b.daysBeforeExpiry - a.daysBeforeExpiry);

      const msPerDay = 86400000;
      const daysUntilExpiry = (expiryDate - now) / msPerDay;

      // Find the first tier that applies (the one with the highest discount whose threshold we've crossed)
      for (const tier of sortedTiers) {
        if (daysUntilExpiry <= tier.daysBeforeExpiry) {
          const discountAmount = basePrice * (tier.discountPercent / 100);
          return Math.round((basePrice - discountAmount) * 100) / 100;
        }
      }

      // No tier applies yet
      return basePrice;
    } catch (error) {
      console.error('خطأ في حساب سعر الصلاحية:', error);
      return basePrice;
    }
  }

  // ===========================================================================
  // Learning / Suggestions
  // ===========================================================================

  analyzeRulePerformance(): PricingSuggestion[] {
    try {
      const newSuggestions: PricingSuggestion[] = [];
      const activeRules = this.getActiveRules();

      for (const rule of activeRules) {
        // Rule applied many times but low revenue impact → increase discount
        if (rule.totalAppliedCount > 50 && Math.abs(rule.totalRevenueImpact) < rule.totalAppliedCount * 0.5) {
          newSuggestions.push({
            id: generateId('sug'),
            ruleId: rule.id,
            type: 'INCREASE_DISCOUNT',
            title: 'زيادة نسبة الخصم',
            description: `القاعدة "${rule.name}" تم تطبيقها ${rule.totalAppliedCount} مرة ولكن التأثير على الإيرادات منخفض. ننصح بزيادة الخصم لتحفيز المبيعات.`,
            confidence: 0.65,
            impact: 'POSITIVE',
            suggestedChanges: {
              actions: rule.actions.map(action => {
                if (action.type === 'PERCENTAGE_DISCOUNT') {
                  const currentPercent = Number(action.params.discountPercent) || 0;
                  return {
                    ...action,
                    params: { ...action.params, discountPercent: Math.min(currentPercent + 5, 50) },
                  };
                }
                return action;
              }),
            },
            createdAt: Date.now(),
            isRead: false,
            isApproved: false,
          });
        }

        // Rule applied very few times → decrease discount or change timing
        if (rule.totalAppliedCount < 5 && rule.createdAt < Date.now() - 7 * 86400000) {
          newSuggestions.push({
            id: generateId('sug'),
            ruleId: rule.id,
            type: 'CHANGE_TIMING',
            title: 'تعديل توقيت القاعدة',
            description: `القاعدة "${rule.name}" نادراً ما يتم تطبيقها (${rule.totalAppliedCount} مرة فقط في أسبوع). قد يكون التوقيت غير مناسب. ننصح بتعديل ساعات أو أيام التفعيل.`,
            confidence: 0.7,
            impact: 'NEUTRAL',
            suggestedChanges: {
              conditions: rule.conditions,
            },
            createdAt: Date.now(),
            isRead: false,
            isApproved: false,
          });
        }

        // Very high revenue impact (too much discount) → decrease discount
        if (rule.totalRevenueImpact < -10000 && rule.totalAppliedCount > 20) {
          newSuggestions.push({
            id: generateId('sug'),
            ruleId: rule.id,
            type: 'DECREASE_DISCOUNT',
            title: 'تقليل نسبة الخصم',
            description: `القاعدة "${rule.name}" تسبب خسارة إيرادات كبيرة (${Math.abs(rule.totalRevenueImpact).toFixed(2)} جنيه). ننصح بتقليل الخصم للحفاظ على الربحية.`,
            confidence: 0.8,
            impact: 'POSITIVE',
            suggestedChanges: {
              actions: rule.actions.map(action => {
                if (action.type === 'PERCENTAGE_DISCOUNT') {
                  const currentPercent = Number(action.params.discountPercent) || 0;
                  return {
                    ...action,
                    params: { ...action.params, discountPercent: Math.max(currentPercent - 3, 5) },
                  };
                }
                return action;
              }),
            },
            createdAt: Date.now(),
            isRead: false,
            isApproved: false,
          });
        }

        // Zero applications in a long time → deactivate
        if (rule.totalAppliedCount === 0 && rule.createdAt < Date.now() - 14 * 86400000) {
          newSuggestions.push({
            id: generateId('sug'),
            ruleId: rule.id,
            type: 'DEACTIVATE_RULE',
            title: 'تعطيل القاعدة',
            description: `القاعدة "${rule.name}" لم يتم تطبيقها أبداً منذ إنشائها. ننصح بتعطيلها لتبسيط النظام.`,
            confidence: 0.9,
            impact: 'NEUTRAL',
            suggestedChanges: {
              isActive: false,
            },
            createdAt: Date.now(),
            isRead: false,
            isApproved: false,
          });
        }
      }

      // Add suggestions to the list (don't duplicate)
      for (const suggestion of newSuggestions) {
        const exists = this.suggestions.some(
          s => s.ruleId === suggestion.ruleId && s.type === suggestion.type && !s.isApproved && !s.isRead
        );
        if (!exists) {
          this.suggestions.push(suggestion);
        }
      }

      this.saveSuggestionsToStorage();
      return newSuggestions;
    } catch (error) {
      console.error('خطأ في تحليل أداء القواعد:', error);
      return [];
    }
  }

  getSuggestions(): PricingSuggestion[] {
    return [...this.suggestions];
  }

  approveSuggestion(suggestionId: string): void {
    try {
      const suggestion = this.suggestions.find(s => s.id === suggestionId);
      if (!suggestion) return;

      suggestion.isApproved = true;
      suggestion.isRead = true;

      // Apply the suggested changes to the rule (but NEVER auto-apply - only if explicitly approved)
      if (suggestion.suggestedChanges) {
        const rule = this.rules.find(r => r.id === suggestion.ruleId);
        if (rule) {
          Object.assign(rule, suggestion.suggestedChanges, { updatedAt: Date.now() });
          this.saveRulesToStorage();
        }
      }

      this.saveSuggestionsToStorage();
    } catch (error) {
      console.error('خطأ في الموافقة على الاقتراح:', error);
      throw error;
    }
  }

  rejectSuggestion(suggestionId: string): void {
    try {
      const suggestion = this.suggestions.find(s => s.id === suggestionId);
      if (!suggestion) return;

      suggestion.isRead = true;
      // Remove from suggestions
      this.suggestions = this.suggestions.filter(s => s.id !== suggestionId);
      this.saveSuggestionsToStorage();
    } catch (error) {
      console.error('خطأ في رفض الاقتراح:', error);
      throw error;
    }
  }

  // ===========================================================================
  // Audit
  // ===========================================================================

  getAuditLog(): PricingAuditEntry[] {
    return [...this.auditLog];
  }

  // ===========================================================================
  // Private: Condition Evaluation
  // ===========================================================================

  private evaluateConditions(
    conditions: PricingCondition[],
    context: PriceCalculationContext & { currentTime: number; basePrice: number }
  ): boolean {
    try {
      // All conditions must be met (AND logic)
      return conditions.every(condition => this.evaluateSingleCondition(condition, context));
    } catch (error) {
      console.error('خطأ في تقييم الشروط:', error);
      return false;
    }
  }

  private evaluateSingleCondition(
    condition: PricingCondition,
    context: PriceCalculationContext & { currentTime: number; basePrice: number }
  ): boolean {
    try {
      const now = new Date(context.currentTime);
      const { params } = condition;

      switch (condition.type as PricingConditionType) {
        case 'TIME_OF_DAY': {
          const hoursStart = Number(params.hoursStart) ?? 0;
          const hoursEnd = Number(params.hoursEnd) ?? 23;
          const currentHour = now.getHours();
          return currentHour >= hoursStart && currentHour < hoursEnd;
        }

        case 'DAY_OF_WEEK': {
          const days = params.days;
          if (Array.isArray(days)) {
            const currentDay = now.getDay(); // 0=Sunday, 6=Saturday
            return days.some(d => Number(d) === currentDay);
          }
          return false;
        }

        case 'LOW_STOCK': {
          if (context.currentStock === undefined) return false;
          const thresholdPercent = Number(params.thresholdPercent) ?? 20;
          // Assume we need a maxStock to compare; if not available, use threshold as absolute
          const thresholdAbsolute = Number(params.thresholdAbsolute);
          if (thresholdAbsolute) {
            return context.currentStock <= thresholdAbsolute;
          }
          // Default: stock below thresholdPercent (we need maxStock context)
          // Simplified: if currentStock < thresholdPercent, treat thresholdPercent as absolute count
          return context.currentStock <= thresholdPercent;
        }

        case 'EXPIRY_APPROACHING': {
          if (context.expiryDate === undefined) return false;
          const daysBeforeExpiry = Number(params.daysBeforeExpiry) ?? 7;
          const msPerDay = 86400000;
          const daysUntilExpiry = (context.expiryDate - context.currentTime) / msPerDay;
          return daysUntilExpiry > 0 && daysUntilExpiry <= daysBeforeExpiry;
        }

        case 'SEASONAL_PERIOD': {
          const startMonth = Number(params.startMonth);
          const startDay = Number(params.startDay);
          const endMonth = Number(params.endMonth);
          const endDay = Number(params.endDay);
          if (!startMonth || !endMonth) return false;
          const currentMonth = now.getMonth() + 1; // 1-12
          const currentDay = now.getDate();

          if (startMonth <= endMonth) {
            // Same year period (e.g., March 1 - April 30)
            if (currentMonth < startMonth || currentMonth > endMonth) return false;
            if (currentMonth === startMonth && currentDay < startDay) return false;
            if (currentMonth === endMonth && currentDay > endDay) return false;
            return true;
          } else {
            // Cross-year period (e.g., December 15 - January 15)
            if (currentMonth > endMonth && currentMonth < startMonth) return false;
            if (currentMonth === startMonth && currentDay < startDay) return false;
            if (currentMonth === endMonth && currentDay > endDay) return false;
            return true;
          }
        }

        case 'CUSTOMER_SEGMENT': {
          if (!context.customerSegment) return false;
          const segment = String(params.segment);
          return context.customerSegment === segment;
        }

        case 'QUANTITY_PURCHASED': {
          const minQuantity = Number(params.minQuantity) ?? 1;
          return context.quantity >= minQuantity;
        }

        case 'COMBINATION_DEAL': {
          if (!context.orderItems || context.orderItems.length === 0) return false;
          const requiredProductId = String(params.requiredProductId);
          if (!requiredProductId) return false;
          const requiredItem = context.orderItems.find(item => item.productId === requiredProductId);
          const requiredQty = Number(params.requiredQuantity) ?? 1;
          return requiredItem !== undefined && requiredItem.quantity >= requiredQty;
        }

        default:
          return false;
      }
    } catch (error) {
      console.error('خطأ في تقييم الشرط:', error);
      return false;
    }
  }

  // ===========================================================================
  // Private: Action Application
  // ===========================================================================

  private applyActions(
    actions: PricingAction[],
    currentPrice: number,
    context: PriceCalculationContext & { currentTime: number; basePrice: number }
  ): { newPrice: number; discountAmount: number } {
    try {
      let newPrice = currentPrice;
      let totalDiscount = 0;

      for (const action of actions) {
        const result = this.applySingleAction(action, newPrice, context);
        const discount = newPrice - result;
        totalDiscount += discount;
        newPrice = result;
      }

      return {
        newPrice: Math.round(newPrice * 100) / 100,
        discountAmount: Math.round(totalDiscount * 100) / 100,
      };
    } catch (error) {
      console.error('خطأ في تطبيق الإجراءات:', error);
      return { newPrice: currentPrice, discountAmount: 0 };
    }
  }

  private applySingleAction(
    action: PricingAction,
    currentPrice: number,
    _context: PriceCalculationContext & { currentTime: number; basePrice: number }
  ): number {
    try {
      const { params } = action;

      switch (action.type) {
        case 'PERCENTAGE_DISCOUNT': {
          const discountPercent = Number(params.discountPercent) ?? 0;
          const discountAmount = currentPrice * (discountPercent / 100);
          return currentPrice - discountAmount;
        }

        case 'FIXED_PRICE': {
          const fixedPrice = Number(params.fixedPrice) ?? currentPrice;
          return fixedPrice;
        }

        case 'GRADUAL_DISCOUNT': {
          const initialDiscountPercent = Number(params.initialDiscountPercent) ?? 5;
          const incrementPercent = Number(params.incrementPercent) ?? 5;
          const incrementIntervalDays = Number(params.incrementIntervalDays) ?? 2;

          // Calculate based on expiry date if available
          if (_context.expiryDate) {
            const msPerDay = 86400000;
            const daysUntilExpiry = (_context.expiryDate - _context.currentTime) / msPerDay;
            const intervalsElapsed = Math.max(0, Math.floor((30 - daysUntilExpiry) / incrementIntervalDays));
            const totalDiscountPercent = initialDiscountPercent + (intervalsElapsed * incrementPercent);
            const discountAmount = currentPrice * (totalDiscountPercent / 100);
            return currentPrice - discountAmount;
          }

          // Fallback: just apply initial discount
          const discountAmount = currentPrice * (initialDiscountPercent / 100);
          return currentPrice - discountAmount;
        }

        case 'BUY_X_GET_Y': {
          const discountPercent = Number(params.discountPercent) ?? 100;
          const getQuantity = Number(params.getQuantity) ?? 1;
          // For per-unit pricing, this would need the quantity context
          // Simplified: apply the discount percent * getQuantity relative to unit price
          const discountPerFreeItem = currentPrice * (discountPercent / 100);
          return currentPrice - (discountPerFreeItem * getQuantity);
        }

        case 'LOYALTY_POINTS_BONUS': {
          // No price change - loyalty points are tracked separately
          return currentPrice;
        }

        default:
          return currentPrice;
      }
    } catch (error) {
      console.error('خطأ في تطبيق الإجراء:', error);
      return currentPrice;
    }
  }

  // ===========================================================================
  // Private: Rule Matching
  // ===========================================================================

  private ruleAppliesToProduct(rule: PricingRule, productId: string): boolean {
    // Empty productIds means applies to all
    if (rule.productIds.length === 0 && rule.categoryIds.length === 0) return true;
    if (rule.productIds.includes(productId)) return true;
    // Category matching would require looking up the product's category
    // For now, we only check productId and treat categoryIds as supplementary
    return false;
  }

  // ===========================================================================
  // Private: Reason Text Builder (Arabic)
  // ===========================================================================

  private buildReasonText(rule: PricingRule, discountAmount: number, hitMinimum: boolean): string {
    try {
      const discountStr = discountAmount.toFixed(2);
      if (hitMinimum) {
        return `تم تطبيق القاعدة "${rule.name}" بخصم ${discountStr} جنيه (تم تعديل السعر للحد الأدنى المسموح)`;
      }
      return `تم تطبيق القاعدة "${rule.name}" بخصم ${discountStr} جنيه`;
    } catch {
      return `تم تطبيق قاعدة تسعير`;
    }
  }

  // ===========================================================================
  // Private: Daily Discount Tracking
  // ===========================================================================

  private getDailyDiscount(date: string, ruleId: string): DailyDiscountRecord {
    const existing = this.dailyDiscounts.find(d => d.date === date && d.ruleId === ruleId);
    if (existing) return existing;
    return { date, ruleId, totalDiscount: 0, usageCount: 0 };
  }

  private recordDiscount(date: string, ruleId: string, discount: number): void {
    const index = this.dailyDiscounts.findIndex(d => d.date === date && d.ruleId === ruleId);
    if (index >= 0) {
      this.dailyDiscounts[index].totalDiscount += discount;
      this.dailyDiscounts[index].usageCount += 1;
    } else {
      this.dailyDiscounts.push({ date, ruleId, totalDiscount: discount, usageCount: 1 });
    }
    this.saveDailyDiscountsToStorage();
  }

  private resetDailyDiscountsIfNeeded(): void {
    const today = getTodayString();
    this.dailyDiscounts = this.dailyDiscounts.filter(d => d.date === today);
    this.saveDailyDiscountsToStorage();
  }

  // ===========================================================================
  // Private: Customer Usage Tracking
  // ===========================================================================

  private getCustomerUsage(customerId: string | undefined, ruleId: string): number {
    if (!customerId) return 0;
    const record = this.customerUsage.find(c => c.customerId === customerId && c.ruleId === ruleId);
    return record?.usageCount ?? 0;
  }

  private incrementCustomerUsage(customerId: string | undefined, ruleId: string): void {
    if (!customerId) return;
    const index = this.customerUsage.findIndex(c => c.customerId === customerId && c.ruleId === ruleId);
    if (index >= 0) {
      this.customerUsage[index].usageCount += 1;
    } else {
      this.customerUsage.push({ customerId, ruleId, usageCount: 1 });
    }
    this.saveCustomerUsageToStorage();
  }

  // ===========================================================================
  // Private: Rule Stats Update
  // ===========================================================================

  private updateRuleStats(ruleId: string, discountAmount: number): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.totalAppliedCount += 1;
      rule.totalRevenueImpact -= discountAmount;
      this.saveRulesToStorage();
    }
  }

  // ===========================================================================
  // Private: Audit Logging
  // ===========================================================================

  private logAudit(params: {
    productId: string;
    productName: string;
    originalPrice: number;
    newPrice: number;
    cashierId: string;
    orderId: string;
    appliedRules: PricingResultAppliedRule[];
  }): void {
    try {
      for (const appliedRule of params.appliedRules) {
        const entry: PricingAuditEntry = {
          id: generateId('audit'),
          timestamp: Date.now(),
          ruleId: appliedRule.ruleId,
          ruleName: appliedRule.ruleName,
          productId: params.productId,
          productName: params.productName,
          originalPrice: params.originalPrice,
          newPrice: params.newPrice,
          cashierId: params.cashierId,
          orderId: params.orderId,
        };
        this.auditLog.push(entry);
      }

      // Keep audit log manageable (max 10000 entries)
      if (this.auditLog.length > 10000) {
        this.auditLog = this.auditLog.slice(-5000);
      }

      this.saveAuditToStorage();
    } catch (error) {
      console.error('خطأ في تسجيل المراجعة:', error);
    }
  }

  // ===========================================================================
  // Private: Persistence (localStorage)
  // ===========================================================================

  private loadFromStorage(): void {
    try {
      // Load rules
      const rulesJson = safeLocalStorageGet(PricingEngine.RULES_KEY);
      if (rulesJson) {
        this.rules = JSON.parse(rulesJson) as PricingRule[];
      }

      // Load suggestions
      const suggestionsJson = safeLocalStorageGet(PricingEngine.SUGGESTIONS_KEY);
      if (suggestionsJson) {
        this.suggestions = JSON.parse(suggestionsJson) as PricingSuggestion[];
      }

      // Load audit log
      const auditJson = safeLocalStorageGet(PricingEngine.AUDIT_KEY);
      if (auditJson) {
        this.auditLog = JSON.parse(auditJson) as PricingAuditEntry[];
      }

      // Load daily discounts
      const dailyDiscountsJson = safeLocalStorageGet(PricingEngine.DAILY_DISCOUNTS_KEY);
      if (dailyDiscountsJson) {
        this.dailyDiscounts = JSON.parse(dailyDiscountsJson) as DailyDiscountRecord[];
      }

      // Load customer usage
      const customerUsageJson = safeLocalStorageGet(PricingEngine.CUSTOMER_USAGE_KEY);
      if (customerUsageJson) {
        this.customerUsage = JSON.parse(customerUsageJson) as CustomerUsageRecord[];
      }
    } catch (error) {
      console.error('خطأ في تحميل بيانات التسعير:', error);
      this.rules = [];
      this.suggestions = [];
      this.auditLog = [];
      this.dailyDiscounts = [];
      this.customerUsage = [];
    }
  }

  private saveRulesToStorage(): void {
    safeLocalStorageSet(PricingEngine.RULES_KEY, JSON.stringify(this.rules));
  }

  private saveSuggestionsToStorage(): void {
    safeLocalStorageSet(PricingEngine.SUGGESTIONS_KEY, JSON.stringify(this.suggestions));
  }

  private saveAuditToStorage(): void {
    safeLocalStorageSet(PricingEngine.AUDIT_KEY, JSON.stringify(this.auditLog));
  }

  private saveDailyDiscountsToStorage(): void {
    safeLocalStorageSet(PricingEngine.DAILY_DISCOUNTS_KEY, JSON.stringify(this.dailyDiscounts));
  }

  private saveCustomerUsageToStorage(): void {
    safeLocalStorageSet(PricingEngine.CUSTOMER_USAGE_KEY, JSON.stringify(this.customerUsage));
  }

  // ===========================================================================
  // Public: Seed Default Rules (for demo/testing)
  // ===========================================================================

  seedDefaultRules(): void {
    if (this.rules.length > 0) return; // Don't overwrite existing rules

    try {
      const now = Date.now();

      // Rule 1: ساعات الذروة - خصم وقت الظهيرة
      this.addRule({
        name: 'عرض وقت الغداء',
        description: 'خصم 10% على جميع المنتجات من الساعة 1 ظهراً حتى 4 عصراً',
        productIds: [],
        categoryIds: [],
        conditions: [
          {
            type: 'TIME_OF_DAY',
            params: { hoursStart: 13, hoursEnd: 16 },
          },
        ],
        actions: [
          {
            type: 'PERCENTAGE_DISCOUNT',
            params: { discountPercent: 10 },
          },
        ],
        safetyLimits: {
          minPrice: 5,
          maxPrice: 10000,
          maxDailyDiscount: 500,
          maxUsesPerCustomer: -1,
          validFrom: now,
          validUntil: now + 90 * 86400000, // 90 days
        },
        priority: 5,
        canCombineWithOthers: false,
        isActive: true,
      });

      // Rule 2: خصم المنتجات القريبة من انتهاء الصلاحية
      this.addRule({
        name: 'خصم الصلاحية القريبة',
        description: 'خصم تدريجي للمنتجات التي تقترب من انتهاء الصلاحية',
        productIds: [],
        categoryIds: [],
        conditions: [
          {
            type: 'EXPIRY_APPROACHING',
            params: { daysBeforeExpiry: 7 },
          },
        ],
        actions: [
          {
            type: 'GRADUAL_DISCOUNT',
            params: {
              initialDiscountPercent: 10,
              incrementPercent: 5,
              incrementIntervalDays: 2,
            },
          },
        ],
        safetyLimits: {
          minPrice: 1,
          maxPrice: 10000,
          maxDailyDiscount: 1000,
          maxUsesPerCustomer: -1,
          validFrom: now,
          validUntil: now + 180 * 86400000,
        },
        priority: 8,
        canCombineWithOthers: false,
        isActive: true,
      });

      // Rule 3: خصم العملاء VIP
      this.addRule({
        name: 'خصم العملاء المميزين',
        description: 'خصم 15% لعملاء VIP',
        productIds: [],
        categoryIds: [],
        conditions: [
          {
            type: 'CUSTOMER_SEGMENT',
            params: { segment: 'VIP' },
          },
        ],
        actions: [
          {
            type: 'PERCENTAGE_DISCOUNT',
            params: { discountPercent: 15 },
          },
        ],
        safetyLimits: {
          minPrice: 5,
          maxPrice: 10000,
          maxDailyDiscount: 2000,
          maxUsesPerCustomer: -1,
          validFrom: now,
          validUntil: now + 365 * 86400000,
        },
        priority: 10,
        canCombineWithOthers: true,
        isActive: true,
      });

      // Rule 4: خصم الكمية
      this.addRule({
        name: 'خصم الشراء بالجملة',
        description: 'خصم 12% عند شراء 5 قطع أو أكثر من نفس المنتج',
        productIds: [],
        categoryIds: [],
        conditions: [
          {
            type: 'QUANTITY_PURCHASED',
            params: { minQuantity: 5 },
          },
        ],
        actions: [
          {
            type: 'PERCENTAGE_DISCOUNT',
            params: { discountPercent: 12 },
          },
        ],
        safetyLimits: {
          minPrice: 3,
          maxPrice: 10000,
          maxDailyDiscount: 1500,
          maxUsesPerCustomer: 3,
          validFrom: now,
          validUntil: now + 90 * 86400000,
        },
        priority: 7,
        canCombineWithOthers: false,
        isActive: true,
      });

      // Rule 5: عرض رمضان
      this.addRule({
        name: 'عرض رمضان الكريم',
        description: 'خصم 20% على جميع المنتجات خلال شهر رمضان المبارك',
        productIds: [],
        categoryIds: [],
        conditions: [
          {
            type: 'SEASONAL_PERIOD',
            params: { startMonth: 3, startDay: 1, endMonth: 4, endDay: 1 },
          },
        ],
        actions: [
          {
            type: 'PERCENTAGE_DISCOUNT',
            params: { discountPercent: 20 },
          },
        ],
        safetyLimits: {
          minPrice: 5,
          maxPrice: 10000,
          maxDailyDiscount: 5000,
          maxUsesPerCustomer: -1,
          validFrom: now,
          validUntil: now + 365 * 86400000,
        },
        priority: 15,
        canCombineWithOthers: false,
        isActive: true,
      });
    } catch (error) {
      console.error('خطأ في إنشاء القواعد الافتراضية:', error);
    }
  }

  // ===========================================================================
  // Public: Get daily discounts (for reporting)
  // ===========================================================================

  getDailyDiscounts(): DailyDiscountRecord[] {
    return [...this.dailyDiscounts];
  }

  getCustomerUsageRecords(): CustomerUsageRecord[] {
    return [...this.customerUsage];
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const pricingEngine = new PricingEngine();
