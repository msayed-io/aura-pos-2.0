




import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Order } from '../dashboardTypes';
import { User, AccessCode } from '../../../types';
import {
    PrinterIcon,
    PencilIcon as Edit,
    XIcon as X,
    UserIcon,
    BanknotesIcon as Banknote,
    MapPinIcon as MapPin,
    ShoppingCartIcon as ShoppingBag,
    ClockIcon as Clock,
    CreditCardIcon, // For Etisalat fallback
    KeyRoundIcon,
    SpinnerIcon,
    CheckCircleIcon
} from '../Icons';
import { printOrderInvoice } from '../../../services/printingService';
import { useBranding } from '../../../contexts/BrandingContext';
import OrderEditModal from './OrderEditModal';
import { usePaymentLogos } from '../../../contexts/PaymentLogosContext';
import { dashboardOrderService } from '../services/dashboardOrderService';
import { useDashboard } from '../DashboardContext';
import { ToggleSwitch } from './ToggleSwitch';


// Helper to format currency (using EGP for app consistency)
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount);
};

// --- FALLBACK Payment Method Icons ---
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


interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  currentUser: User | null;
  allowEdit?: boolean;
  modalTitle?: string;
  isVoidView?: boolean; // New: Flag to hide print button
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ isOpen, onClose, order, currentUser, allowEdit = true, modalTitle, isVoidView }) => {
  const { logoUrl } = useBranding();
  const { vodafoneCash, instapay } = usePaymentLogos();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { showToast, playSound } = useDashboard();

  const handlePrint = () => {
      if (!order) return;
      const cashierId = currentUser?.id;
      const cashierName = currentUser?.username || 'System';
      const invoiceType = order.deliveryMethod === 'delivery' ? 'delivery' : 'dine_in';
      playSound('info'); // Sound for starting print job
      printOrderInvoice(order, invoiceType, logoUrl, cashierId, cashierName);
  };

  const handleOrderUpdated = () => {
    setIsEditModalOpen(false);
    onClose(); // Close the details modal as well
  };

  if (!isOpen || !order) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }
  
  const paymentOptions = {
      cash: { label: 'كاش', icon: <Banknote size={18} /> },
      vodafone: { label: 'فودافون كاش', icon: vodafoneCash ? <img src={vodafoneCash} alt="VF Cash" className="w-5 h-5"/> : <VodafoneCashIcon className="w-5 h-5" /> },
      instapay: { label: 'انستا باي', icon: instapay ? <img src={instapay} alt="Instapay" className="w-5 h-5"/> : <InstaPayOfficialIcon className="w-5 h-5" /> },
      etisalat: { label: 'اتصالات كاش', icon: <CreditCardIcon size={18} /> },
  };
  const paymentInfo = paymentOptions[order.paymentMethod] || paymentOptions.cash;
  
  const deliveryOptions = {
      delivery: { label: 'توصيل', icon: <MapPin size={18} /> },
      pickup: { label: 'استلام', icon: <ShoppingBag size={18} /> },
  };
  const deliveryInfo = deliveryOptions[order.deliveryMethod] || deliveryOptions.pickup;


  const canEdit = allowEdit;
  const canPrint = !isVoidView;
  const showFooter = canEdit || canPrint;

  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 modal-backdrop-blur" onClick={onClose}>
      
      <div 
        className="relative premium-modal w-full max-w-5xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className="bg-gray-50/50 px-10 py-6 border-b border-neo-soft-gray flex justify-between items-center rounded-t-[3rem]">
          <div>
            <h2 className="text-3xl font-extrabold text-neo-secondary">{modalTitle || 'تفاصيل الطلب'}</h2>
          </div>
          <div className="flex items-center gap-4">
             <span className="bg-neo-primary text-white font-mono text-lg font-black px-3 py-0.5 rounded-full shadow-md shadow-neo-primary/30 tracking-wider">
               {order.displayId}
             </span>
             <button 
                onClick={onClose}
                className="w-12 h-12 rounded-full bg-white border border-neo-soft-gray flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
                title="إغلاق"
              >
                <X size={22} />
              </button>
          </div>
        </div>

        <div className="p-10 grid grid-cols-12 gap-10">
          
          <div className="col-span-4 space-y-8">
            <div className="premium-card p-6 border border-neo-soft-gray shadow-sm">
               <h3 className="text-neo-secondary font-black mb-4 flex items-center gap-3 text-2xl group-hover:text-neo-primary transition-colors">
                 <UserIcon size={24} className="text-neo-primary"/> {order.customer?.name || 'عميل غير معروف'}
               </h3>
               <div className="space-y-4">
                  <div className="border-t border-neo-soft-gray pt-4">
                    <label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider">التوقيت</label>
                    <div className="text-base font-semibold text-neo-secondary flex items-center justify-between mt-1">
                        <span className="flex items-center gap-1.5"><Clock size={14}/> {new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute:'2-digit' })}</span>
                        <span>{new Date(order.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  </div>
                  {order.deliveryMethod === 'delivery' && (
                    <div>
                        <label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider">العنوان</label>
                        <p className="text-base font-medium text-gray-800 leading-relaxed mt-1">{order.customer?.address || 'غير متوفر'}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider">الهاتف</label>
                    <p className="text-base font-medium text-gray-800 dir-ltr text-right mt-1">{order.customer?.phone || '-'}</p>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className="bg-white p-4 rounded-xl text-center border border-neo-soft-gray">
                  <div className="text-sm text-neo-secondary/50 mb-1">طريقة الدفع</div>
                  <div className="font-bold text-neo-secondary flex justify-center items-center gap-2 text-lg">
                     {paymentInfo.icon}
                     {paymentInfo.label}
                  </div>
               </div>
               <div className="bg-white p-4 rounded-xl text-center border border-neo-soft-gray">
                  <div className="text-sm text-neo-secondary/50 mb-1">التسليم</div>
                  <div className="font-bold text-neo-secondary flex justify-center items-center gap-2 text-lg">
                     {deliveryInfo.icon}
                     {deliveryInfo.label}
                  </div>
               </div>
            </div>
          </div>

          <div className="col-span-8">
             <h3 className="text-xl font-bold text-neo-secondary mb-4">تفاصيل الأصناف</h3>
            <div className="border border-neo-soft-gray rounded-2xl overflow-hidden shadow-sm bg-white">
              <table className="w-full text-right">
                <thead className="bg-gray-50 text-xs text-neo-secondary/60 uppercase font-bold tracking-wider border-b border-neo-soft-gray">
                  <tr>
                    <th className="px-6 py-3">الصنف</th>
                    <th className="px-6 py-3 text-center">الكمية</th>
                    <th className="pr-3 py-3">ملاحظات</th>
                    <th className="pl-3 py-3 text-left border-r border-gray-200">السعر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neo-soft-gray">
                  {order.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-neo-secondary">
                        {item.name || <span className="text-sm italic text-red-500 font-semibold">اسم الصنف غير متوفر</span>}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="bg-gray-200 text-neo-secondary px-2 py-0.5 rounded text-sm font-bold">
                          {item.quantity}
                        </span>
                      </td>
                      <td className="pr-3 py-3.5 text-sm text-red-600 italic whitespace-pre-wrap">
                        {item.notes || <span className="text-gray-400 font-light">-</span>}
                      </td>
                      <td className="pl-3 py-3.5 text-left font-bold text-neo-secondary font-mono border-r border-gray-200">
                        {formatCurrency(item.price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100/80 border-t-2 border-neo-soft-gray">
                   {typeof order.quantity === 'number' && (
                       <tr>
                         <td colSpan={3} className="px-6 py-2 text-neo-secondary font-bold text-base">إجمالي الكمية</td>
                         <td className="px-6 py-2 text-left text-lg font-bold text-neo-secondary font-mono">{order.quantity}</td>
                       </tr>
                   )}
                   <tr>
                     <td colSpan={3} className="px-6 py-4 text-neo-secondary font-black text-lg">الإجمالي</td>
                     <td className="px-6 py-4 text-left text-2xl font-black text-neo-primary font-mono">
                       {formatCurrency(order.summary?.total || 0)}
                     </td>
                   </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {showFooter && (
            <div className="p-8 border-t border-neo-soft-gray bg-gray-50 flex justify-end gap-4 rounded-b-[3rem]">
                {canEdit && (
                    <button 
                        onClick={() => setIsEditModalOpen(true)}
                        className="flex items-center gap-2 px-8 py-3 bg-white border border-gray-200 text-neo-secondary rounded-2xl font-extrabold text-lg hover:bg-gray-100 transition-all shadow-md active:scale-95">
                        <Edit size={20} />
                        تعديل الطلب
                    </button>
                )}
                {canPrint && (
                    <button onClick={handlePrint} className="flex items-center gap-2 px-8 py-3 bg-neo-primary text-white rounded-2xl font-extrabold text-lg hover:bg-neo-accent transition-all shadow-lg shadow-neo-primary/40 active:scale-95">
                        <PrinterIcon size={20} />
                        طباعة الفاتورة
                    </button>
                )}
            </div>
        )}
      </div>
    </div>
    
    <OrderEditModal
      isOpen={isEditModalOpen}
      onClose={() => setIsEditModalOpen(false)}
      order={order}
      onOrderUpdated={handleOrderUpdated}
    />
    </>,
    portalRoot
  );
};

export default OrderDetailsModal;
