import React, { useEffect } from 'react';
import { DeliveryMethod } from './posTypes';
import { 
    Truck as TruckIcon, 
    ShoppingBag as ShoppingBagIcon,
} from 'lucide-react';
import { ArrowLeftOnRectangleIcon } from '../dashboard/Icons';
import { useTranslation } from '../../contexts/AppContext';


interface OrderTypeSelectionProps {
    onSelect: (type: DeliveryMethod) => void;
    onBack: () => void;
}

const OrderTypeSelection: React.FC<OrderTypeSelectionProps> = ({ onSelect, onBack }) => {
    const { t, dir } = useTranslation();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (key === '1' || key === 'd' || (dir === 'rtl' && key === 'ت')) {
                onSelect('delivery');
            } else if (key === '2' || key === 'p' || (dir === 'rtl' && key === 'س')) {
                onSelect('pickup');
            } else if (e.key === 'Escape') {
                onBack();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSelect, onBack, dir]);

    return (
        <div className="relative flex flex-col h-full bg-gray-50 animate-fade-in">
            <button 
                onClick={onBack} 
                className={`absolute top-5 left-5 z-50 w-12 h-12 flex items-center justify-center bg-white/50 rounded-full border border-white/30 text-neo-secondary hover:bg-white/70 transition-all duration-300 shadow-lg`}
                aria-label={t('checkout_back_to_cart')}
            >
                <ArrowLeftOnRectangleIcon className="h-6 w-6" />
            </button>
            
            <div className="flex-grow flex flex-col items-center justify-center p-8">
                <h2 className="text-3xl font-extrabold text-gray-800 text-center mb-12 font-cairo">
                    اختر نوع الطلب
                </h2>

                <div className="w-full max-w-md space-y-6">
                    <button 
                        onClick={() => onSelect('delivery')} 
                        className="w-full p-8 bg-white rounded-2xl border border-gray-200/90 hover:border-neo-primary transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1.5 flex flex-row items-center justify-center gap-8"
                    >
                        <TruckIcon className="w-12 h-12 text-orange-500 flex-shrink-0"/>
                        <span className="font-bold text-2xl text-gray-800 font-cairo">طلب توصيل</span>
                    </button>

                    <button 
                        onClick={() => onSelect('pickup')} 
                        className="w-full p-8 bg-white rounded-2xl border border-gray-200/90 hover:border-neo-primary transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1.5 flex flex-row items-center justify-center gap-8"
                    >
                        <ShoppingBagIcon className="w-12 h-12 text-teal-500 flex-shrink-0"/>
                        <span className="font-bold text-2xl text-gray-800 font-cairo">طلب داخلي / صالة</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default OrderTypeSelection;