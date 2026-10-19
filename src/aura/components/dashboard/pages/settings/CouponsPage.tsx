import React, { useState, useEffect } from 'react';
import { Coupon } from '../../../../types';
import { couponService } from '../../services/couponService';
import { useDashboard } from '../../DashboardContext';
import { SpinnerIcon, PlusIcon, PencilIcon, TrashIcon, TicketIcon, InfinityIcon } from '../../Icons';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';
import CouponEditModal from '../../ui/CouponEditModal';

const CouponStatusBadge: React.FC<{ coupon: Coupon }> = ({ coupon }) => {
    let status: { text: string; color: string };

    if (!coupon.isActive) {
        status = { text: 'غير نشط', color: 'gray' };
    } else if (coupon.expiresAt && coupon.expiresAt < Date.now()) {
        status = { text: 'منتهي الصلاحية', color: 'red' };
    } else if (coupon.usageLimit !== Infinity && coupon.usageCount >= coupon.usageLimit) {
        status = { text: 'مكتمل الاستخدام', color: 'orange' };
    } else {
        status = { text: 'نشط', color: 'green' };
    }

    const colorClasses = {
        gray: 'bg-gray-400',
        red: 'bg-neo-error',
        orange: 'bg-neo-warning',
        green: 'bg-neo-success',
    };

    return (
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${colorClasses[status.color as keyof typeof colorClasses]}`}></div>
            <span className="font-semibold text-xs text-neo-secondary">{status.text}</span>
        </div>
    );
};


const CouponCard: React.FC<{
    coupon: Coupon;
    onEdit: (c: Coupon) => void;
    onDelete: (c: Coupon) => void;
}> = ({ coupon, onEdit, onDelete }) => {
    
    const isPermanent = coupon.expiresAt === null && coupon.usageLimit === Infinity;
    const isUsageLimited = coupon.usageLimit !== Infinity;
    
    const progress = isUsageLimited ? Math.min((coupon.usageCount / coupon.usageLimit) * 100, 100) : 100;

    return (
        <div className="group bg-white rounded-2xl border border-gray-200/80 shadow-lg shadow-gray-500/5 hover:shadow-xl hover:shadow-gray-500/10 transition-all duration-300 relative flex flex-col">
            <div className="p-5 flex-grow">
                <div className="flex justify-between items-start">
                    <span className="font-mono font-extrabold text-2xl text-neo-secondary tracking-widest bg-gray-100 px-3 py-1 rounded-lg border border-gray-200">{coupon.code}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEdit(coupon)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-neo-secondary/70" title="تعديل"><PencilIcon className="w-4 h-4"/></button>
                        <button onClick={() => onDelete(coupon)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-100 text-red-500" title="حذف"><TrashIcon className="w-4 h-4"/></button>
                    </div>
                </div>

                <div className="mt-4">
                    <p className="font-bold text-lg text-neo-primary">
                        {coupon.discountType === 'percentage' ? `خصم ${coupon.discountValue}%` : `خصم ${coupon.discountValue} ج.م`}
                    </p>
                </div>

                <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-neo-secondary/60">الحالة</span>
                        <CouponStatusBadge coupon={coupon} />
                    </div>
                    { !isPermanent && (
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-neo-secondary/60">
                                {isUsageLimited ? 'الاستخدام' : 'الصلاحية'}
                            </span>
                             {isUsageLimited ? (
                                <span className="text-sm font-semibold text-neo-secondary/70 font-mono">
                                    {coupon.usageCount} / {coupon.usageLimit}
                                </span>
                            ) : (
                                <span className="text-sm text-neo-secondary/80">
                                    {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString('ar-EG', { day: '2-digit', month: 'long'}) : 'N/A'}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
             {isUsageLimited && (
                <div className="px-5 pb-5">
                    <div className="w-full bg-neo-bg rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-neo-primary" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            )}
        </div>
    );
};


const CouponsPage: React.FC = () => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useDashboard();

    // Modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
    
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [couponToDelete, setCouponToDelete] = useState<Coupon | null>(null);

    useEffect(() => {
        setLoading(true);
        const unsubscribe = couponService.subscribe(data => {
            setCoupons(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleOpenAddModal = () => {
        setEditingCoupon(null);
        setIsEditModalOpen(true);
    };

    const handleOpenEditModal = (coupon: Coupon) => {
        setEditingCoupon(coupon);
        setIsEditModalOpen(true);
    };

    const handleSaveCoupon = async (couponData: Partial<Coupon>) => {
        try {
            await couponService.saveCoupon(couponData);
            showToast({ message: editingCoupon ? 'تم تحديث الكوبون بنجاح' : 'تم إضافة الكوبون بنجاح', type: 'success' });
            setIsEditModalOpen(false);
        } catch (error) {
            showToast({ message: 'فشل حفظ الكوبون', type: 'error' });
        }
    };
    
    const handleConfirmDelete = async () => {
        if (!couponToDelete) return;
        try {
            await couponService.deleteCoupon(couponToDelete.id);
            showToast({ message: `تم حذف الكوبون "${couponToDelete.code}"`, type: 'success' });
            setIsDeleteModalOpen(false);
        } catch (error) {
            showToast({ message: 'فشل حذف الكوبون', type: 'error' });
        }
    };
    
    if (loading) {
        return <div className="flex h-full items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;
    }

    return (
        <>
            <div className="flex flex-col h-full">
                <header className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black font-cairo text-neo-secondary">إدارة الكوبونات</h1>
                        <p className="text-neo-secondary/60 mt-1">إنشاء وتعديل كوبونات الخصم. (لعرض تحليلات الاستخدام، انتقل إلى X-Command)</p>
                    </div>
                    <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-4 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm">
                        <PlusIcon className="w-5 h-5"/>
                        <span>إضافة كوبون جديد</span>
                    </button>
                </header>

                {coupons.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center text-neo-secondary/50 p-8 bg-white rounded-xl border border-neo-soft-gray shadow-sm">
                         <TicketIcon className="w-16 h-16 mb-4" />
                         <p className="text-xl font-bold">لا توجد كوبونات بعد</p>
                         <p className="text-sm mt-1">انقر على "إضافة كوبون جديد" لبدء إنشاء أول كوبون لك.</p>
                     </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {coupons.map(coupon => (
                            <CouponCard 
                                key={coupon.id}
                                coupon={coupon}
                                onEdit={handleOpenEditModal}
                                onDelete={(c) => { setCouponToDelete(c); setIsDeleteModalOpen(true); }}
                            />
                        ))}
                    </div>
                )}
            </div>

            <CouponEditModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSave={handleSaveCoupon}
                coupon={editingCoupon}
            />

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title={`حذف الكوبون "${couponToDelete?.code}"`}
                message="هل أنت متأكد من حذف هذا الكوبون نهائياً؟ لا يمكن التراجع عن هذا الإجراء."
                isDeleting={false}
            />
        </>
    );
};

export default CouponsPage;
