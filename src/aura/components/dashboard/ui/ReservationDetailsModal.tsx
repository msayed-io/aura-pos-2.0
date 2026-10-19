
import React from 'react';
import { createPortal } from 'react-dom';
import type { Reservation } from '../../../types';
import {
    XIcon,
    UserIcon,
    PhoneIcon,
    CalendarIcon,
    ClockIcon,
    UsersIcon,
    ChatIcon,
    CheckIcon,
    ArchiveBoxIcon,
    BanknotesIcon,
} from '../Icons';
import { usePaymentLogos } from '../../../contexts/PaymentLogosContext';

// Helper to format currency
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


// Helper to format date for display
const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo' });
};


// Helper to format time for display
const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
};

interface ReservationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: Reservation | null;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  isArchivedView?: boolean;
}

const ReservationDetailsModal: React.FC<ReservationDetailsModalProps> = ({ isOpen, onClose, reservation, onConfirm, onCancel, isArchivedView = false }) => {
  const { vodafoneCash, instapay } = usePaymentLogos();

  if (!isOpen || !reservation) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) return null;

  const isPending = reservation.status === 'PENDING';
  
  const paymentInfo = {
      'vodafone': { 
          icon: vodafoneCash ? <img src={vodafoneCash} alt="VF Cash" className="w-6 h-6"/> : <VodafoneCashIcon />, 
          text: 'فودافون كاش' 
      },
      'instapay': { 
          icon: instapay ? <img src={instapay} alt="Instapay" className="w-6 h-6"/> : <InstaPayOfficialIcon />, 
          text: 'انستا باي' 
      },
  }[reservation.paymentMethod || ''] || { icon: <BanknotesIcon className="w-6 h-6 text-gray-500"/>, text: reservation.paymentMethod || 'غير محدد' };


  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 modal-backdrop-blur" onClick={onClose}>
      <div 
        className="relative bg-neo-bg rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bg-white px-10 py-5 border-b border-neo-soft-gray flex justify-between items-center rounded-2xl">
          <div>
            <h2 className="text-3xl font-extrabold text-neo-secondary">تفاصيل الحجز</h2>
          </div>
          <div className="flex items-center gap-4">
             <span className="bg-neo-primary text-white font-mono text-lg font-black px-3 py-0.5 rounded-full shadow-md shadow-neo-primary/30 tracking-wider">
               {reservation.displayId}
             </span>
             <button 
                onClick={onClose}
                className="w-12 h-12 rounded-full bg-white border border-neo-soft-gray flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
                title="إغلاق"
              >
                <XIcon size={22} />
              </button>
          </div>
        </header>

        <main className="p-10 grid grid-cols-12 gap-10 bg-gray-50/50 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="col-span-5 space-y-8">
              <div className="bg-white p-6 rounded-2xl border border-neo-soft-gray shadow-sm">
                 <h3 className="text-neo-secondary font-black mb-4 flex items-center gap-3 text-2xl">
                   <UserIcon size={24} className="text-neo-primary"/> {reservation.name}
                 </h3>
                 <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-neo-soft-gray pt-4">
                      <div><label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider flex items-center gap-1.5"><CalendarIcon size={14}/> التاريخ</label><p className="text-base font-semibold text-neo-secondary mt-1">{formatDisplayDate(reservation.date)}</p></div>
                      <div><label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider flex items-center gap-1.5"><ClockIcon size={14}/> الوقت</label><p className="text-base font-semibold text-neo-secondary mt-1">{formatDisplayTime(reservation.time)}</p></div>
                      <div><label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider flex items-center gap-1.5"><UsersIcon size={14}/> عدد الأفراد</label><p className="text-base font-semibold text-neo-secondary mt-1">{reservation.guests} أفراد</p></div>
                      <div><label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider flex items-center gap-1.5"><PhoneIcon size={14}/> الهاتف</label><p className="text-base font-semibold text-neo-secondary mt-1" dir="ltr">{reservation.phone}</p></div>
                    </div>
                    {reservation.notes && (<div className="border-t border-neo-soft-gray pt-4"><label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider flex items-center gap-1.5"><ChatIcon size={14}/> ملاحظات</label><p className="text-base font-medium text-gray-800 leading-relaxed mt-1 whitespace-pre-wrap">{reservation.notes}</p></div>)}
                 </div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-neo-soft-gray shadow-sm">
                  <h3 className="text-neo-secondary font-black mb-4 text-2xl">الدفع</h3>
                  <div className="space-y-3 border-t border-neo-soft-gray pt-4">
                      <div className="flex justify-between items-center text-base"><span className="text-neo-secondary/70">طريقة الدفع:</span><span className="font-bold text-neo-secondary flex items-center gap-2">{paymentInfo.icon}{paymentInfo.text}</span></div>
                      <div className="flex justify-between items-center text-base"><span className="text-neo-secondary/70">العربون المدفوع:</span><span className="font-bold text-neo-success font-mono">{formatCurrency(reservation.downPayment ?? 0)}</span></div>
                  </div>
              </div>
          </div>
          <div className="col-span-7">
              <h3 className="text-xl font-bold text-neo-secondary mb-4">الأصناف المحجوزة</h3>
              <div className="border border-neo-soft-gray rounded-2xl overflow-hidden shadow-sm bg-white">
                {(reservation.items && reservation.items.length > 0) ? (
                  <table className="w-full text-right">
                    <thead className="bg-gray-50 text-xs text-neo-secondary/60 uppercase font-bold tracking-wider border-b border-neo-soft-gray">
                      <tr>
                        <th className="px-6 py-3">الصنف</th>
                        <th className="px-6 py-3 text-center">الكمية</th>
                        <th className="pl-6 py-3 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neo-soft-gray">
                      {reservation.items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-3.5 font-medium text-neo-secondary">{item.name}</td>
                          <td className="px-6 py-3.5 text-center"><span className="bg-gray-200 text-neo-secondary px-2 py-0.5 rounded text-sm font-bold">{item.quantity}</span></td>
                          <td className="pl-6 py-3.5 text-left font-bold text-neo-secondary font-mono">{formatCurrency(item.price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100/80 border-t-2 border-neo-soft-gray">
                       <tr><td colSpan={2} className="px-6 py-3 text-neo-secondary/80 font-semibold">المجموع الفرعي</td><td className="pl-6 py-3 text-left font-bold text-neo-secondary font-mono">{formatCurrency(reservation.subtotal ?? 0)}</td></tr>
                       <tr><td colSpan={2} className="px-6 py-4 text-neo-secondary font-black text-lg">الإجمالي الكلي</td><td className="pl-6 py-4 text-left text-2xl font-black text-neo-primary font-mono">{formatCurrency(reservation.total ?? 0)}</td></tr>
                    </tfoot>
                  </table>
                ) : (
                  <div className="p-8 text-center text-neo-secondary/50">لم يتم تحديد أصناف لهذا الحجز.</div>
                )}
              </div>
          </div>
        </main>

        {!isArchivedView && (
             <footer className="p-8 border-t border-neo-soft-gray bg-white flex justify-end gap-4 rounded-2xl">
                {isPending && (
                    <button onClick={() => onConfirm(reservation.id)} className="flex items-center gap-2 px-6 py-3 bg-green-100 text-green-600 rounded-xl font-extrabold text-lg hover:bg-green-200 transition-all shadow-md">
                        <CheckIcon size={20} /> تأكيد الحجز
                    </button>
                )}
                <button onClick={() => onCancel(reservation.id)} className="flex items-center gap-2 px-6 py-3 bg-amber-100 text-amber-600 rounded-xl font-extrabold text-lg hover:bg-amber-200 transition-all shadow-md">
                    <ArchiveBoxIcon size={20} /> أرشفة الحجز
                </button>
            </footer>
        )}
      </div>
    </div>,
    portalRoot
  );
};

export default ReservationDetailsModal;
