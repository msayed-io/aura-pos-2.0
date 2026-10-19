import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Coupon } from '../../../types';
import { XIcon, SpinnerIcon } from '../Icons';
import { useDashboard } from '../DashboardContext';

type ValidityType = 'usage' | 'date' | 'permanent';

interface CouponEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (coupon: Partial<Coupon>) => Promise<void>;
  coupon: Coupon | null;
}

const CouponEditModal: React.FC<CouponEditModalProps> = ({ isOpen, onClose, onSave, coupon }) => {
  const [formData, setFormData] = useState<Partial<Coupon>>({});
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<'hours' | 'days'>('days');
  const [validityType, setValidityType] = useState<ValidityType>('date');
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useDashboard();
  const isNewCoupon = !coupon;

  useEffect(() => {
    if (isOpen) {
      if (isNewCoupon) {
        setFormData({
          code: '',
          discountType: 'percentage',
          discountValue: 10,
          usageLimit: 100, // Default for 'usage' type
          isActive: true,
        });
        setValidityType('date');
        setDurationValue('7');
        setDurationUnit('days');
      } else {
        setFormData({ ...coupon });
        if (coupon.expiresAt === null && coupon.usageLimit === Infinity) {
            setValidityType('permanent');
            setDurationValue('');
        } else if (coupon.expiresAt === null) {
            setValidityType('usage');
            setDurationValue('');
        } else {
            setValidityType('date');
            const diffMs = coupon.expiresAt! - Date.now();
            const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
            if (diffHours > 24) {
                setDurationValue(Math.ceil(diffHours / 24).toString());
                setDurationUnit('days');
            } else {
                setDurationValue(Math.ceil(diffHours).toString());
                setDurationUnit('hours');
            }
        }
      }
    }
  }, [coupon, isOpen, isNewCoupon]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let finalValue: any = value;
    if (name === 'discountValue' || name === 'usageLimit') {
        finalValue = value === '' ? undefined : Number(value);
    }
    if (name === 'code') {
        finalValue = value.toUpperCase().replace(/\s/g, '');
    }
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  }, []);

  const handleSaveClick = async () => {
    if (!formData.code || !formData.discountValue) {
      showToast({ message: 'يرجى ملء كود وقيمة الخصم.', type: 'error' });
      return;
    }
    setIsSaving(true);
    const finalData = { ...formData };

    switch(validityType) {
        case 'usage':
            if (!formData.usageLimit || formData.usageLimit <= 0) {
                showToast({ message: 'يرجى إدخال حد استخدام صحيح.', type: 'error' });
                setIsSaving(false);
                return;
            }
            finalData.expiresAt = null;
            break;
        case 'date':
            const duration = parseInt(durationValue, 10);
            if (isNaN(duration) || duration <= 0) {
                showToast({ message: 'يرجى إدخال مدة صلاحية صحيحة.', type: 'error' });
                setIsSaving(false);
                return;
            }
            const now = Date.now();
            const durationMs = duration * (durationUnit === 'days' ? 24 : 1) * 60 * 60 * 1000;
            finalData.expiresAt = now + durationMs;
            finalData.usageLimit = Infinity;
            break;
        case 'permanent':
            finalData.expiresAt = null;
            finalData.usageLimit = Infinity;
            break;
    }

    await onSave(finalData);
    setIsSaving(false);
  };
  
  const validityOptions: {id: ValidityType, label: string}[] = [
      {id: 'date', label: 'محدد بوقت'},
      {id: 'usage', label: 'محدد بالاستخدام'},
      {id: 'permanent', label: 'دائم'},
  ];

  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
      <div className="relative bg-neo-bg rounded-2xl shadow-xl w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-neo-soft-gray flex justify-between items-center">
          <h2 className="text-xl font-bold font-cairo text-neo-secondary">
            {isNewCoupon ? 'إضافة كوبون جديد' : `تعديل كوبون: ${coupon?.code}`}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
        </header>
        <main className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">كود الخصم</label>
            <input type="text" name="code" value={formData.code || ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black font-mono tracking-widest" placeholder="e.g. SAVE10" />
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">نوع وقيمة الخصم</label>
            <div className="flex gap-2 mt-1">
              <select name="discountType" value={formData.discountType} onChange={handleChange} className="p-2 border border-neo-soft-gray rounded-md bg-white text-black">
                <option value="percentage">نسبة مئوية (%)</option>
                <option value="fixed">مبلغ ثابت (ج.م)</option>
              </select>
              <input type="number" name="discountValue" value={formData.discountValue ?? ''} onChange={handleChange} className="flex-grow p-2 border border-neo-soft-gray rounded-md bg-white text-black" placeholder="e.g. 15" />
            </div>
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">صلاحية الكوبون</label>
            <div className="flex gap-1 bg-gray-200/70 p-1 rounded-lg mt-1">
                {validityOptions.map(opt => (
                     <button key={opt.id} onClick={() => setValidityType(opt.id)} className={`flex-1 py-1.5 rounded-md font-semibold text-sm transition-all ${validityType === opt.id ? 'bg-neo-primary text-white shadow' : 'text-gray-600'}`}>
                         {opt.label}
                    </button>
                ))}
            </div>
            <div className="mt-3 animate-fade-in">
                {validityType === 'date' && (
                    <div className="p-3 bg-white border border-neo-soft-gray rounded-lg">
                        <label className="font-bold text-sm text-neo-secondary/80">ينتهي بعد</label>
                        <div className="flex gap-2 mt-1">
                            <input type="number" value={durationValue} onChange={e => setDurationValue(e.target.value)} className="w-full p-2 border border-neo-soft-gray rounded-md bg-white text-black" placeholder="e.g. 7" />
                            <select value={durationUnit} onChange={e => setDurationUnit(e.target.value as 'hours' | 'days')} className="p-2 border border-neo-soft-gray rounded-md bg-white text-black">
                                <option value="days">أيام</option>
                                <option value="hours">ساعات</option>
                            </select>
                        </div>
                    </div>
                )}
                 {validityType === 'usage' && (
                    <div className="p-3 bg-white border border-neo-soft-gray rounded-lg">
                        <label className="font-bold text-sm text-neo-secondary/80">الحد الأقصى للاستخدام</label>
                         <input type="number" name="usageLimit" value={formData.usageLimit ?? ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" placeholder="e.g. 100" />
                    </div>
                )}
                 {validityType === 'permanent' && (
                     <div className="p-3 bg-white border border-neo-soft-gray rounded-lg text-center">
                        <p className="text-sm font-semibold text-neo-secondary/70">هذا الكوبون لن ينتهي أبداً.</p>
                    </div>
                )}
            </div>
          </div>
        </main>
        <footer className="p-4 bg-white border-t border-neo-soft-gray flex justify-end gap-3 rounded-2xl">
          <button onClick={onClose} className="px-4 py-2 bg-neo-soft-gray text-neo-secondary/80 font-bold rounded-lg hover:bg-gray-200">إلغاء</button>
          <button onClick={handleSaveClick} disabled={isSaving} className="px-4 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent disabled:opacity-50 flex items-center gap-2 shadow-sm">
            {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
            {isSaving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </footer>
      </div>
    </div>,
    portalRoot
  );
};

export default CouponEditModal;