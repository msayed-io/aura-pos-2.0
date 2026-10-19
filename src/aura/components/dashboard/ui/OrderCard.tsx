
import React from 'react';
import type { Order } from '../dashboardTypes';
import { PhoneIcon, BanknotesIcon, TruckIcon, ShoppingCartIcon, ClockIcon, PencilIcon } from '../Icons';
import { usePaymentLogos } from '../../../contexts/PaymentLogosContext';

interface OrderCardProps {
    order: Order;
    isNew: boolean;
    onViewDetails: () => void;
}

// --- Custom Payment Method Icons (FALLBACKS) ---
const VodafoneCashIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className || "w-5 h-5"}>
        <circle cx="12" cy="12" r="12" fill="#E60000"/>
        <path d="M7.70183 12.0001C7.70183 9.42211 9.60537 7.33337 12.0001 7.33337C13.2541 7.33337 14.4379 7.89241 15.2891 8.8159L14.3056 9.81368C13.6231 9.01168 12.7533 8.5278 12.0001 8.5278C10.3687 8.5278 9.07183 9.98822 9.07183 12.0001C9.07183 14.0119 10.3687 15.4723 12.0001 15.4723C12.7533 15.4723 13.6231 14.9884 14.3056 14.1864L15.2891 15.1842C14.4379 16.1077 13.2541 16.6667 12.0001 16.6667C9.60537 16.6667 7.70183 14.5779 7.70183 12.0001Z" fill="white"/>
    </svg>
);

const InstaPayOfficialIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className || "w-5 h-5"}>
        <circle cx="12" cy="12" r="12" fill="#5F259F"/>
        <path d="M13.2842 4.43359L7.00287 13.4328H12.2851L11.001 20.4336L17.2824 11.4344H12.0001L13.2842 4.43359Z" fill="#F58220"/>
    </svg>
);


const OrderCard: React.FC<OrderCardProps> = ({ order, isNew, onViewDetails }) => {
    const { vodafoneCash, instapay } = usePaymentLogos();

    const formatTime = (date: number) => {
        return new Date(date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    // --- RENDER LOGIC MAPPING ---
    const deliveryInfo = order.deliveryMethod === 'delivery' 
        ? { icon: <TruckIcon className="w-5 h-5 text-orange-600"/>, text: 'توصيل' }
        : { icon: <ShoppingCartIcon className="w-5 h-5 text-teal-600"/>, text: 'استلام' };

    const paymentInfo = {
        'cash': { icon: <BanknotesIcon className="w-5 h-5 text-green-600"/>, text: 'كاش' },
        'vodafone': { 
            icon: vodafoneCash ? <img src={vodafoneCash} alt="VF Cash" className="w-5 h-5"/> : <VodafoneCashIcon />, 
            text: 'فودافون كاش' 
        },
        'instapay': { 
            icon: instapay ? <img src={instapay} alt="Instapay" className="w-5 h-5"/> : <InstaPayOfficialIcon />, 
            text: 'انستا باي' 
        },
    }[order.paymentMethod] || { icon: <BanknotesIcon className="w-5 h-5 text-green-600"/>, text: 'كاش' };


    return (
        <div 
            onClick={onViewDetails}
            className={`
                group premium-card p-0 overflow-hidden flex flex-col cursor-pointer border-2
                ${isNew ? 'border-amber-400 animate-new-order-glow shadow-amber-400/20' : 'border-transparent'}
                relative transition-all duration-300
            `}
        >
              {/* Card Header (FIXED LAYOUT) */}
              <div className="p-4 flex justify-between items-center border-b border-gray-100">
                <div className="flex-grow min-w-0">
                  <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-neo-primary transition-colors">
                    {order.customer?.name || 'عميل غير معروف'}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-400 font-medium mt-1">
                      <ClockIcon className="w-3.5 h-3.5" />
                      <span>{formatTime(order.createdAt)}</span>
                      {order.isEdited && (
                        <span title="تم تعديل هذا الطلب" className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-md">
                            <PencilIcon className="w-3 h-3"/>
                            مُعدّل
                        </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 mr-3">
                  <div className="bg-neo-primary text-white font-mono text-lg font-black px-3 py-0.5 rounded-full shadow-md shadow-neo-primary/30 tracking-wider">
                    {order.displayId}
                  </div>
                </div>
              </div>

              {/* Card Body: New Info Grid */}
              <div className="px-4 py-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex items-center gap-2 text-gray-700">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">{deliveryInfo.icon}</div>
                      <span className="font-bold text-sm">{deliveryInfo.text}</span>
                  </div>
                   <div className="flex items-center gap-2 text-gray-700">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">{paymentInfo.icon}</div>
                      <span className="font-bold text-sm">{paymentInfo.text}</span>
                  </div>
              </div>

              {/* Card Footer (Total Price) */}
              <div className="mt-auto px-4 py-3 bg-gray-50/70 border-t border-gray-100 flex justify-between items-center">
                <span className="text-sm text-gray-500 font-bold">الإجمالي</span>
                <span className="font-mono font-extrabold text-lg text-neo-primary">
                  {order.summary?.total?.toFixed(2) || '0.00'} ج.م
                </span>
              </div>
        </div>
    );
};

export default React.memo(OrderCard);
