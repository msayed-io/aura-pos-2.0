import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Order, OrderItem, CustomerInfo, OrderSummary } from '../dashboardTypes';
import type { MenuItem, Category, Coupon } from '../../../types';
import { menuService } from '../services/menuService';
import { dashboardOrderService } from '../services/dashboardOrderService';
import { couponService } from '../services/couponService';
import { useDashboard } from '../DashboardContext';
import {
    XIcon, SpinnerIcon, SaveIcon, UserIcon, TrashIcon, SearchIcon,
    LayoutGridIcon, FireIcon, HamburgerIcon, SandwichIcon, CookingPotIcon, GlassWaterIcon, TicketIcon, StarIcon,
    ShoppingCartIcon
} from '../Icons';

// Use a more descriptive type for items being edited
interface EditableOrderItem extends OrderItem {
    image?: string; // Add image for display
}

// Helper to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2 }).format(amount);
};

interface OrderEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order | null;
    onOrderUpdated: () => void;
}

const OrderEditModal: React.FC<OrderEditModalProps> = ({ isOpen, onClose, order, onOrderUpdated }) => {
    const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: '', phone: '', address: '' });
    const [editableItems, setEditableItems] = useState<EditableOrderItem[]>([]);
    
    // Menu state
    const [menu, setMenu] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Discount state
    const [discountType, setDiscountType] = useState<'coupon' | 'manual'>('manual');
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
    const [manualDiscountValue, setManualDiscountValue] = useState('');
    const [manualDiscountType, setManualDiscountType] = useState<'fixed' | 'percentage'>('fixed');

    // Control state
    const [isSaving, setIsSaving] = useState(false);
    const { showToast, playSound } = useDashboard();
    
    // Populate state when modal opens or order changes
    useEffect(() => {
        if (isOpen && order) {
            setCustomerInfo(order.customer);
            // Enrich items with image from menu
            const itemsWithImages = order.items.map(item => {
                const menuItem = menu.find(mi => mi.name === item.name);
                return { ...item, image: menuItem?.image || 'https://i.ibb.co/p3rC9Y0/placeholder-image.png' };
            });
            setEditableItems(itemsWithImages);

            // Reset discount state
            setDiscountType('manual');
            setCouponCode(order.couponCode || '');
            setAppliedCoupon(null);
            setManualDiscountValue((order.summary?.discount || 0) > 0 ? String(order.summary?.discount) : '');
            setManualDiscountType('fixed');
        }
    }, [isOpen, order, menu]);
    
    // Fetch menu data
    useEffect(() => {
        const unsubscribe = menuService.subscribe(data => {
            const activeItems = data.menuItems.filter(item => item.isActive);
            const posCategories = [
                { id: 'all', name: 'الكل', order: -1 },
                ...data.categories
            ];
            setMenu(activeItems);
            setCategories(posCategories);
        });
        return () => unsubscribe();
    }, []);

    const filteredMenuItems = useMemo(() => {
        let items = menu;
        if (selectedCategory !== 'all') {
            items = items.filter(item => item.categoryKey === selectedCategory);
        }
        if (searchTerm) {
            items = items.filter(item => (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return items;
    }, [menu, selectedCategory, searchTerm]);

    // --- Calculation Memos ---
    const subtotal = useMemo(() => editableItems.reduce((acc, item) => acc + (item.price * item.quantity), 0), [editableItems]);

    const discountAmount = useMemo(() => {
        if (discountType === 'manual') {
            const value = parseFloat(manualDiscountValue);
            if (isNaN(value) || value < 0) return 0;
            if (manualDiscountType === 'fixed') return value;
            if (manualDiscountType === 'percentage') return subtotal * (value / 100);
        }
        if (discountType === 'coupon' && appliedCoupon) {
            if (appliedCoupon.discountType === 'percentage') {
                return subtotal * (appliedCoupon.discountValue / 100);
            }
            if (appliedCoupon.discountType === 'fixed') {
                return appliedCoupon.discountValue;
            }
        }
        return 0;
    }, [subtotal, appliedCoupon, discountType, manualDiscountValue, manualDiscountType]);

    const total = useMemo(() => (subtotal + (order?.summary?.deliveryFee || 0)) - discountAmount, [subtotal, order, discountAmount]);

    // --- Handlers ---
    const handleApplyCoupon = useCallback(async () => {
        const code = couponCode.trim().toUpperCase();
        if (!code) return;
        const result = await couponService.validateAndApplyCoupon(code);
        if (result.success && result.coupon) {
            setAppliedCoupon(result.coupon);
            setManualDiscountValue('');
            showToast({ message: 'تم تطبيق الكوبون!', type: 'success' });
        } else {
            setAppliedCoupon(null);
            showToast({ message: result.message || 'كود الخصم غير صالح.', type: 'error' });
        }
    }, [couponCode, showToast]);
    
    const handleCustomerInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomerInfo(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleAddItem = (item: MenuItem) => {
        setEditableItems(prev => {
            const existing = prev.find(i => i.name === item.name);
            if (existing) {
                return prev.map(i => i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { ...item, quantity: 1, notes: '' }];
        });
    };

    const handleUpdateQuantity = (itemName: string, change: number) => {
        setEditableItems(prev => {
            const item = prev.find(i => i.name === itemName);
            if (item && item.quantity + change < 1) {
                return prev.filter(i => i.name !== itemName);
            }
            return prev.map(i => i.name === itemName ? { ...i, quantity: i.quantity + change } : i);
        });
    };
    
    const handleRemoveItem = (itemName: string) => {
        setEditableItems(prev => prev.filter(i => i.name !== itemName));
    };

    const handleSaveChanges = async () => {
        if (!order) return;
        if (!customerInfo.name || !customerInfo.phone) {
            showToast({ message: 'يجب إدخال اسم ورقم هاتف العميل.', type: 'error' });
            return;
        }
        if (editableItems.length === 0) {
            showToast({ message: 'لا يمكن حفظ طلب فارغ.', type: 'error' });
            return;
        }

        setIsSaving(true);
        try {
            const updatedItems = editableItems.map(({ image, ...rest }) => rest);
            const updatedSummary: OrderSummary = {
                subtotal: subtotal,
                deliveryFee: order.summary?.deliveryFee || 0,
                discount: discountAmount,
                total: total,
            };
            await dashboardOrderService.updateOrder(order.id, { 
                customer: customerInfo, 
                items: updatedItems, 
                summary: updatedSummary,
                couponCode: appliedCoupon?.code
            });
            
            showToast({ message: `تم تحديث الطلب #${order.displayId} بنجاح.`, type: 'success', playSound: true });
            onOrderUpdated();
        } catch (error) {
            console.error("Update order failed:", error);
            showToast({ message: 'فشل تحديث الطلب. حاول مرة أخرى.', type: 'error', playSound: true });
        } finally {
            setIsSaving(false);
        }
    };
    
    const categoryIcons: { [key: string]: React.ReactNode } = {
        all: <LayoutGridIcon className="w-5 h-5"/>,
        cat_broast: <FireIcon className="w-5 h-5"/>,
        cat_burger: <HamburgerIcon className="w-5 h-5"/>,
        cat_sandwich: <SandwichIcon className="w-5 h-5"/>,
        cat_sides: <CookingPotIcon className="w-5 h-5"/>,
        cat_drinks: <GlassWaterIcon className="w-5 h-5"/>,
        cat_offers: <TicketIcon className="w-5 h-5"/>,
    };
    
    if (!isOpen || !order) return null;
    const portalRoot = document.getElementById('modal-root');
    if (!portalRoot) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
            <div 
                className="bg-neo-bg rounded-2xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col animate-scale-in"
                onClick={e => e.stopPropagation()}
                dir="rtl"
            >
                <header className="flex-shrink-0 bg-white p-4 border-b border-gray-200 flex justify-between items-center rounded-2xl">
                    <h2 className="text-xl font-extrabold text-neo-secondary">تعديل الطلب <span className="font-mono text-neo-primary">#{order.displayId}</span></h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
                </header>

                <div className="flex-grow flex flex-row min-h-0">
                    {/* Menu Browser (Right Side) */}
                    <aside className="w-3/5 bg-gray-50 border-l border-gray-200 flex flex-col">
                        <nav className="flex-shrink-0 bg-white border-b border-gray-200 px-4 rounded-2xl">
                            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2">
                                {categories.sort((a,b) => a.order - b.order).map(cat => (
                                    <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-full transition-colors whitespace-nowrap ${selectedCategory === cat.id ? 'bg-neo-primary text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                        {categoryIcons[cat.id] || <div className="w-5 h-5" />}
                                        <span>{cat.name}</span>
                                    </button>
                                ))}
                            </div>
                        </nav>
                        <div className="p-4 flex-shrink-0 bg-white border-b border-gray-200 rounded-2xl">
                             <div className="relative">
                                <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input 
                                    type="search" 
                                    placeholder="ابحث عن صنف لإضافته..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full h-11 pr-10 pl-4 rounded-lg bg-gray-100 border border-gray-300 outline-none focus:ring-2 focus:ring-neo-primary"
                                />
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {filteredMenuItems.map(item => (
                                    <div key={item.id} onClick={() => handleAddItem(item)} className="group bg-white rounded-xl shadow-sm border p-3 flex flex-col transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 cursor-pointer hover:border-neo-primary">
                                        <div className="w-full h-24 bg-gray-100 rounded-lg mb-2 overflow-hidden">
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        </div>
                                        <h3 className="font-bold text-xs text-gray-800 flex-grow line-clamp-2 h-8">{item.name}</h3>
                                        <p className="font-bold font-mono text-sm text-neo-primary mt-1">{item.price} ج.م</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* Order Editor (Left Side) */}
                    <main className="w-2/5 flex flex-col bg-white rounded-2xl">
                        <div className="flex-grow p-4 space-y-4 overflow-y-auto custom-scrollbar">
                           <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                               <h3 className="font-bold text-neo-secondary mb-3 flex items-center gap-2 text-base"><UserIcon size={18}/> بيانات العميل</h3>
                               <div className="space-y-3">
                                   <input name="name" value={customerInfo.name} onChange={handleCustomerInfoChange} placeholder="الاسم" className="w-full px-4 py-3 bg-white border border-gray-300 text-neo-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-neo-primary transition" />
                                   <input name="phone" value={customerInfo.phone} onChange={handleCustomerInfoChange} placeholder="رقم الهاتف" className="w-full px-4 py-3 bg-white border border-gray-300 text-neo-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-neo-primary transition" />
                                   <input name="address" value={customerInfo.address} onChange={handleCustomerInfoChange} placeholder="العنوان" className="w-full px-4 py-3 bg-white border border-gray-300 text-neo-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-neo-primary transition" />
                               </div>
                           </div>
                           
                           <div className="bg-white/80 backdrop-blur-lg border border-gray-200/50 rounded-xl shadow-sm p-4 flex-grow flex flex-col">
                                <div className="flex items-center gap-3 mb-4 border-b border-gray-900/10 pb-4">
                                    <ShoppingCartIcon className="h-6 w-6 text-neo-secondary" />
                                    <h2 className="text-lg font-bold font-cairo text-neo-secondary">ملخص الطلب</h2>
                                </div>
                                
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1 mb-4 border-b border-gray-200 pb-2">
                                    {editableItems.length > 0 ? editableItems.map(item => (
                                        <div key={item.name} className="flex items-center gap-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleUpdateQuantity(item.name, -1)} className="w-6 h-6 bg-gray-200 rounded-full font-bold transition hover:bg-gray-300 flex items-center justify-center">-</button>
                                                <span className="font-bold text-base w-5 text-center">{item.quantity}</span>
                                                <button onClick={() => handleUpdateQuantity(item.name, 1)} className="w-6 h-6 bg-gray-200 rounded-full font-bold transition hover:bg-gray-300 flex items-center justify-center">+</button>
                                            </div>
                                            <p className="font-bold text-gray-800 text-sm flex-grow">{item.name}</p>
                                            <span className="font-mono font-bold text-sm text-neo-secondary">{(item.price * item.quantity).toFixed(2)}</span>
                                            <button onClick={() => handleRemoveItem(item.name)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon size={16}/></button>
                                        </div>
                                    )) : (
                                        <p className="text-center text-sm text-gray-500 py-4">أضف أصنافاً من القائمة</p>
                                    )}
                                </div>

                                <div className="pt-2">
                                    <label className="block text-sm font-bold mb-2 text-neo-secondary">نوع الخصم</label>
                                    <div className="flex gap-2 bg-gray-200/70 p-1 rounded-lg">
                                        <button onClick={() => setDiscountType('coupon')} className={`flex-1 py-1.5 rounded-md font-semibold text-sm transition-all ${discountType === 'coupon' ? 'bg-neo-primary text-white shadow' : 'text-gray-600'}`}>كوبون</button>
                                        <button onClick={() => setDiscountType('manual')} className={`flex-1 py-1.5 rounded-md font-semibold text-sm transition-all ${discountType === 'manual' ? 'bg-neo-primary text-white shadow' : 'text-gray-600'}`}>يدوي</button>
                                    </div>
                                    {discountType === 'coupon' ? (
                                        <div className="flex gap-2 mt-3">
                                            <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="ادخل الكود هنا" className="w-full px-4 py-2 bg-gray-50 border border-gray-300 text-neo-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-neo-primary transition uppercase"/>
                                            <button onClick={handleApplyCoupon} className="px-5 py-2 bg-neo-secondary text-white font-bold rounded-lg hover:bg-gray-900 transition-colors flex-shrink-0">تطبيق</button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2 mt-3">
                                            <input type="number" value={manualDiscountValue} onChange={e => setManualDiscountValue(e.target.value)} placeholder="أدخل القيمة" className="w-full px-4 py-2 bg-gray-50 border border-gray-300 text-neo-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-neo-primary transition"/>
                                            <div className="flex bg-gray-200/70 p-1 rounded-lg">
                                                <button onClick={() => setManualDiscountType('fixed')} className={`px-3 py-1.5 rounded-md font-semibold text-sm transition-all ${manualDiscountType === 'fixed' ? 'bg-white text-neo-primary shadow' : 'text-gray-600'}`}>ج.م</button>
                                                <button onClick={() => setManualDiscountType('percentage')} className={`px-3 py-1.5 rounded-md font-semibold text-sm transition-all ${manualDiscountType === 'percentage' ? 'bg-white text-neo-primary shadow' : 'text-gray-600'}`}>%</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-gray-900/10 mt-4 space-y-2">
                                    <div className="flex justify-between text-gray-700"><span>المجموع الفرعي</span><span className="font-mono font-semibold">{formatCurrency(subtotal)}</span></div>
                                    <div className="flex justify-between text-gray-700"><span>التوصيل</span><span className="font-mono font-semibold">{formatCurrency(order.summary?.deliveryFee || 0)}</span></div>
                                    {discountAmount > 0 && <div className="flex justify-between text-green-600 font-bold"><span>الخصم</span><span className="font-mono">-{formatCurrency(discountAmount)}</span></div>}
                                </div>
                            </div>
                        </div>
                        <footer className="flex-shrink-0 p-4 border-t-2 border-gray-200 space-y-3">
                            <div className="flex justify-between text-2xl font-bold border-t border-gray-300 pt-3 mt-2">
                                <span>الإجمالي</span>
                                <span className="font-mono text-neo-primary">{formatCurrency(total)}</span>
                            </div>
                            <div className="flex gap-3 mt-3">
                                <button onClick={onClose} className="w-1/3 py-3 bg-gray-200 text-neo-secondary font-bold rounded-xl hover:bg-gray-300">إلغاء</button>
                                <button onClick={handleSaveChanges} disabled={isSaving} className="w-2/3 py-3 bg-neo-primary text-white font-bold rounded-xl hover:bg-neo-accent flex items-center justify-center gap-2 disabled:opacity-60">
                                    {isSaving ? <SpinnerIcon className="animate-spin w-5 h-5"/> : <SaveIcon size={20}/>}
                                    {isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                                </button>
                            </div>
                        </footer>
                    </main>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

export default OrderEditModal;