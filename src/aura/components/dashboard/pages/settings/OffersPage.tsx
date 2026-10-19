import React, { useState, useEffect } from 'react';
import type { Offer, Category } from '../../../../types';
import { menuService } from '../../services/menuService';
import { SpinnerIcon, PlusIcon, TrashIcon, PencilIcon, ClockIcon } from '../../Icons';
import ItemEditModal from '../../ui/ItemEditModal';
import { useDashboard } from '../../DashboardContext';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';

const OffersPage: React.FC = () => {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [categories, setCategories] = useState<Category[]>([]); // Needed for the modal
    const [loading, setLoading] = useState(true);
    
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
    const isNewOffer = !editingOffer;
    
    const [isDeleting, setIsDeleting] = useState(false);
    const [offerToDelete, setOfferToDelete] = useState<Offer | null>(null);

    const { showToast } = useDashboard();

    useEffect(() => {
        setLoading(true);
        const unsubscribe = menuService.subscribe(data => {
            setOffers(data.offers);
            setCategories(data.categories); // Still need categories for the modal
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSaveOffer = async (offerData: Partial<Offer>) => {
        const offerToSave: Partial<Offer> = { ...offerData, categoryKey: 'cat_offers' };
        await menuService.saveOffer(offerToSave);
        showToast({ message: isNewOffer ? 'تمت إضافة العرض بنجاح' : 'تم تحديث العرض بنجاح', type: 'success' });
    };

    const handleRequestDelete = (offer: Offer) => {
        setOfferToDelete(offer);
    };

    const handleConfirmDelete = async () => {
        if (!offerToDelete) return;
        setIsDeleting(true);
        await new Promise(res => setTimeout(res, 400));
        menuService.deleteOffer(offerToDelete.id);
        showToast({ message: `تم حذف عرض "${offerToDelete.name}" بنجاح.`, type: 'success' });
        setOfferToDelete(null);
        setIsDeleting(false);
    };

    const renderTimeLeft = (expiresAt: number | null | undefined) => {
        if (!expiresAt || expiresAt < Date.now()) return null;
        const diffMs = expiresAt - Date.now();
        const diffHours = diffMs / (1000 * 60 * 60);

        let timeLeftString = '';
        if (diffHours < 24) {
            timeLeftString = `ينتهي خلال ${Math.ceil(diffHours)} ساعة`;
        } else {
            timeLeftString = `ينتهي خلال ${Math.ceil(diffHours / 24)} يوم`;
        }

        return (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                <ClockIcon className="w-3 h-3"/>
                <span>{timeLeftString}</span>
            </div>
        );
    };

    if (loading) return <div className="flex h-full items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;

    return (
        <>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                <div>
                     <h1 className="text-3xl font-black font-cairo text-neo-secondary">إدارة العروض</h1>
                     <p className="text-neo-secondary/60 mt-1">إنشاء العروض الخاصة والحزم الترويجية.</p>
                </div>
                 <button onClick={() => { setEditingOffer(null); setIsItemModalOpen(true); }} className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm">
                    <PlusIcon className="w-5 h-5"/> 
                    <span>إضافة عرض جديد</span>
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {offers.map(offer => (
                    <div key={offer.id} className={`group bg-white rounded-xl shadow-sm border p-3 flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${!offer.isActive ? 'border-gray-200' : 'border-neo-soft-gray hover:border-neo-primary'}`}>
                        {/* Image */}
                        <div className="w-full h-36 bg-gray-100 rounded-md mb-3 overflow-hidden relative">
                            <img src={offer.image} alt={offer.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            {!offer.isActive && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <span className="bg-gray-600/80 text-white text-xs font-bold px-3 py-1 rounded-full">غير نشط</span>
                                </div>
                            )}
                            {offer.isActive && renderTimeLeft(offer.expiresAt)}
                        </div>

                        {/* Info & Actions */}
                        <div className="flex-grow flex flex-col">
                            <h3 className="font-bold text-sm text-neo-secondary flex-grow line-clamp-2 h-10">{offer.name}</h3>
                            <div className="flex justify-between items-center mt-2">
                                <p className="font-bold font-montserrat text-lg text-neo-primary">{offer.price} ج.م</p>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <button onClick={() => { setEditingOffer(offer); setIsItemModalOpen(true); }} className="p-2 rounded-md hover:bg-neo-soft-gray text-neo-secondary/70" title="تعديل">
                                        <PencilIcon className="w-4 h-4"/>
                                    </button>
                                    <button onClick={() => handleRequestDelete(offer)} className="p-2 rounded-md hover:bg-neo-error/10 text-neo-error" title="حذف">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            <ItemEditModal 
                item={editingOffer} 
                isOpen={isItemModalOpen} 
                onClose={() => setIsItemModalOpen(false)} 
                onSave={handleSaveOffer} 
                itemType="offer" 
                categories={categories}
                cropperConfig={{
                    aspectRatios: [{ label: '16:9 عرضي', value: 16/9 }],
                    defaultAspectRatio: 16/9
                }}
            />
            
            <DeleteConfirmationModal
                isOpen={!!offerToDelete}
                onClose={() => setOfferToDelete(null)}
                onConfirm={handleConfirmDelete}
                title={`حذف عرض "${offerToDelete?.name}"`}
                message="هل أنت متأكد من حذف هذا العرض نهائياً؟ لا يمكن التراجع عن هذا الإجراء."
                isDeleting={isDeleting}
            />
        </>
    );
};

export default OffersPage;