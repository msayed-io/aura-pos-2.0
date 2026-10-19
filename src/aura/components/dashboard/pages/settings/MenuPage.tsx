







import React, { useState, useEffect, useMemo } from 'react';
import type { MenuItem, Category } from '../../../../types';
import { menuService } from '../../services/menuService';
import { SpinnerIcon, PlusIcon, TrashIcon, Cog6ToothIcon, PencilIcon } from '../../Icons';
import ItemEditModal from '../../ui/ItemEditModal';
import ManageCategoriesModal from '../../ui/ManageCategoriesModal';
import { useDashboard } from '../../DashboardContext';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';

const NEW_ITEMS_CATEGORY_ID = 'cat_new_items';
const NEW_ITEMS_CATEGORY = { id: NEW_ITEMS_CATEGORY_ID, name: 'وصل حديثاً', order: -1 };

const MenuPage: React.FC = () => {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    
    // State for Item Modal
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const isNewItem = !editingItem;
    
    const [isDeleting, setIsDeleting] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);

    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    const { showToast } = useDashboard();

    useEffect(() => {
        setLoading(true);
        const unsubscribe = menuService.subscribe(data => {
            setMenuItems(data.menuItems);
            const allCats = [
                { id: 'all', name: 'الكل', order: -2 },
                NEW_ITEMS_CATEGORY,
                ...data.categories,
            ].sort((a,b) => a.order - b.order);
            setCategories(allCats);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSaveItem = async (itemData: Partial<MenuItem>) => {
        const id = itemData.id || `menu_${Date.now()}`;
        const finalItemData = { ...itemData, id };
        
        await menuService.saveMenuItem(finalItemData);
        showToast({ message: isNewItem ? 'تمت إضافة الصنف بنجاح' : 'تم تحديث الصنف بنجاح', type: 'success' });
    };
    
    const handleRequestDelete = (item: MenuItem) => {
        setItemToDelete(item);
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        // Simulate network delay
        await new Promise(res => setTimeout(res, 400));
        menuService.deleteMenuItem(itemToDelete.id);
        
        showToast({ message: `تم حذف "${itemToDelete.name}" بنجاح.`, type: 'success' });
        setItemToDelete(null);
        setIsDeleting(false);
    };

    const handleSaveCategories = (updatedCategories: Category[]) => {
        menuService.saveCategories(updatedCategories);
        showToast({ message: 'تم تحديث الأقسام بنجاح.', type: 'success' });
    }

    const filteredItems = useMemo(() => {
        if (selectedCategory === 'all') return menuItems;
        if (selectedCategory === NEW_ITEMS_CATEGORY_ID) {
            return menuItems.filter(item => item.isNewRelease);
        }
        return menuItems.filter(item => item.libraryCategories?.includes(selectedCategory));
    }, [menuItems, selectedCategory]);

    if (loading) return <div className="flex h-full items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;

    return (
        <>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
                    {categories.map(cat => {
                         const isActive = selectedCategory === cat.id;
                         return (
                            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors whitespace-nowrap ${isActive ? 'bg-neo-primary/10 text-neo-primary' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{cat.name}</button>
                         )
                    })}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
                     <button onClick={() => { setEditingItem(null); setIsItemModalOpen(true); }} className="flex-1 sm:flex-auto flex items-center justify-center gap-2 px-4 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm"><PlusIcon className="w-5 h-5"/> <span>إضافة صنف</span></button>
                     <button onClick={() => setIsCategoryModalOpen(true)} className="p-2.5 bg-neo-soft-gray text-neo-secondary/80 rounded-lg hover:bg-gray-200 transition" title="إدارة الأقسام"><Cog6ToothIcon className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {filteredItems.map(item => (
                    <div key={item.id} className={`group bg-white rounded-xl shadow-sm border p-3 flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${!item.isActive ? 'border-gray-200' : 'border-neo-soft-gray hover:border-neo-primary'}`}>
                        {/* Image */}
                        <div className="w-full h-44 bg-gray-100 rounded-md mb-3 overflow-hidden relative">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            {item.isActive === false && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <span className="bg-gray-600/80 text-white text-xs font-bold px-3 py-1 rounded-full">غير نشط</span>
                                </div>
                            )}
                        </div>

                        {/* Info & Actions */}
                        <div className="flex-grow flex flex-col">
                            <h3 className="font-bold text-sm text-neo-secondary flex-grow line-clamp-2 h-10">{item.name}</h3>
                            <div className="flex justify-between items-center mt-2">
                                <p className="font-bold font-montserrat text-lg text-neo-primary">{item.price} ج.م</p>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <button onClick={() => { setEditingItem(item); setIsItemModalOpen(true); }} className="p-2 rounded-md hover:bg-neo-soft-gray text-neo-secondary/70" title="تعديل">
                                        <PencilIcon className="w-4 h-4"/>
                                    </button>
                                    <button onClick={() => handleRequestDelete(item)} className="p-2 rounded-md hover:bg-neo-error/10 text-neo-error" title="حذف">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            <ItemEditModal 
                item={editingItem} 
                isOpen={isItemModalOpen} 
                onClose={() => setIsItemModalOpen(false)} 
                onSave={handleSaveItem} 
                itemType="menu" 
                categories={categories}
                cropperConfig={{
                    aspectRatios: [{ label: '1:1', value: 1 }],
                    defaultAspectRatio: 1
                }}
            />

            <DeleteConfirmationModal
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={handleConfirmDelete}
                title={`حذف "${itemToDelete?.name}"`}
                message="هل أنت متأكد من حذف هذا الصنف نهائياً؟ لا يمكن التراجع عن هذا الإجراء."
                isDeleting={isDeleting}
            />

            <ManageCategoriesModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                initialCategories={categories.filter(c => c.id !== 'all')}
                onSave={handleSaveCategories}
            />
        </>
    );
};

export default MenuPage;