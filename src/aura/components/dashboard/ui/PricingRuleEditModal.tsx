'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  PricingRule,
  PricingCondition,
  PricingAction,
  PricingSafetyLimits,
  PricingConditionType,
  PricingActionType,
} from '../../../types/pricingTypes';
import {
  XIcon,
  SpinnerIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from '../Icons';
import { useDashboard } from '../DashboardContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CONDITION_OPTIONS: { value: PricingConditionType; label: string }[] = [
  { value: 'TIME_OF_DAY', label: 'وقت محدد من اليوم' },
  { value: 'DAY_OF_WEEK', label: 'يوم محدد من الأسبوع' },
  { value: 'LOW_STOCK', label: 'مخزون منخفض' },
  { value: 'EXPIRY_APPROACHING', label: 'قرب انتهاء الصلاحية' },
  { value: 'SEASONAL_PERIOD', label: 'فترة موسمية' },
  { value: 'CUSTOMER_SEGMENT', label: 'شريحة العملاء' },
  { value: 'QUANTITY_PURCHASED', label: 'كمية الشراء' },
  { value: 'COMBINATION_DEAL', label: 'صفقة مجمعة' },
];

const ACTION_OPTIONS: { value: PricingActionType; label: string }[] = [
  { value: 'PERCENTAGE_DISCOUNT', label: 'خصم بنسبة مئوية' },
  { value: 'FIXED_PRICE', label: 'سعر محدد' },
  { value: 'GRADUAL_DISCOUNT', label: 'خصم تدريجي' },
  { value: 'BUY_X_GET_Y', label: 'اشترِ X واحصل على Y' },
  { value: 'LOYALTY_POINTS_BONUS', label: 'نقاط ولاء إضافية' },
];

const DAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PricingRuleEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: PricingRule) => void;
  editingRule?: PricingRule | null;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------
function makeDefaultRule(): PricingRule {
  const now = Date.now();
  return {
    id: '',
    name: '',
    description: '',
    productIds: [],
    categoryIds: [],
    conditions: [],
    actions: [{ type: 'PERCENTAGE_DISCOUNT', params: { discountPercent: 10 } }],
    safetyLimits: {
      minPrice: 1,
      maxPrice: 10000,
      maxDailyDiscount: 1000,
      maxUsesPerCustomer: -1,
      validFrom: now,
      validUntil: now + 90 * 86400000,
    },
    priority: 5,
    canCombineWithOthers: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    totalAppliedCount: 0,
    totalRevenueImpact: 0,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const PricingRuleEditModal: React.FC<PricingRuleEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingRule,
}) => {
  const { showToast } = useDashboard();
  const isNew = !editingRule;

  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<PricingRule>(makeDefaultRule());

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setForm(editingRule ? { ...editingRule } : makeDefaultRule());
    }
  }, [isOpen, editingRule]);

  // ---- Form updaters ----
  const updateForm = useCallback((updates: Partial<PricingRule>) => {
    setForm(prev => ({ ...prev, ...updates }));
  }, []);

  const updateSafety = useCallback((updates: Partial<PricingSafetyLimits>) => {
    setForm(prev => ({
      ...prev,
      safetyLimits: { ...prev.safetyLimits, ...updates },
    }));
  }, []);

  // Conditions management
  const addCondition = useCallback(() => {
    setForm(prev => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { type: 'TIME_OF_DAY', params: { hoursStart: 9, hoursEnd: 17 } },
      ],
    }));
  }, []);

  const removeCondition = useCallback((index: number) => {
    setForm(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  }, []);

  const updateCondition = useCallback((index: number, updates: Partial<PricingCondition>) => {
    setForm(prev => {
      const conditions = [...prev.conditions];
      conditions[index] = { ...conditions[index], ...updates };
      return { ...prev, conditions };
    });
  }, []);

  const updateConditionParam = useCallback((index: number, key: string, value: string | number | boolean | number[]) => {
    setForm(prev => {
      const conditions = [...prev.conditions];
      conditions[index] = {
        ...conditions[index],
        params: { ...conditions[index].params, [key]: value } as PricingCondition['params'],
      };
      return { ...prev, conditions };
    });
  }, []);

  // Actions management
  const updateAction = useCallback((updates: Partial<PricingAction>) => {
    setForm(prev => ({
      ...prev,
      actions: [{ ...prev.actions[0], ...updates }],
    }));
  }, []);

  const updateActionParam = useCallback((key: string, value: string | number | boolean) => {
    setForm(prev => ({
      ...prev,
      actions: [{
        ...prev.actions[0],
        params: { ...prev.actions[0].params, [key]: value },
      }],
    }));
  }, []);

  // ---- Save handler ----
  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      showToast({ message: 'يرجى إدخال اسم القاعدة', type: 'error' });
      return;
    }
    if (form.conditions.length === 0) {
      showToast({ message: 'يرجى إضافة شرط واحد على الأقل', type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      const ruleToSave: PricingRule = {
        ...form,
        id: form.id || `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        updatedAt: Date.now(),
        createdAt: form.createdAt || Date.now(),
        totalAppliedCount: form.totalAppliedCount || 0,
        totalRevenueImpact: form.totalRevenueImpact || 0,
      };
      onSave(ruleToSave);
    } catch (error) {
      showToast({ message: 'فشل حفظ القاعدة', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [form, onSave, showToast]);

  // ---- Portal ----
  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root') || document.body;

  const steps = [
    { label: 'معلومات أساسية', icon: '📝' },
    { label: 'المنتجات', icon: '📦' },
    { label: 'الشروط', icon: '🔍' },
    { label: 'الإجراء', icon: '⚡' },
    { label: 'حدود الأمان', icon: '🛡️' },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative bg-neo-bg rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="p-4 border-b border-neo-soft-gray flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold font-cairo text-neo-secondary">
            {isNew ? 'إضافة قاعدة تسعير جديدة' : `تعديل: ${editingRule?.name}`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </header>

        {/* Step indicator */}
        <div className="px-4 py-2 border-b border-neo-soft-gray flex gap-1 overflow-x-auto flex-shrink-0">
          {steps.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full whitespace-nowrap transition-all ${
                step === i
                  ? 'bg-neo-primary text-white'
                  : step > i
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > i && <CheckCircleIcon className="w-3 h-3" />}
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {step === 0 && <StepBasicInfo form={form} updateForm={updateForm} />}
          {step === 1 && <StepProductSelection form={form} updateForm={updateForm} />}
          {step === 2 && (
            <StepConditions
              conditions={form.conditions}
              addCondition={addCondition}
              removeCondition={removeCondition}
              updateCondition={updateCondition}
              updateConditionParam={updateConditionParam}
            />
          )}
          {step === 3 && (
            <StepAction
              action={form.actions[0]}
              updateAction={updateAction}
              updateActionParam={updateActionParam}
            />
          )}
          {step === 4 && (
            <StepSafetyLimits
              safetyLimits={form.safetyLimits}
              updateSafety={updateSafety}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="p-4 bg-white border-t border-neo-soft-gray flex justify-between items-center rounded-b-2xl flex-shrink-0">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-neo-secondary/60 hover:text-neo-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="w-4 h-4" />
            السابق
          </button>
          <div className="flex items-center gap-2">
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 px-4 py-2 bg-neo-primary text-white text-sm font-bold rounded-lg hover:bg-neo-accent transition"
              >
                التالي
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent disabled:opacity-50 shadow-sm"
              >
                {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                {isSaving ? 'جاري الحفظ...' : 'حفظ القاعدة'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    portalRoot
  );
};

// =============================================================================
// Step 1: Basic Info
// =============================================================================
interface StepBasicInfoProps {
  form: PricingRule;
  updateForm: (updates: Partial<PricingRule>) => void;
}

const StepBasicInfo: React.FC<StepBasicInfoProps> = ({ form, updateForm }) => (
  <div className="space-y-4">
    <div>
      <label className="font-bold text-sm text-neo-secondary/80">اسم القاعدة (بالعربية)</label>
      <input
        type="text"
        value={form.name}
        onChange={e => updateForm({ name: e.target.value })}
        className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
        placeholder="مثال: عرض وقت الغداء"
      />
    </div>
    <div>
      <label className="font-bold text-sm text-neo-secondary/80">الوصف</label>
      <textarea
        value={form.description}
        onChange={e => updateForm({ description: e.target.value })}
        className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black resize-none"
        rows={2}
        placeholder="وصف مختصر للقاعدة"
      />
    </div>
    <div>
      <label className="font-bold text-sm text-neo-secondary/80">
        الأولوية: <span className="text-neo-primary">{form.priority}</span>
      </label>
      <input
        type="range"
        min={1}
        max={20}
        value={form.priority}
        onChange={e => updateForm({ priority: Number(e.target.value) })}
        className="w-full mt-1"
      />
      <div className="flex justify-between text-xs text-neo-secondary/40">
        <span>منخفضة (1)</span>
        <span>عالية (20)</span>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={e => updateForm({ isActive: e.target.checked })}
          className="w-4 h-4 rounded accent-neo-primary"
        />
        <span className="font-bold text-sm text-neo-secondary/80">قاعدة نشطة</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.canCombineWithOthers}
          onChange={e => updateForm({ canCombineWithOthers: e.target.checked })}
          className="w-4 h-4 rounded accent-neo-primary"
        />
        <span className="font-bold text-sm text-neo-secondary/80">يمكن دمجها مع قواعد أخرى</span>
      </label>
    </div>
  </div>
);

// =============================================================================
// Step 2: Product Selection
// =============================================================================
interface StepProductSelectionProps {
  form: PricingRule;
  updateForm: (updates: Partial<PricingRule>) => void;
}

const StepProductSelection: React.FC<StepProductSelectionProps> = ({ form, updateForm }) => {
  const applyToAll = form.productIds.length === 0 && form.categoryIds.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={e => {
              if (e.target.checked) {
                updateForm({ productIds: [], categoryIds: [] });
              }
            }}
            className="w-4 h-4 rounded accent-neo-primary"
          />
          <span className="font-bold text-sm text-neo-secondary/80">تطبيق على جميع المنتجات</span>
        </label>
      </div>

      {!applyToAll && (
        <>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">معرفات المنتجات (مفصولة بفواصل)</label>
            <input
              type="text"
              value={form.productIds.join(', ')}
              onChange={e => {
                const ids = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                updateForm({ productIds: ids });
              }}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
              placeholder="prod_1, prod_2, prod_3"
            />
            <p className="text-xs text-neo-secondary/40 mt-1">أدخل معرفات المنتجات مفصولة بفواصل</p>
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">معرفات الفئات (مفصولة بفواصل)</label>
            <input
              type="text"
              value={form.categoryIds.join(', ')}
              onChange={e => {
                const ids = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                updateForm({ categoryIds: ids });
              }}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
              placeholder="cat_1, cat_2"
            />
          </div>
        </>
      )}
    </div>
  );
};

// =============================================================================
// Step 3: Conditions
// =============================================================================
interface StepConditionsProps {
  conditions: PricingCondition[];
  addCondition: () => void;
  removeCondition: (index: number) => void;
  updateCondition: (index: number, updates: Partial<PricingCondition>) => void;
  updateConditionParam: (index: number, key: string, value: string | number | boolean | number[]) => void;
}

const StepConditions: React.FC<StepConditionsProps> = ({
  conditions,
  addCondition,
  removeCondition,
  updateCondition,
  updateConditionParam,
}) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <p className="text-sm text-neo-secondary/60">أضف شروط تحقق القاعدة (يجب تحقق جميع الشروط معاً)</p>
      <button
        onClick={addCondition}
        className="flex items-center gap-1 text-sm text-neo-primary font-bold hover:underline"
      >
        <PlusIcon className="w-4 h-4" />
        إضافة شرط
      </button>
    </div>

    {conditions.length === 0 && (
      <div className="text-center py-6 text-neo-secondary/40 border border-dashed border-neo-soft-gray rounded-lg">
        لا توجد شروط بعد. اضغط &quot;إضافة شرط&quot;.
      </div>
    )}

    {conditions.map((condition, idx) => (
      <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3 relative">
        <button
          onClick={() => removeCondition(idx)}
          className="absolute top-2 left-2 p-1 rounded hover:bg-red-100 text-red-400"
          title="حذف الشرط"
        >
          <TrashIcon className="w-4 h-4" />
        </button>

        <div>
          <label className="font-bold text-xs text-neo-secondary/60">نوع الشرط</label>
          <select
            value={condition.type}
            onChange={e => {
              const newType = e.target.value as PricingConditionType;
              const defaultParams = getDefaultConditionParams(newType);
              updateCondition(idx, { type: newType, params: defaultParams });
            }}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
          >
            {CONDITION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <ConditionParams
          type={condition.type}
          params={condition.params}
          updateParam={(key, value) => updateConditionParam(idx, key, value)}
        />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Condition Params (per type)
// ---------------------------------------------------------------------------
interface ConditionParamsProps {
  type: PricingConditionType;
  params: Record<string, string | number | boolean>;
  updateParam: (key: string, value: string | number | boolean | number[]) => void;
}

const ConditionParams: React.FC<ConditionParamsProps> = ({ type, params, updateParam }) => {
  switch (type) {
    case 'TIME_OF_DAY':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">من الساعة</label>
            <input
              type="number"
              min={0}
              max={23}
              value={Number(params.hoursStart) || 9}
              onChange={e => updateParam('hoursStart', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
            />
          </div>
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">إلى الساعة</label>
            <input
              type="number"
              min={0}
              max={23}
              value={Number(params.hoursEnd) || 17}
              onChange={e => updateParam('hoursEnd', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
            />
          </div>
        </div>
      );

    case 'DAY_OF_WEEK': {
      const selectedDays = Array.isArray(params.days)
        ? params.days as number[]
        : typeof params.days === 'string'
          ? params.days.split(',').map(Number).filter(Number.isInteger)
          : [];
      return (
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => {
                const days = selectedDays.includes(i)
                  ? selectedDays.filter(d => d !== i)
                  : [...selectedDays, i];
                updateParam('days', days);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                selectedDays.includes(i)
                  ? 'bg-neo-primary text-white'
                  : 'bg-gray-200 text-neo-secondary/60 hover:bg-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      );
    }

    case 'LOW_STOCK':
      return (
        <div>
          <label className="font-bold text-xs text-neo-secondary/60">حد المخزون المنخفض (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={Number(params.thresholdPercent) || 20}
            onChange={e => updateParam('thresholdPercent', Number(e.target.value))}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
          />
        </div>
      );

    case 'EXPIRY_APPROACHING':
      return (
        <div>
          <label className="font-bold text-xs text-neo-secondary/60">أيام قبل انتهاء الصلاحية</label>
          <input
            type="number"
            min={1}
            max={365}
            value={Number(params.daysBeforeExpiry) || 7}
            onChange={e => updateParam('daysBeforeExpiry', Number(e.target.value))}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
          />
        </div>
      );

    case 'SEASONAL_PERIOD':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">اسم الموسم</label>
            <input
              type="text"
              value={String(params.seasonName || '')}
              onChange={e => updateParam('seasonName', e.target.value)}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
              placeholder="رمضان"
            />
          </div>
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">شهر البداية</label>
            <input
              type="number"
              min={1}
              max={12}
              value={Number(params.startMonth) || 1}
              onChange={e => updateParam('startMonth', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
            />
          </div>
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">يوم البداية</label>
            <input
              type="number"
              min={1}
              max={31}
              value={Number(params.startDay) || 1}
              onChange={e => updateParam('startDay', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
            />
          </div>
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">شهر النهاية</label>
            <input
              type="number"
              min={1}
              max={12}
              value={Number(params.endMonth) || 1}
              onChange={e => updateParam('endMonth', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
            />
          </div>
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">يوم النهاية</label>
            <input
              type="number"
              min={1}
              max={31}
              value={Number(params.endDay) || 30}
              onChange={e => updateParam('endDay', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
            />
          </div>
        </div>
      );

    case 'CUSTOMER_SEGMENT':
      return (
        <div>
          <label className="font-bold text-xs text-neo-secondary/60">شريحة العملاء</label>
          <select
            value={String(params.segment || 'VIP')}
            onChange={e => updateParam('segment', e.target.value)}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
          >
            <option value="VIP">عملاء VIP</option>
            <option value="NEW">عملاء جدد</option>
            <option value="RETURNING">عملاء عائدون</option>
          </select>
        </div>
      );

    case 'QUANTITY_PURCHASED':
      return (
        <div>
          <label className="font-bold text-xs text-neo-secondary/60">الحد الأدنى للكمية</label>
          <input
            type="number"
            min={1}
            value={Number(params.minQuantity) || 5}
            onChange={e => updateParam('minQuantity', Number(e.target.value))}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
          />
        </div>
      );

    case 'COMBINATION_DEAL':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">معرف المنتج المطلوب</label>
            <input
              type="text"
              value={String(params.requiredProductId || '')}
              onChange={e => updateParam('requiredProductId', e.target.value)}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
              placeholder="prod_1"
            />
          </div>
          <div>
            <label className="font-bold text-xs text-neo-secondary/60">الكمية المطلوبة</label>
            <input
              type="number"
              min={1}
              value={Number(params.requiredQuantity) || 1}
              onChange={e => updateParam('requiredQuantity', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black text-sm"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Default condition params per type
// ---------------------------------------------------------------------------
function getDefaultConditionParams(type: PricingConditionType): Record<string, string | number | boolean> {
  switch (type) {
    case 'TIME_OF_DAY':
      return { hoursStart: 9, hoursEnd: 17 };
    case 'DAY_OF_WEEK':
      return { days: '5,6' }; // Friday, Saturday
    case 'LOW_STOCK':
      return { thresholdPercent: 20 };
    case 'EXPIRY_APPROACHING':
      return { daysBeforeExpiry: 7 };
    case 'SEASONAL_PERIOD':
      return { seasonName: 'رمضان', startMonth: 3, startDay: 1, endMonth: 4, endDay: 1 };
    case 'CUSTOMER_SEGMENT':
      return { segment: 'VIP' };
    case 'QUANTITY_PURCHASED':
      return { minQuantity: 5 };
    case 'COMBINATION_DEAL':
      return { requiredProductId: '', requiredQuantity: 1 };
    default:
      return {};
  }
}

// =============================================================================
// Step 4: Action
// =============================================================================
interface StepActionProps {
  action: PricingAction;
  updateAction: (updates: Partial<PricingAction>) => void;
  updateActionParam: (key: string, value: string | number | boolean) => void;
}

const StepAction: React.FC<StepActionProps> = ({ action, updateAction, updateActionParam }) => (
  <div className="space-y-4">
    <div>
      <label className="font-bold text-sm text-neo-secondary/80">نوع الإجراء</label>
      <select
        value={action.type}
        onChange={e => {
          const newType = e.target.value as PricingActionType;
          const defaultParams = getDefaultActionParams(newType);
          updateAction({ type: newType, params: defaultParams });
        }}
        className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
      >
        {ACTION_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>

    <ActionParams type={action.type} params={action.params} updateParam={updateActionParam} />
  </div>
);

// ---------------------------------------------------------------------------
// Action Params
// ---------------------------------------------------------------------------
interface ActionParamsProps {
  type: PricingActionType;
  params: Record<string, string | number | boolean>;
  updateParam: (key: string, value: string | number | boolean) => void;
}

const ActionParams: React.FC<ActionParamsProps> = ({ type, params, updateParam }) => {
  switch (type) {
    case 'PERCENTAGE_DISCOUNT':
      return (
        <div>
          <label className="font-bold text-sm text-neo-secondary/80">نسبة الخصم (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={Number(params.discountPercent) || 10}
            onChange={e => updateParam('discountPercent', Number(e.target.value))}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
          />
        </div>
      );

    case 'FIXED_PRICE':
      return (
        <div>
          <label className="font-bold text-sm text-neo-secondary/80">السعر الجديد (ج.م)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={Number(params.fixedPrice) || 0}
            onChange={e => updateParam('fixedPrice', Number(e.target.value))}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
          />
        </div>
      );

    case 'GRADUAL_DISCOUNT':
      return (
        <div className="space-y-3">
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">نسبة الخصم الابتدائية (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={Number(params.initialDiscountPercent) || 5}
              onChange={e => updateParam('initialDiscountPercent', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
            />
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">مقدار الزيادة لكل فترة (%)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={Number(params.incrementPercent) || 5}
              onChange={e => updateParam('incrementPercent', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
            />
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">فترة الزيادة (أيام)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={Number(params.incrementIntervalDays) || 2}
              onChange={e => updateParam('incrementIntervalDays', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
            />
          </div>
        </div>
      );

    case 'BUY_X_GET_Y':
      return (
        <div className="space-y-3">
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">اشترِ (عدد)</label>
            <input
              type="number"
              min={1}
              value={Number(params.buyQuantity) || 2}
              onChange={e => updateParam('buyQuantity', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
            />
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">احصل على (عدد)</label>
            <input
              type="number"
              min={1}
              value={Number(params.getQuantity) || 1}
              onChange={e => updateParam('getQuantity', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
            />
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">نسبة خصم المنتج المجاني (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={Number(params.discountPercent) || 100}
              onChange={e => updateParam('discountPercent', Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
            />
          </div>
        </div>
      );

    case 'LOYALTY_POINTS_BONUS':
      return (
        <div>
          <label className="font-bold text-sm text-neo-secondary/80">مضاعف نقاط الولاء</label>
          <input
            type="number"
            min={1}
            max={10}
            value={Number(params.pointsMultiplier) || 2}
            onChange={e => updateParam('pointsMultiplier', Number(e.target.value))}
            className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
          />
        </div>
      );

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Default action params per type
// ---------------------------------------------------------------------------
function getDefaultActionParams(type: PricingActionType): Record<string, string | number | boolean> {
  switch (type) {
    case 'PERCENTAGE_DISCOUNT':
      return { discountPercent: 10 };
    case 'FIXED_PRICE':
      return { fixedPrice: 50 };
    case 'GRADUAL_DISCOUNT':
      return { initialDiscountPercent: 5, incrementPercent: 5, incrementIntervalDays: 2 };
    case 'BUY_X_GET_Y':
      return { buyQuantity: 2, getQuantity: 1, discountPercent: 100 };
    case 'LOYALTY_POINTS_BONUS':
      return { pointsMultiplier: 2 };
    default:
      return {};
  }
}

// =============================================================================
// Step 5: Safety Limits
// =============================================================================
interface StepSafetyLimitsProps {
  safetyLimits: PricingSafetyLimits;
  updateSafety: (updates: Partial<PricingSafetyLimits>) => void;
}

const StepSafetyLimits: React.FC<StepSafetyLimitsProps> = ({ safetyLimits, updateSafety }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="font-bold text-sm text-neo-secondary/80">الحد الأدنى للسعر (ج.م)</label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={safetyLimits.minPrice}
          onChange={e => updateSafety({ minPrice: Number(e.target.value) })}
          className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
        />
      </div>
      <div>
        <label className="font-bold text-sm text-neo-secondary/80">الحد الأقصى للسعر (ج.م)</label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={safetyLimits.maxPrice}
          onChange={e => updateSafety({ maxPrice: Number(e.target.value) })}
          className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
        />
      </div>
    </div>
    <div>
      <label className="font-bold text-sm text-neo-secondary/80">الحد الأقصى للخصم اليومي (ج.م)</label>
      <input
        type="number"
        min={0}
        step={10}
        value={safetyLimits.maxDailyDiscount}
        onChange={e => updateSafety({ maxDailyDiscount: Number(e.target.value) })}
        className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
      />
    </div>
    <div>
      <label className="font-bold text-sm text-neo-secondary/80">
        الحد الأقصى للاستخدام لكل عميل (-1 = بلا حدود)
      </label>
      <input
        type="number"
        min={-1}
        value={safetyLimits.maxUsesPerCustomer}
        onChange={e => updateSafety({ maxUsesPerCustomer: Number(e.target.value) })}
        className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="font-bold text-sm text-neo-secondary/80">صالح من</label>
        <input
          type="date"
          value={new Date(safetyLimits.validFrom).toISOString().slice(0, 10)}
          onChange={e => updateSafety({ validFrom: new Date(e.target.value).getTime() })}
          className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
        />
      </div>
      <div>
        <label className="font-bold text-sm text-neo-secondary/80">صالح إلى</label>
        <input
          type="date"
          value={new Date(safetyLimits.validUntil).toISOString().slice(0, 10)}
          onChange={e => updateSafety({ validUntil: new Date(e.target.value).getTime() })}
          className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"
        />
      </div>
    </div>
  </div>
);

export default PricingRuleEditModal;
