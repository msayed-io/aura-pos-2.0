

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from '../../contexts/AppContext';
import { useDashboard } from '../dashboard/DashboardContext';
import { CartItem, PaymentMethod } from './posTypes';
import { 
    BanknotesIcon,
    SpinnerIcon,
    ArrowLeftOnRectangleIcon,
    ShoppingCartIcon
} from '../dashboard/Icons';
import { couponService } from '../dashboard/services/couponService';
import { Coupon } from '../../types';
import { usePaymentLogos } from '../../contexts/PaymentLogosContext';

interface DineInCheckoutProps {
    items: CartItem[];
    onPlaceOrder: (details: any) => Promise<void>;
    onBack: () => void;
}

const VodafoneCashIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className || "w-6 h-6"}>
        <circle cx="12" cy="12" r="12" fill="#E60000"/>
        <path d="M7.70183 12.0001C7.70183 9.42211 9.60537 7.33337 12.0001 7.33337C13.2541 7.33337 14.4379 7.89241 15.2891 8.8159L14.3056 9.81368C13.6231 9.01168 12.7533 8.5278 12.0001 8.5278C10.3687 8.5278 9.07183 9.98822 9.07183 12.0001C9.07183 14.0119 10.3687 15.4723 12.0001 15.4723C12.7533 15.4723 13.6231 14.9884 14.3056 14.1864L15.2891 15.1842C14.4379 16.1077 13.2541 16.6667 12.0001 16.6667C9.60537 16.6667 7.70183 14.5779 7.70183 12.0001Z" fill="white"/>
    </svg>
);

const InstaPayOfficialIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className || "w-6 h-6"}>
        <circle cx="12" cy="12" r="12" fill="#5F259F"/>
        <path d="M13.2842 4.43359L7.00287 13.4328H12.2851L11.001 20.4336L17.2824 11.4344H12.0001L13.2842 4.43359Z" fill="#F58220"/>
    </svg>
);


const DineInCheckout: React.FC<DineInCheckoutProps> = ({ items, onPlaceOrder, onBack }) => {
    const { t, dir } = useTranslation();
    const { showToast } = useDashboard();
    const { vodafoneCash, instapay } = usePaymentLogos();

    // Order Options
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

    // Discount State
    const [discountType, setDiscountType] = useState<'coupon' | 'manual'>('manual');
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
    const [manualDiscountValue, setManualDiscountValue] = useState('');
    const [manualDiscountType, setManualDiscountType] = useState<'fixed' | 'percentage'>('fixed');

    // Control State
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);

    const handleApplyCoupon = useCallback(async () => {
        const code = couponCode.trim().toUpperCase();
        if (!code) return;

        const result = await couponService.validateAndApplyCoupon(code);
        if (result.success && result.coupon) {
            setAppliedCoupon(result.coupon);
            setManualDiscountValue('');
            showToast({ message: t('toast_coupon_applied'), type: 'success' });
        } else {
            setAppliedCoupon(null);
            showToast({ message: result.message || t('toast_coupon_invalid'), type: 'error' });
        }
    }, [couponCode, showToast, t]);

    const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

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
    
    const total = useMemo(() => subtotal - discountAmount, [subtotal, discountAmount]);

    const handleConfirmOrder = async () => {
        setIsPlacingOrder(true);
        try {
            await onPlaceOrder({
                name: 'عميل صالة',
                phone: '-',
                address: 'استلام من الفرع',
                paymentMethod,
                deliveryMethod: 'pickup',
                subtotal,
                deliveryFee: 0,
                discount: discountAmount,
                couponCode: appliedCoupon?.code || '',
                total
            });
        } catch (error) {
            showToast({ message: 'حدث خطأ أثناء إرسال الطلب', type: 'error' });
        } finally {
            setIsPlacingOrder(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !isPlacingOrder) {
                e.preventDefault();
                handleConfirmOrder();
            }
            if (e.key === 'Escape') {
                onBack();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlacingOrder, handleConfirmOrder, onBack]);

    const paymentOptions: { id: PaymentMethod; labelKey: string; icon: React.FC<{className?: string}> }[] = [
        { id: 'cash', labelKey: 'checkout_payment_cash', icon: ({className}) => <BanknotesIcon className={className} /> },
        { id: 'vodafone', labelKey: 'checkout_payment_vodafone', icon: ({className}) => vodafoneCash ? <img src={vodafoneCash} alt="VF Cash" className={className} /> : <VodafoneCashIcon className={className} /> },
        { id: 'instapay', labelKey: 'checkout_payment_instapay', icon: ({className}) => instapay ? <img src={instapay} alt="Instapay" className={className} /> : <InstaPayOfficialIcon className={className} /> },
    ];
    
     const confirmOrderButton = (
         <button
            onClick={handleConfirmOrder}
            disabled={isPlacingOrder}
            className="w-full bg-neo-primary text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 shadow-lg shadow-neo-primary/40 hover:shadow-xl hover:shadow-neo-primary/50 hover:bg-neo-accent text-lg flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
        >
            {isPlacingOrder ? (
            <>
                <SpinnerIcon className="h-6 w-6 animate-spin" />
                <span className={`${dir === 'rtl' ? 'mr-3' : 'ml-3'}`}>{t('checkout_placing_order')}...</span>
            </>
            ) : (
                t('checkout_confirm_order')
            )}
        </button>
    );

    return (
        <div className="bg-gray-100 h-full flex flex-col relative">
            <button 
                onClick={onBack} 
                className={`absolute top-5 left-5 z-50 w-12 h-12 flex items-center justify-center bg-white/50 rounded-full border border-white/30 text-neo-secondary hover:bg-white/70 transition-all duration-300 shadow-lg`}
                aria-label={t('checkout_back_to_cart')}
            >
                <ArrowLeftOnRectangleIcon className="h-6 w-6" />
            </button>
            <div className="flex-grow overflow-y-auto p-4 sm:p-6 lg:p-8 animate-fade-in flex flex-col">
                <div className="pt-16 pb-8 text-center flex-shrink-0">
                    <h1 className="text-3xl md:text-4xl font-black font-cairo text-neo-secondary">{t('dine_in_checkout_title')}</h1>
                </div>
                <div className="flex-grow flex items-center justify-center">
                    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 w-full py-4">
                        {/* Left Column: Payment Options */}
                        <div className="bg-white/80 backdrop-blur-lg border border-gray-200/50 rounded-2xl shadow-lg p-4 sm:p-6 h-fit">
                            <div className="flex items-center gap-3 mb-4">
                                <BanknotesIcon className="h-7 w-7 text-neo-secondary" />
                                <h2 className="text-xl font-bold font-cairo text-neo-secondary">{t('checkout_payment_method')}</h2>
                            </div>
                            <div className="space-y-3">
                                {paymentOptions.map(option => (
                                    <label key={option.id} className={`flex items-center gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer text-neo-secondary ${paymentMethod === option.id ? 'border-neo-primary bg-neo-primary/10' : 'border-gray-300 hover:border-gray-400 bg-white'}`}>
                                      <input type="radio" name="paymentMethod" value={option.id} checked={paymentMethod === option.id} onChange={() => setPaymentMethod(option.id)} className="form-radio text-neo-primary focus:ring-neo-primary bg-gray-100 border-gray-300" />
                                      <option.icon className="w-8 h-8 flex-shrink-0" />
                                      <span className="font-bold">{t(option.labelKey)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        
                        {/* Right Column: Order Summary */}
                        <div className="h-fit">
                            <div className="bg-white/80 backdrop-blur-lg border border-gray-200/50 rounded-2xl shadow-lg p-4 sm:p-6">
                                <div className="flex items-center gap-3 mb-4 border-b border-gray-900/10 pb-4">
                                    <ShoppingCartIcon className="h-7 w-7 text-neo-secondary" />
                                    <h2 className="text-xl font-bold font-cairo text-neo-secondary">{t('checkout_summary_title')}</h2>
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                                    {items.map((item, index) => (
                                        <div key={item.id} className={`flex items-center gap-3 py-2 ${index < items.length - 1 ? 'border-b border-gray-200' : ''}`}>
                                            <div className="flex-grow">
                                                <h4 className="font-bold text-sm text-neo-secondary">{item.quantity}x {item.name}</h4>
                                            </div>
                                            <p className="font-bold font-montserrat text-sm text-neo-secondary">{Number(item.price * item.quantity)}</p>
                                        </div>
                                    ))}
                                </div>

                               {/* New Discount Section */}
                                <div className="pt-4 border-t border-gray-900/10 mt-4">
                                    <label className="block text-sm font-bold mb-2 text-neo-secondary">{t('checkout_discount_type')}</label>
                                    <div className="flex gap-2 bg-gray-200/70 p-1 rounded-lg">
                                        <button onClick={() => setDiscountType('coupon')} className={`flex-1 py-1.5 rounded-md font-semibold text-sm transition-all ${discountType === 'coupon' ? 'bg-neo-primary text-white shadow' : 'text-gray-600'}`}>{t('checkout_discount_coupon')}</button>
                                        <button onClick={() => setDiscountType('manual')} className={`flex-1 py-1.5 rounded-md font-semibold text-sm transition-all ${discountType === 'manual' ? 'bg-neo-primary text-white shadow' : 'text-gray-600'}`}>{t('checkout_discount_manual')}</button>
                                    </div>
                                    {discountType === 'coupon' ? (
                                        <div className="flex gap-2 mt-3">
                                            <input id="coupon-code" type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder={t('checkout_coupon_placeholder')} className="w-full px-4 py-2 bg-gray-50 border border-gray-300 text-neo-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-neo-primary transition uppercase"/>
                                            <button onClick={handleApplyCoupon} className="px-5 py-2 bg-neo-secondary text-white font-bold rounded-lg hover:bg-gray-900 transition-colors flex-shrink-0">{t('checkout_apply_coupon')}</button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2 mt-3">
                                            <input type="number" value={manualDiscountValue} onChange={e => setManualDiscountValue(e.target.value)} placeholder={t('checkout_manual_discount_placeholder')} className="w-full px-4 py-2 bg-gray-50 border border-gray-300 text-neo-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-neo-primary transition"/>
                                            <div className="flex bg-gray-200/70 p-1 rounded-lg">
                                                <button onClick={() => setManualDiscountType('fixed')} className={`px-3 py-1.5 rounded-md font-semibold text-sm transition-all ${manualDiscountType === 'fixed' ? 'bg-white text-neo-primary shadow' : 'text-gray-600'}`}>{t('checkout_discount_type_fixed')}</button>
                                                <button onClick={() => setManualDiscountType('percentage')} className={`px-3 py-1.5 rounded-md font-semibold text-sm transition-all ${manualDiscountType === 'percentage' ? 'bg-white text-neo-primary shadow' : 'text-gray-600'}`}>{t('checkout_discount_type_percentage')}</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-gray-900/10 mt-4 space-y-2">
                                    <div className="flex justify-between text-gray-700"><span>{t('checkout_subtotal')}</span><span className="font-mono font-semibold">{subtotal.toFixed(2)}</span></div>
                                    {discountAmount > 0 && <div className="flex justify-between text-green-600 font-bold"><span>{t('checkout_discount')}</span><span className="font-mono">- {discountAmount.toFixed(2)}</span></div>}
                                    <div className="flex justify-between items-center font-bold text-2xl pt-4 border-t border-gray-900/10 mt-2 text-neo-secondary">
                                      <span>{t('checkout_total')}</span>
                                      <span className="font-montserrat text-neo-primary">{total.toFixed(2)} {t('egp')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex-shrink-0 p-6 bg-white border-t-2 border-gray-200 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] rounded-2xl">
                 <div className="flex justify-between items-center font-bold text-2xl mb-4 text-neo-secondary">
                  <span>{t('checkout_total')}</span>
                  <span className="font-montserrat text-neo-primary">{total.toFixed(2)} {t('egp')}</span>
                </div>
                {confirmOrderButton}
            </div>
        </div>
    );
};

export default DineInCheckout;