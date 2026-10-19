'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  PricingRule,
  PricingSuggestion,
  PricingAuditEntry,
  ExpiryPricingTier,
} from '../../../../types/pricingTypes';
import { pricingEngine } from '../../../../services/pricingEngine';
import { pricingReportingService } from '../../../../services/pricingReportingService';
import {
  SparklesIcon,
  Cog6ToothIcon,
  TrendingUpIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  SpinnerIcon,
  CheckCircleIcon,
  XIcon,
  ChevronDownIcon,
  ClockIcon,
  ShieldCheckIcon,
} from '../../Icons';
import { useDashboard } from '../../DashboardContext';
import PricingRuleEditModal from '../../ui/PricingRuleEditModal';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';

// ---------------------------------------------------------------------------
// Helper: condition type labels (Arabic)
// ---------------------------------------------------------------------------
const conditionTypeLabels: Record<string, string> = {
  TIME_OF_DAY: 'وقت محدد',
  DAY_OF_WEEK: 'يوم محدد',
  LOW_STOCK: 'مخزون منخفض',
  EXPIRY_APPROACHING: 'قرب انتهاء الصلاحية',
  SEASONAL_PERIOD: 'فترة موسمية',
  CUSTOMER_SEGMENT: 'شريحة العملاء',
  QUANTITY_PURCHASED: 'كمية الشراء',
  COMBINATION_DEAL: 'صفقة مجمعة',
};

const actionTypeLabels: Record<string, string> = {
  PERCENTAGE_DISCOUNT: 'خصم بنسبة',
  FIXED_PRICE: 'سعر محدد',
  GRADUAL_DISCOUNT: 'خصم تدريجي',
  BUY_X_GET_Y: 'اشترِ X واحصل على Y',
  LOYALTY_POINTS_BONUS: 'نقاط ولاء إضافية',
};

// ---------------------------------------------------------------------------
// Performance indicator
// ---------------------------------------------------------------------------
const PerformanceDot: React.FC<{ rule: PricingRule }> = ({ rule }) => {
  let color = 'bg-gray-300';
  let label = 'لا بيانات';

  if (rule.totalAppliedCount === 0) {
    color = 'bg-gray-300';
    label = 'لم يُطبَّق';
  } else if (rule.totalRevenueImpact > -100) {
    color = 'bg-green-500';
    label = 'فعّال';
  } else if (rule.totalRevenueImpact > -1000) {
    color = 'bg-yellow-400';
    label = 'متوسط';
  } else {
    color = 'bg-red-500';
    label = 'مراقبة';
  }

  return (
    <div className="flex items-center gap-1.5" title={label}>
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-xs text-neo-secondary/60">{label}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PricingPage
// ---------------------------------------------------------------------------
const PricingPage: React.FC = () => {
  const { showToast } = useDashboard();

  // Data state
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [suggestions, setSuggestions] = useState<PricingSuggestion[]>([]);
  const [auditLog, setAuditLog] = useState<PricingAuditEntry[]>([]);
  const [expiryTiers, setExpiryTiers] = useState<ExpiryPricingTier[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<PricingRule | null>(null);
  const [isAuditExpanded, setIsAuditExpanded] = useState(false);

  // Dashboard summary
  const [summary, setSummary] = useState({
    activeRulesCount: 0,
    totalDiscountsToday: 0,
    pendingSuggestions: 0,
    revenueImpact: 0,
  });

  // ---- Load data ----
  const refreshData = useCallback(() => {
    try {
      const allRules = pricingEngine.getRules();
      setRules(allRules);
      setSuggestions(pricingEngine.getSuggestions());
      setAuditLog(pricingEngine.getAuditLog());

      const dashSummary = pricingReportingService.getDashboardSummary();
      const revenueImpact = allRules.reduce((sum, r) => sum + r.totalRevenueImpact, 0);
      setSummary({
        activeRulesCount: dashSummary.activeRulesCount,
        totalDiscountsToday: dashSummary.totalDiscountsToday,
        pendingSuggestions: dashSummary.pendingSuggestions,
        revenueImpact: Math.round(revenueImpact * 100) / 100,
      });

      // Load expiry tiers from localStorage
      try {
        const stored = localStorage.getItem('aura_pricing_expiry_tiers');
        if (stored) {
          setExpiryTiers(JSON.parse(stored) as ExpiryPricingTier[]);
        }
      } catch {
        // ignore
      }
    } catch (error) {
      console.error('خطأ في تحميل بيانات التسعير:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Seed defaults on first load
    pricingEngine.seedDefaultRules();
    refreshData();
  }, [refreshData]);

  // ---- Handlers ----
  const handleToggleRule = useCallback((ruleId: string) => {
    try {
      pricingEngine.toggleRule(ruleId);
      refreshData();
      showToast({ message: 'تم تبديل حالة القاعدة', type: 'success' });
    } catch (error) {
      showToast({ message: 'فشل تبديل حالة القاعدة', type: 'error' });
    }
  }, [refreshData, showToast]);

  const handleSaveRule = useCallback((rule: PricingRule) => {
    try {
      if (editingRule) {
        pricingEngine.updateRule(rule.id, rule);
        showToast({ message: 'تم تحديث القاعدة بنجاح', type: 'success' });
      } else {
        pricingEngine.addRule({
          name: rule.name,
          description: rule.description,
          productIds: rule.productIds,
          categoryIds: rule.categoryIds,
          conditions: rule.conditions,
          actions: rule.actions,
          safetyLimits: rule.safetyLimits,
          priority: rule.priority,
          canCombineWithOthers: rule.canCombineWithOthers,
          isActive: rule.isActive,
        });
        showToast({ message: 'تم إضافة القاعدة بنجاح', type: 'success' });
      }
      setIsEditModalOpen(false);
      setEditingRule(null);
      refreshData();
    } catch (error) {
      showToast({ message: 'فشل حفظ القاعدة', type: 'error' });
    }
  }, [editingRule, refreshData, showToast]);

  const handleDeleteRule = useCallback(() => {
    if (!ruleToDelete) return;
    try {
      pricingEngine.deleteRule(ruleToDelete.id);
      showToast({ message: `تم حذف القاعدة "${ruleToDelete.name}"`, type: 'success' });
      setIsDeleteModalOpen(false);
      setRuleToDelete(null);
      refreshData();
    } catch (error) {
      showToast({ message: 'فشل حذف القاعدة', type: 'error' });
    }
  }, [ruleToDelete, refreshData, showToast]);

  const handleApproveSuggestion = useCallback((suggestionId: string) => {
    try {
      pricingEngine.approveSuggestion(suggestionId);
      refreshData();
      showToast({ message: 'تم الموافقة على الاقتراح', type: 'success' });
    } catch (error) {
      showToast({ message: 'فشل الموافقة على الاقتراح', type: 'error' });
    }
  }, [refreshData, showToast]);

  const handleRejectSuggestion = useCallback((suggestionId: string) => {
    try {
      pricingEngine.rejectSuggestion(suggestionId);
      refreshData();
      showToast({ message: 'تم رفض الاقتراح', type: 'info' });
    } catch (error) {
      showToast({ message: 'فشل رفض الاقتراح', type: 'error' });
    }
  }, [refreshData, showToast]);

  // ---- Expiry tiers ----
  const handleAddExpiryTier = useCallback(() => {
    const newTiers = [...expiryTiers, { daysBeforeExpiry: 7, discountPercent: 10 }];
    setExpiryTiers(newTiers);
    try {
      localStorage.setItem('aura_pricing_expiry_tiers', JSON.stringify(newTiers));
    } catch { /* ignore */ }
  }, [expiryTiers]);

  const handleRemoveExpiryTier = useCallback((index: number) => {
    const newTiers = expiryTiers.filter((_, i) => i !== index);
    setExpiryTiers(newTiers);
    try {
      localStorage.setItem('aura_pricing_expiry_tiers', JSON.stringify(newTiers));
    } catch { /* ignore */ }
  }, [expiryTiers]);

  const handleExpiryTierChange = useCallback((index: number, field: keyof ExpiryPricingTier, value: number) => {
    const newTiers = [...expiryTiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setExpiryTiers(newTiers);
    try {
      localStorage.setItem('aura_pricing_expiry_tiers', JSON.stringify(newTiers));
    } catch { /* ignore */ }
  }, [expiryTiers]);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" />
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black font-cairo text-neo-secondary flex items-center gap-2">
            <SparklesIcon className="w-8 h-8 text-neo-primary" />
            التسعير الذكي
          </h1>
          <p className="text-neo-secondary/60 mt-1">إدارة قواعد التسعير الديناميكي والخصومات الذكية.</p>
        </div>
        <button
          onClick={() => { setEditingRule(null); setIsEditModalOpen(true); }}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm"
        >
          <PlusIcon className="w-5 h-5" />
          <span>إضافة قاعدة جديدة</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Cog6ToothIcon className="w-6 h-6 text-neo-primary" />}
          label="قواعد نشطة"
          value={summary.activeRulesCount}
          color="neo-primary"
        />
        <StatCard
          icon={<TrendingUpIcon className="w-6 h-6 text-orange-500" />}
          label="خصم اليوم (ج.م)"
          value={summary.totalDiscountsToday}
          color="orange-500"
        />
        <StatCard
          icon={<SparklesIcon className="w-6 h-6 text-purple-500" />}
          label="اقتراحات معلقة"
          value={summary.pendingSuggestions}
          color="purple-500"
        />
        <StatCard
          icon={<ShieldCheckIcon className="w-6 h-6 text-neo-success" />}
          label="تأثير الإيرادات (ج.م)"
          value={summary.revenueImpact}
          color="neo-success"
        />
      </div>

      {/* Active Rules */}
      <section>
        <h2 className="text-xl font-bold font-cairo text-neo-secondary mb-3">القواعد النشطة</h2>
        {rules.length === 0 ? (
          <div className="bg-white rounded-xl border border-neo-soft-gray shadow-sm p-8 text-center text-neo-secondary/50">
            <Cog6ToothIcon className="w-12 h-12 mx-auto mb-3" />
            <p className="font-bold">لا توجد قواعد تسعير بعد</p>
            <p className="text-sm mt-1">اضغط &quot;إضافة قاعدة جديدة&quot; لبدء إنشاء قواعد التسعير الذكي.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-white rounded-xl border shadow-sm p-4 transition-all hover:shadow-md ${
                  rule.isActive ? 'border-neo-soft-gray' : 'border-gray-200 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Rule info */}
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-neo-secondary">{rule.name}</h3>
                      <span className="text-xs bg-neo-primary/10 text-neo-primary font-bold px-2 py-0.5 rounded-full">
                        أولوية {rule.priority}
                      </span>
                      <PerformanceDot rule={rule} />
                    </div>
                    <p className="text-sm text-neo-secondary/60 mt-1 line-clamp-1">{rule.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {rule.conditions.map((cond, i) => (
                        <span
                          key={i}
                          className="text-xs bg-gray-100 text-neo-secondary/70 px-2 py-0.5 rounded-md"
                        >
                          {conditionTypeLabels[cond.type] || cond.type}
                        </span>
                      ))}
                      <span className="text-xs text-neo-secondary/30">→</span>
                      {rule.actions.map((act, i) => (
                        <span
                          key={i}
                          className="text-xs bg-neo-primary/5 text-neo-primary/80 px-2 py-0.5 rounded-md"
                        >
                          {actionTypeLabels[act.type] || act.type}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        rule.isActive ? 'bg-neo-primary' : 'bg-gray-300'
                      }`}
                      title={rule.isActive ? 'تعطيل' : 'تفعيل'}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          rule.isActive ? 'right-0.5' : 'right-6'
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => { setEditingRule(rule); setIsEditModalOpen(true); }}
                      className="p-2 rounded-lg hover:bg-gray-100 text-neo-secondary/70"
                      title="تعديل"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setRuleToDelete(rule); setIsDeleteModalOpen(true); }}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                      title="حذف"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Suggestions */}
      <section>
        <h2 className="text-xl font-bold font-cairo text-neo-secondary mb-3 flex items-center gap-2">
          <SparklesIcon className="w-6 h-6 text-purple-500" />
          اقتراحات الذكاء الاصطناعي
        </h2>
        {suggestions.filter(s => !s.isApproved && !s.isRead).length === 0 ? (
          <div className="bg-white rounded-xl border border-neo-soft-gray shadow-sm p-6 text-center text-neo-secondary/50">
            <SparklesIcon className="w-10 h-10 mx-auto mb-2" />
            <p className="font-bold">لا توجد اقتراحات جديدة</p>
            <p className="text-sm mt-1">سيقوم النظام بتحليل أداء القواعد واقتراح تحسينات تلقائياً.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {suggestions
              .filter(s => !s.isApproved && !s.isRead)
              .map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="bg-white rounded-xl border border-purple-200 shadow-sm p-4 relative"
                >
                  {/* Unread dot */}
                  <div className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-purple-500" />

                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-neo-secondary">{suggestion.title}</h3>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            suggestion.impact === 'POSITIVE'
                              ? 'bg-green-100 text-green-700'
                              : suggestion.impact === 'NEGATIVE'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {suggestion.impact === 'POSITIVE'
                            ? 'إيجابي'
                            : suggestion.impact === 'NEGATIVE'
                            ? 'سلبي'
                            : 'محايد'}
                        </span>
                        <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                          {Math.round(suggestion.confidence * 100)}% ثقة
                        </span>
                      </div>
                      <p className="text-sm text-neo-secondary/60 mt-1">{suggestion.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApproveSuggestion(suggestion.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600 transition"
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                        قبول
                      </button>
                      <button
                        onClick={() => handleRejectSuggestion(suggestion.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-neo-secondary text-sm font-bold rounded-lg hover:bg-gray-300 transition"
                      >
                        <XIcon className="w-4 h-4" />
                        رفض
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Expiry Pricing Tiers */}
      <section>
        <h2 className="text-xl font-bold font-cairo text-neo-secondary mb-3">مستويات تسعير الصلاحية</h2>
        <div className="bg-white rounded-xl border border-neo-soft-gray shadow-sm p-4">
          {expiryTiers.length === 0 ? (
            <p className="text-sm text-neo-secondary/50 text-center py-4">
              لا توجد مستويات لتسعير الصلاحية. أضف مستوى لبدء تطبيق خصومات الصلاحية تلقائياً.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-bold text-neo-secondary/60 px-1">
                <span>أقل من X يوم للصلاحية</span>
                <span>نسبة الخصم %</span>
                <span></span>
              </div>
              {expiryTiers.map((tier, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    value={tier.daysBeforeExpiry}
                    onChange={(e) => handleExpiryTierChange(idx, 'daysBeforeExpiry', Number(e.target.value))}
                    className="p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={tier.discountPercent}
                    onChange={(e) => handleExpiryTierChange(idx, 'discountPercent', Number(e.target.value))}
                    className="p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
                  />
                  <button
                    onClick={() => handleRemoveExpiryTier(idx)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                    title="حذف المستوى"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Visual preview */}
              {expiryTiers.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs font-bold text-neo-secondary/60 mb-2">معاينة المستويات:</p>
                  <div className="flex gap-1 items-end h-20">
                    {[...expiryTiers]
                      .sort((a, b) => a.daysBeforeExpiry - b.daysBeforeExpiry)
                      .map((tier, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1 flex-1">
                          <span className="text-xs font-bold text-neo-primary">{tier.discountPercent}%</span>
                          <div
                            className="w-full bg-neo-primary/80 rounded-t"
                            style={{ height: `${Math.max(tier.discountPercent, 8)}%` }}
                          />
                          <span className="text-[10px] text-neo-secondary/50 text-center">{tier.daysBeforeExpiry}ي</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleAddExpiryTier}
            className="mt-3 flex items-center gap-1 text-sm text-neo-primary font-bold hover:underline"
          >
            <PlusIcon className="w-4 h-4" />
            إضافة مستوى
          </button>
        </div>
      </section>

      {/* Audit Log */}
      <section>
        <button
          onClick={() => setIsAuditExpanded(!isAuditExpanded)}
          className="flex items-center gap-2 text-xl font-bold font-cairo text-neo-secondary mb-3 w-full"
        >
          <ClockIcon className="w-6 h-6 text-neo-secondary/60" />
          سجل قرارات التسعير
          <ChevronDownIcon
            className={`w-5 h-5 text-neo-secondary/60 transition-transform ${isAuditExpanded ? 'rotate-180' : ''}`}
          />
        </button>
        {isAuditExpanded && (
          <div className="bg-white rounded-xl border border-neo-soft-gray shadow-sm overflow-hidden">
            {auditLog.length === 0 ? (
              <p className="text-sm text-neo-secondary/50 text-center py-6">
                لا توجد قرارات تسعير مسجلة بعد.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-neo-secondary/60 text-xs">
                      <th className="text-right p-3 font-bold">المنتج</th>
                      <th className="text-right p-3 font-bold">السعر</th>
                      <th className="text-right p-3 font-bold">القاعدة</th>
                      <th className="text-right p-3 font-bold">الوقت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.slice(-50).reverse().map((entry) => (
                      <tr key={entry.id} className="border-t border-gray-100">
                        <td className="p-3 text-neo-secondary">{entry.productName || entry.productId}</td>
                        <td className="p-3">
                          <span className="text-neo-secondary/40 line-through">{entry.originalPrice}</span>
                          {' → '}
                          <span className="text-neo-primary font-bold">{entry.newPrice}</span>
                        </td>
                        <td className="p-3 text-neo-secondary/70">{entry.ruleName}</td>
                        <td className="p-3 text-neo-secondary/50 text-xs">
                          {new Date(entry.timestamp).toLocaleString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* PricingRuleEditModal */}
      <PricingRuleEditModal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setEditingRule(null); }}
        onSave={handleSaveRule}
        editingRule={editingRule}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setRuleToDelete(null); }}
        onConfirm={handleDeleteRule}
        title={`حذف القاعدة "${ruleToDelete?.name}"`}
        message="هل أنت متأكد من حذف هذه القاعدة نهائياً؟ لا يمكن التراجع عن هذا الإجراء."
        isDeleting={false}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// StatCard sub-component
// ---------------------------------------------------------------------------
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-xl border border-neo-soft-gray shadow-sm p-4 flex items-center gap-3">
    <div className={`w-11 h-11 rounded-lg flex items-center justify-center bg-${color}/10`}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-bold text-neo-secondary/60">{label}</p>
      <p className={`text-xl font-black font-montserrat text-${color}`}>
        {typeof value === 'number' ? value.toLocaleString('ar-EG') : value}
      </p>
    </div>
  </div>
);

export default PricingPage;
