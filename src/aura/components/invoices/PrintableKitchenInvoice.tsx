import React from 'react';
import type { Order } from '../dashboard/dashboardTypes';

// --- Helper function from provided code ---
const toArabicDigits = (num: number | string): string => {
    const arabicMap = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num).replace(/[0-9]/g, (digit) => arabicMap[parseInt(digit)]);
};

// --- Main Component ---
interface PrintableInvoiceProps {
  order: Order;
}

const PrintableKitchenInvoice: React.FC<PrintableInvoiceProps> = ({ order }) => {
  const orderType = order.deliveryMethod === 'delivery' ? 'توصيل' : 'صالة';

  return (
    <div 
      className="w-full bg-white text-black p-3 mx-auto shadow-none rounded-2xl"
      style={{ fontFamily: "'Tajawal', sans-serif", maxWidth: '80mm' }}
      dir="rtl"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Oswald:wght@500;700&display=swap');
        @media print { @page { margin: 0; size: auto; } body { margin: 0; } .text-red-700, .text-gray-700, .text-gray-500 { color: black !important; } .bg-gray-200 { background-color: white !important; } }
        .en-font { font-family: 'Oswald', sans-serif; }
      `}</style>

      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-black text-black leading-none mb-3">
          طلب تحضير
        </h1>
        <div className="border-t border-dashed border-black w-3/4 mx-auto mb-3"></div>
        <p className="text-sm text-black font-bold mb-1">رقم الطلب:</p>
        <p className="text-5xl font-black en-font leading-none mb-4">
          {order.displayId}
        </p>
        <div className="flex justify-between items-center text-center px-2 text-black py-2">
            <span className="text-sm font-black border border-black px-2 py-0.5 inline-block rounded-lg">
                النوع: {orderType}
            </span>
            <span className="text-xs font-bold">{new Date(order.createdAt).toLocaleDateString('ar-EG', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            <span className="text-sm font-black en-font">{new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
        </div>
      </div>

      <div className="border-t-2 border-dashed border-black w-full mx-auto mb-4 mt-2"></div>

      {/* Items List */}
      <div className="space-y-3">
        {order.items.length === 0 && (
             <p className="text-center text-lg font-bold text-black">
                لا توجد أصناف في هذا الطلب.
            </p>
        )}
        {order.items.map((item, index) => (
          <div key={index} className={`pb-2 ${index < order.items.length - 1 ? 'border-b border-dashed border-gray-500' : ''}`}>
            <div className="flex items-start gap-3 mb-1">
                <span className="text-3xl font-black text-black leading-tight en-font w-10 flex-shrink-0 text-center">
                    {toArabicDigits(item.quantity)}
                </span>
                <span className="text-xl font-extrabold text-black leading-tight pt-1">
                    {item.name}
                </span>
            </div>
            {item.notes && (
              <div className="mt-1 mr-12 space-y-0.5">
                  <p className="text-base text-black font-medium leading-snug">
                    <span className="ml-1">-</span> {item.notes}
                  </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t-2 border-dashed border-black w-full mx-auto mt-4"></div>

      {/* Footer */}
      <div className="text-center mt-4">
        <p className="text-[14px] font-black text-black">
          شكراً لجهودكم - تجهيز سريع و دقيق!
        </p>
      </div>
    </div>
  );
};

export default PrintableKitchenInvoice;