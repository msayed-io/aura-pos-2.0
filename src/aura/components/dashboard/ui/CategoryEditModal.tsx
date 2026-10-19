import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Category } from '../../../types';
import { XIcon, SpinnerIcon } from '../Icons';
import { useDashboard } from '../DashboardContext';

interface CategoryEditModalProps {
  category: Omit<Category, 'id'> | Category | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: Category) => Promise<void>;
  onCreate: (category: Omit<Category, 'id'>) => Promise<void>;
}

const CategoryEditModal: React.FC<CategoryEditModalProps> = ({ category, isOpen, onClose, onSave, onCreate }) => {
  const [name, setName] = useState('');
  const [order, setOrder] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useDashboard();
  const isNewCategory = !category || !('id' in category);

  useEffect(() => {
    if (isOpen) {
      setName(category?.name || '');
      setOrder(category?.order || 0);
    }
  }, [category, isOpen]);

  const handleSaveClick = async () => {
    if (!name) {
      showToast({ message: "يرجى إدخال اسم القسم.", type: 'error' });
      return;
    }
    setIsSaving(true);
    try {
      if (isNewCategory) {
        await onCreate({ name, order });
      } else if (category && 'id' in category) {
        await onSave({ ...category, name, order });
      }
      onClose();
    } catch (error) {
      console.error("Failed to save category:", error);
      showToast({ message: "فشل حفظ القسم.", type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
      <div className="relative bg-neo-bg rounded-2xl shadow-xl w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-neo-soft-gray flex justify-between items-center">
          <h2 className="text-xl font-bold font-cairo text-neo-secondary">
            {isNewCategory ? 'إضافة قسم جديد' : `تعديل قسم: ${category?.name}`}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
        </header>
        <main className="p-6 space-y-4">
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">اسم القسم</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" 
            />
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">ترتيب العرض</label>
            <p className="text-sm text-neo-secondary/60 mb-1">رقم أصغر يظهر أولاً.</p>
            <input 
              type="number" 
              value={order} 
              onChange={e => setOrder(Number(e.target.value))}
              className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" 
            />
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

export default CategoryEditModal;