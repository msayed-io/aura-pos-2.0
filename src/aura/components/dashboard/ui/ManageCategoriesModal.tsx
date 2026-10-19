import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Category } from '../../../types';
import { XIcon, PencilIcon, TrashIcon, PlusIcon, LockIcon } from '../Icons';
import CategoryEditModal from './CategoryEditModal';

interface ManageCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategories: Category[];
  onSave: (categories: Category[]) => void;
}

const NEW_RELEASES_CATEGORY_ID = 'cat_new_releases';

const ManageCategoriesModal: React.FC<ManageCategoriesModalProps> = ({ isOpen, onClose, initialCategories, onSave }) => {
  const [categories, setCategories] = useState(initialCategories);
  const [editingCategory, setEditingCategory] = useState<Category | Omit<Category, 'id'> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCategories(initialCategories);
    }
  }, [isOpen, initialCategories]);

  const handleSaveCategory = async (catData: Category) => {
    setCategories(prev => prev.map(c => c.id === catData.id ? catData : c));
    setEditingCategory(null);
  };
  
  const handleCreateCategory = async (catData: Omit<Category, 'id'>) => {
    const newCategory: Category = { ...catData, id: `cat_${Date.now()}` };
    setCategories(prev => [...prev, newCategory]);
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (catId: string) => {
    setCategories(prev => prev.filter(c => c.id !== catId));
  };

  const handleSaveChanges = () => {
    // Filter out the fixed category before saving, as it's not managed by the user.
    onSave(categories.filter(c => c.id !== NEW_RELEASES_CATEGORY_ID));
    onClose();
  };

  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
        <div className="relative bg-neo-bg rounded-2xl shadow-xl w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
          <header className="p-4 border-b border-neo-soft-gray flex justify-between items-center">
            <h2 className="font-bold text-lg text-neo-secondary">إدارة الأقسام</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70">
              <XIcon className="w-5 h-5"/>
            </button>
          </header>
          <main className="p-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              {categories.map(cat => {
                const isFixed = cat.id === NEW_RELEASES_CATEGORY_ID;
                return (
                    <div key={cat.id} className={`flex justify-between items-center p-3 rounded-lg border ${isFixed ? 'bg-orange-50 border-orange-200' : 'bg-white hover:bg-gray-50 border-neo-soft-gray'}`}>
                    <div className="flex items-center gap-2">
                        {isFixed && <LockIcon className="w-4 h-4 text-orange-400" />}
                        <span className={`font-semibold ${isFixed ? 'text-orange-800' : 'text-neo-secondary'}`}>{cat.name}</span>
                        <span className={`text-sm ${isFixed ? 'text-orange-600/70' : 'text-neo-secondary/50'}`}>(الترتيب: {cat.order})</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { setEditingCategory(cat); }} disabled={isFixed} className="text-sm text-neo-primary hover:underline font-semibold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline" title={isFixed ? 'هذا القسم ثابت ولا يمكن تعديله' : 'تعديل'}>
                            <PencilIcon className="w-3 h-3" /> تعديل
                        </button>
                        <button onClick={() => handleDeleteCategory(cat.id)} disabled={isFixed} className="text-sm text-neo-error hover:underline font-semibold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline" title={isFixed ? 'هذا القسم ثابت ولا يمكن حذفه' : 'حذف'}>
                            <TrashIcon className="w-3 h-3" /> حذف
                        </button>
                    </div>
                    </div>
                );
              })}
            </div>
          </main>
          <footer className="p-4 bg-white border-t border-neo-soft-gray flex justify-between items-center rounded-2xl">
            <button 
              onClick={() => setEditingCategory({ name: '', order: categories.length + 1 })} 
              className="px-4 py-2.5 bg-neo-primary/10 text-neo-primary font-bold rounded-lg hover:bg-neo-primary/20 transition flex items-center justify-center gap-2"
            >
              <PlusIcon className="w-5 h-5"/>
              إضافة قسم
            </button>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2.5 bg-neo-soft-gray text-neo-secondary/80 font-bold rounded-lg hover:bg-gray-200">إلغاء</button>
                <button onClick={handleSaveChanges} className="px-6 py-2.5 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent shadow-sm">
                    حفظ التغييرات
                </button>
            </div>
          </footer>
        </div>
    </div>
  );

  return (
    <>
      {createPortal(content, portalRoot)}
      {editingCategory && (
        <CategoryEditModal
          category={editingCategory}
          isOpen={!!editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={handleSaveCategory}
          onCreate={handleCreateCategory}
        />
      )}
    </>
  );
};

export default ManageCategoriesModal;