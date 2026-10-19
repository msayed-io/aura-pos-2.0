// =============================================================================
// Aura POS 2.0 - Pricing Reporting Service
// خدمة تقارير التسعير والتحليلات
// =============================================================================

import type {
  PricingReport,
  PricingRulePerformanceOverTime,
  PricingComparisonResult,
  PricingAuditEntry,
} from '../types/pricingTypes';
import { pricingEngine } from './pricingEngine';

// =============================================================================
// PricingReportingService Singleton Class
// =============================================================================

class PricingReportingService {
  /**
   * Generate a pricing report for a given time period
   * إنشاء تقرير تسعير لفترة زمنية محددة
   */
  generateReport(startDate: number, endDate: number): PricingReport {
    try {
      const rules = pricingEngine.getRules();
      const activeRules = pricingEngine.getActiveRules();
      const auditLog = pricingEngine.getAuditLog();
      const suggestions = pricingEngine.getSuggestions();

      // Filter audit entries within the period
      const periodEntries = auditLog.filter(
        entry => entry.timestamp >= startDate && entry.timestamp <= endDate
      );

      // Calculate totals
      let totalDiscountsGiven = 0;
      let totalRevenueImpact = 0;
      let wastePrevented = 0;

      for (const entry of periodEntries) {
        const discount = entry.originalPrice - entry.newPrice;
        totalDiscountsGiven += discount;
        totalRevenueImpact -= discount; // Revenue impact is negative when discounts are given
      }

      // Calculate waste prevented from expiry-related discounts
      const expiryRelatedRules = rules.filter(rule =>
        rule.conditions.some(c => c.type === 'EXPIRY_APPROACHING')
      );
      const expiryRuleIds = new Set(expiryRelatedRules.map(r => r.id));

      for (const entry of periodEntries) {
        if (expiryRuleIds.has(entry.ruleId)) {
          const discount = entry.originalPrice - entry.newPrice;
          // Waste prevented is the original price (we sold it at a discount instead of losing it all)
          wastePrevented += entry.newPrice;
        }
      }

      // Find most and least effective rules
      const ruleEffectiveness = new Map<string, { name: string; appliedCount: number; revenueImpact: number }>();

      for (const rule of rules) {
        const ruleEntries = periodEntries.filter(e => e.ruleId === rule.id);
        ruleEffectiveness.set(rule.id, {
          name: rule.name,
          appliedCount: ruleEntries.length,
          revenueImpact: ruleEntries.reduce((sum, e) => sum - (e.originalPrice - e.newPrice), 0),
        });
      }

      let mostEffectiveRule: { id: string; name: string; appliedCount: number } | null = null;
      let leastEffectiveRule: { id: string; name: string; appliedCount: number } | null = null;

      let maxApplied = -1;
      let minApplied = Infinity;

      for (const [id, data] of ruleEffectiveness) {
        if (data.appliedCount > maxApplied) {
          maxApplied = data.appliedCount;
          mostEffectiveRule = { id, name: data.name, appliedCount: data.appliedCount };
        }
        if (data.appliedCount < minApplied && data.appliedCount > 0) {
          minApplied = data.appliedCount;
          leastEffectiveRule = { id, name: data.name, appliedCount: data.appliedCount };
        }
      }

      // If all rules have 0 applications, set least effective to null
      if (minApplied === Infinity) {
        leastEffectiveRule = null;
      }

      // Count unread suggestions
      const activeSuggestions = suggestions.filter(s => !s.isApproved && !s.isRead);

      const report: PricingReport = {
        totalRulesActive: activeRules.length,
        totalDiscountsGiven: Math.round(totalDiscountsGiven * 100) / 100,
        totalRevenueImpact: Math.round(totalRevenueImpact * 100) / 100,
        mostEffectiveRule,
        leastEffectiveRule,
        wastePrevented: Math.round(wastePrevented * 100) / 100,
        suggestionsCount: activeSuggestions.length,
        periodStart: startDate,
        periodEnd: endDate,
      };

      return report;
    } catch (error) {
      console.error('خطأ في إنشاء تقرير التسعير:', error);
      return {
        totalRulesActive: 0,
        totalDiscountsGiven: 0,
        totalRevenueImpact: 0,
        mostEffectiveRule: null,
        leastEffectiveRule: null,
        wastePrevented: 0,
        suggestionsCount: 0,
        periodStart: startDate,
        periodEnd: endDate,
      };
    }
  }

  /**
   * Get rule performance over time (daily breakdown)
   * أداء القاعدة عبر الزمن (تفصيل يومي)
   */
  getRulePerformanceOverTime(ruleId: string): PricingRulePerformanceOverTime[] {
    try {
      const auditLog = pricingEngine.getAuditLog();
      const ruleEntries = auditLog.filter(entry => entry.ruleId === ruleId);

      // Group by date
      const dailyMap = new Map<string, { appliedCount: number; revenueImpact: number }>();

      for (const entry of ruleEntries) {
        const date = new Date(entry.timestamp);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        const existing = dailyMap.get(dateKey);
        if (existing) {
          existing.appliedCount += 1;
          existing.revenueImpact -= (entry.originalPrice - entry.newPrice);
        } else {
          dailyMap.set(dateKey, {
            appliedCount: 1,
            revenueImpact: -(entry.originalPrice - entry.newPrice),
          });
        }
      }

      // Convert to sorted array
      const result: PricingRulePerformanceOverTime[] = [];
      const sortedKeys = [...dailyMap.keys()].sort();

      for (const dateKey of sortedKeys) {
        const data = dailyMap.get(dateKey);
        if (data) {
          result.push({
            date: dateKey,
            appliedCount: data.appliedCount,
            revenueImpact: Math.round(data.revenueImpact * 100) / 100,
          });
        }
      }

      return result;
    } catch (error) {
      console.error('خطأ في الحصول على أداء القاعدة عبر الزمن:', error);
      return [];
    }
  }

  /**
   * Compare two time periods
   * مقارنة بين فترتين زمنيتين
   */
  comparePeriods(
    period1: { start: number; end: number },
    period2: { start: number; end: number }
  ): PricingComparisonResult {
    try {
      const report1 = this.generateReport(period1.start, period1.end);
      const report2 = this.generateReport(period2.start, period2.end);

      const formatPeriod = (start: number, end: number): string => {
        const s = new Date(start);
        const e = new Date(end);
        return `${s.toLocaleDateString('ar-EG')} - ${e.toLocaleDateString('ar-EG')}`;
      };

      // Calculate percentage changes
      const calculatePercentChange = (val1: number, val2: number): number => {
        if (val1 === 0 && val2 === 0) return 0;
        if (val1 === 0) return 100; // went from 0 to something = 100% increase
        return Math.round(((val2 - val1) / Math.abs(val1)) * 10000) / 100;
      };

      const comparison: PricingComparisonResult = {
        period1Label: formatPeriod(period1.start, period1.end),
        period2Label: formatPeriod(period2.start, period2.end),
        period1: report1,
        period2: report2,
        discountChange: calculatePercentChange(report1.totalDiscountsGiven, report2.totalDiscountsGiven),
        revenueImpactChange: calculatePercentChange(report1.totalRevenueImpact, report2.totalRevenueImpact),
        wastePreventedChange: calculatePercentChange(report1.wastePrevented, report2.wastePrevented),
      };

      return comparison;
    } catch (error) {
      console.error('خطأ في مقارنة الفترات:', error);
      const emptyReport: PricingReport = {
        totalRulesActive: 0,
        totalDiscountsGiven: 0,
        totalRevenueImpact: 0,
        mostEffectiveRule: null,
        leastEffectiveRule: null,
        wastePrevented: 0,
        suggestionsCount: 0,
        periodStart: 0,
        periodEnd: 0,
      };
      return {
        period1Label: '',
        period2Label: '',
        period1: emptyReport,
        period2: emptyReport,
        discountChange: 0,
        revenueImpactChange: 0,
        wastePreventedChange: 0,
      };
    }
  }

  /**
   * Get audit entries for a specific product
   * الحصول على سجل المراجعة لمنتج محدد
   */
  getAuditForProduct(productId: string): PricingAuditEntry[] {
    try {
      const auditLog = pricingEngine.getAuditLog();
      return auditLog.filter(entry => entry.productId === productId);
    } catch (error) {
      console.error('خطأ في الحصول على سجل المراجعة للمنتج:', error);
      return [];
    }
  }

  /**
   * Get audit entries for a specific time range
   * الحصول على سجل المراجعة لفترة زمنية محددة
   */
  getAuditForPeriod(startDate: number, endDate: number): PricingAuditEntry[] {
    try {
      const auditLog = pricingEngine.getAuditLog();
      return auditLog.filter(
        entry => entry.timestamp >= startDate && entry.timestamp <= endDate
      );
    } catch (error) {
      console.error('خطأ في الحصول على سجل المراجعة للفترة:', error);
      return [];
    }
  }

  /**
   * Get top discounted products in a period
   * الحصول على أكثر المنتجات خصماً في فترة محددة
   */
  getTopDiscountedProducts(
    startDate: number,
    endDate: number,
    limit: number = 10
  ): { productId: string; productName: string; totalDiscount: number; timesDiscounted: number }[] {
    try {
      const periodEntries = this.getAuditForPeriod(startDate, endDate);

      const productMap = new Map<string, { productName: string; totalDiscount: number; timesDiscounted: number }>();

      for (const entry of periodEntries) {
        const discount = entry.originalPrice - entry.newPrice;
        const existing = productMap.get(entry.productId);
        if (existing) {
          existing.totalDiscount += discount;
          existing.timesDiscounted += 1;
        } else {
          productMap.set(entry.productId, {
            productName: entry.productName,
            totalDiscount: discount,
            timesDiscounted: 1,
          });
        }
      }

      return [...productMap.entries()]
        .map(([productId, data]) => ({
          productId,
          ...data,
          totalDiscount: Math.round(data.totalDiscount * 100) / 100,
        }))
        .sort((a, b) => b.totalDiscount - a.totalDiscount)
        .slice(0, limit);
    } catch (error) {
      console.error('خطأ في الحصول على أكثر المنتجات خصماً:', error);
      return [];
    }
  }

  /**
   * Get summary statistics for the dashboard
   * الحصول على إحصائيات ملخصة للوحة المعلومات
   */
  getDashboardSummary(): {
    activeRulesCount: number;
    totalDiscountsToday: number;
    topDiscountProduct: string;
    pendingSuggestions: number;
  } {
    try {
      const activeRules = pricingEngine.getActiveRules();
      const suggestions = pricingEngine.getSuggestions().filter(s => !s.isApproved && !s.isRead);

      // Today's discounts
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayEntries = this.getAuditForPeriod(todayStart.getTime(), todayEnd.getTime());
      const totalDiscountsToday = todayEntries.reduce(
        (sum, entry) => sum + (entry.originalPrice - entry.newPrice),
        0
      );

      // Top discounted product today
      const topProduct = this.getTopDiscountedProducts(todayStart.getTime(), todayEnd.getTime(), 1);
      const topDiscountProduct = topProduct.length > 0 ? topProduct[0].productName : 'لا يوجد';

      return {
        activeRulesCount: activeRules.length,
        totalDiscountsToday: Math.round(totalDiscountsToday * 100) / 100,
        topDiscountProduct,
        pendingSuggestions: suggestions.length,
      };
    } catch (error) {
      console.error('خطأ في الحصول على ملخص لوحة المعلومات:', error);
      return {
        activeRulesCount: 0,
        totalDiscountsToday: 0,
        topDiscountProduct: 'لا يوجد',
        pendingSuggestions: 0,
      };
    }
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const pricingReportingService = new PricingReportingService();
