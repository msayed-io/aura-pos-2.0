import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Promotion, PromotionType } from '../../../types';
import { XIcon, SpinnerIcon, SaveIcon } from '../Icons';
import { useDashboard } from '../DashboardContext';

interface PromotionEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (promo: Partial<Promotion>) => Promise<void>;
  promotion: Promotion | null;
}

const PromotionEditModal: React.FC<PromotionEditModalProps> = ({ isOpen, onClose, onSave, promotion }) => {
  const [formData, setFormData] = useState<Partial<Promotion>>({});
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useDashboard();
  const isNew = !promotion;

  useEffect(() => {
    if (isOpen) {
      if (isNew) {
        setFormData({
          type: 'SIMPLE_ANNOUNCEMENT',
          textKey: '',
          targetView: 'home',
        });
      } else {
        setFormData({ ...promotion });
      }
    }
  }, [promotion, isOpen, isNew]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'number') {
        finalValue = value === '' ? null : Number(value);
    }
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  }, []);

  const handleSaveClick = async () => {
    if (!formData.textKey) {
      showToast({ message: 'نص العرض مطلوب.', type: 'error' });
      return;
    }
    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
  };
  
  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) return null;

  const targetOptions: { label: string; value: Promotion['targetView'] }[] = [
    { label: 'الصفحة الرئيسية', value: 'home' },
    { label: 'قائمة الطعام (المنيو)', value: 'menu' },
    { label: 'صفحة العروض', value: 'offers' },
  ];

  const promoTypes: { id: PromotionType, label: string }[] = [
    { id: 'SIMPLE_ANNOUNCEMENT', label: 'إعلان نصي' },
    { id: 'COUPON_DISCOUNT', label: 'خصم بكوبون' },
    { id: 'FREE_DELIVERY', label: 'توصيل مجاني' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
      <div className="relative premium-modal w-full max-w-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
        <header className="p-6 border-b border-neo-soft-gray flex justify-between items-center bg-gray-50/50 rounded-t-[3rem]">
          <h2 className="text-xl font-bold font-cairo text-neo-secondary">
            {isNew ? 'إضافة عرض ترويجي جديد' : `تعديل العرض`}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
        </header>
        <main className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          <div>
            <label className="font-bold text-sm text-neo-secondary/80 mr-2 underline decoration-neo-primary/30 underline-offset-4">1. اختر نوع العرض</label>
            <div className="flex gap-1 bg-gray-200/50 p-1.5 rounded-full mt-2 border border-gray-200">
                {promoTypes.map(pt => (
                    <button 
                        key={pt.id} 
                        onClick={() => setFormData(prev => ({ ...prev, type: pt.id }))}
                        className={`flex-1 py-2.5 rounded-full font-bold text-sm transition-all duration-300 ${formData.type === pt.id ? 'bg-neo-primary text-white shadow-lg' : 'text-gray-500 hover:text-neo-primary'}`}
                    >
                        {pt.label}
                    </button>
                ))}
            </div>
          </div>
          
          <div className="pt-4 border-t border-dashed border-neo-soft-gray">
            <label className="font-bold text-sm text-neo-secondary/80 mr-2 underline decoration-neo-primary/30 underline-offset-4">2. أدخل تفاصيل العرض</label>
            <div className="mt-3 space-y-4">
                <div>
                    <label className="font-bold text-xs text-neo-secondary/60 mr-1">النص الترويجي (مطلوب)</label>
                    <input type="text" name="textKey" value={formData.textKey || ''} onChange={handleChange} className="w-full mt-1 premium-input" placeholder="مثال: خصم 20% على الوجبات العائلية" />
                </div>
                <div>
                    <label className="font-bold text-xs text-neo-secondary/60 mr-1">وجهة المستخدم عند الضغط</label>
                    <select name="targetView" value={formData.targetView} onChange={handleChange} className="w-full mt-1 premium-input bg-white appearance-none">
                    {targetOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
            </div>
          </div>

          <div className="pt-4 border-t border-dashed border-neo-soft-gray">
            <label className="font-bold text-sm text-neo-secondary/80">3. الإعدادات الخاصة بالنوع المحدد</label>
             <div className="mt-2 p-4 bg-white border border-neo-soft-gray rounded-lg animate-fade-in">
                {formData.type === 'SIMPLE_ANNOUNCEMENT' && (
                    <p className="text-center text-sm text-neo-secondary/70">لا توجد إعدادات إضافية لهذا النوع من العروض.</p>
                )}
                {formData.type === 'COUPON_DISCOUNT' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="font-bold text-xs text-neo-secondary/80">كود الخصم</label>
                            <input type="text" name="couponCode" value={formData.couponCode || ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" placeholder="مثال: HI20" />
                        </div>
                        <div>
                            <label className="font-bold text-xs text-neo-secondary/80">رسالة نجاح الخصم (اختياري)</label>
                            <input type="text" name="discountMessageKey" value={formData.discountMessageKey || ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" />
                        </div>
                        <div>
                            <label className="font-bold text-xs text-neo-secondary/80">نسبة الخصم (%)</label>
                            <input type="number" name="discountPercentage" value={formData.discountPercentage ?? ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" />
                        </div>
                        <div>
                            <label className="font-bold text-xs text-neo-secondary/80">مبلغ الخصم (ج.م)</label>
                            <input type="number" name="discountAmount" value={formData.discountAmount ?? ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" />
                        </div>
                    </div>
                )}
                {formData.type === 'FREE_DELIVERY' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="font-bold text-xs text-neo-secondary/80">حد التوصيل المجاني (ج.م)</label>
                            <input type="number" name="freeDeliveryMinAmount" value={formData.freeDeliveryMinAmount ?? ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" placeholder="مثال: 300" />
                        </div>
                        <div>
                            <label className="font-bold text-xs text-neo-secondary/80">رسالة التوصيل المجاني (اختياري)</label>
                            <input type="text" name="freeDeliveryMessageKey" value={formData.freeDeliveryMessageKey || ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" />
                        </div>
                     </div>
                )}
             </div>
          </div>
        </main>
        <footer className="p-6 bg-gray-50 border-t border-neo-soft-gray flex justify-end gap-3 rounded-b-[3rem]">
          <button onClick={onClose} className="px-6 py-2.5 bg-white border border-gray-200 text-neo-secondary font-bold rounded-xl hover:bg-gray-100 transition-colors">إلغاء</button>
          <button onClick={handleSaveClick} disabled={isSaving} className="px-6 py-2.5 bg-neo-primary text-white font-bold rounded-xl hover:bg-neo-accent disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-neo-primary/20 transition-all active:scale-95">
            {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin"/>}
            <SaveIcon className="w-4 h-4" />
            {isSaving ? 'جاري الحفظ...' : 'حفظ العرض'}
          </button>
        </footer>
      </div>
    </div>,
    portalRoot
  );
};

export default PromotionEditModal;