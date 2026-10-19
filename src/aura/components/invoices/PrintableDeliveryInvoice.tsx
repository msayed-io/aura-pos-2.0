


import React from 'react';
import type { Order } from '../dashboard/dashboardTypes';

// --- Local Interfaces (from user's code) ---
export interface CartItem { id: string; name: string; quantity: number; price: number; total: number; }
export interface CustomerData { name: string; phone: string; addressLine1: string; addressLine2: string; addressLine3?: string; }
export interface DeliveryReceiptData { orderId: string; type: string; date: string; time: string; cashier: string; customer: CustomerData; items: CartItem[]; subtotal: number; discount: number; tax: number; paymentMethod: string; }

// --- Main Component ---
interface PrintableInvoiceProps { 
    order: Order; 
    cashierName?: string;
    logoUrl: string | null;
}

const PrintableDeliveryInvoice: React.FC<PrintableInvoiceProps> = ({ order, cashierName, logoUrl }) => {
    // ADAPTER LOGIC: Transform the app's 'Order' object into this component's expected 'DeliveryReceiptData' structure.
    const safeData: DeliveryReceiptData = {
        orderId: order.displayId,
        type: order.deliveryMethod === 'delivery' ? 'توصيل للمنزل' : 'استلام من الفرع',
        date: new Date(order.createdAt).toLocaleDateString('ar-EG', { day: '2-digit', month: 'long', year: 'numeric' }),
        time: new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }),
        cashier: cashierName || 'System',
        customer: {
            name: order.customer?.name || 'عميل غير معروف',
            phone: order.customer?.phone || '-',
            addressLine1: order.customer?.address || 'غير محدد',
            addressLine2: '',
        },
        items: order.items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
        })),
        subtotal: order.summary?.subtotal || 0,
        discount: order.summary?.discount || 0,
        tax: 0, // No tax in the app's Order model
        paymentMethod: order.paymentMethod,
    };

    const finalTotal = safeData.subtotal - safeData.discount + safeData.tax;
    const finalTotalNote = order.deliveryMethod === 'delivery' ? 'المبلغ المستحق عند الاستلام' : 'المبلغ المستحق للدفع بالفرع';
    const branchLocation = 'بنها - الفلل الجديدة، بجوار هايبر خير بلدنا';

    return (
        <div className="w-full bg-white text-black p-2 mx-auto shadow-xl rounded-2xl" style={{ fontFamily: "'Tajawal', sans-serif", maxWidth: '80mm' }} dir="rtl">
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Oswald:wght@500;700&display=swap'); @media print { @page { margin: 0; size: auto; } body { margin: 0; } } .en-font { font-family: 'Oswald', sans-serif; }`}</style>
            <div className="flex flex-col items-center text-center mb-3">
                {logoUrl && <img src={logoUrl} alt="شعار المطعم" className="w-24 h-24 mb-2 object-contain" />}
                <h1 className="text-2xl font-black text-black leading-none mb-1">المطعم</h1>
                <h2 className="text-sm font-bold tracking-[0.2em] uppercase en-font text-gray-800">RESTAURANT</h2>
                <div className="mt-2 text-[10px] font-medium text-gray-600">{branchLocation}</div>
            </div>
            <div className="border-t border-gray-300 w-3/4 mx-auto mb-3"></div>
            <div className="flex justify-between items-end mb-3 px-1 border-b border-gray-200 pb-2">
                <div className="text-right">
                    <p className="text-[10px] text-gray-500">رقم الطلب</p>
                    <p className="text-xl font-black leading-none">{safeData.orderId}</p>
                </div>
                <div className="text-left">
                    <p className="text-[10px] font-bold border-2 border-black rounded-lg px-2 py-0.5 inline-block bg-black text-white mb-1">{safeData.type}</p>
                    <p className="text-[10px] text-gray-600 font-mono" dir="ltr">{safeData.date} | {safeData.time}</p>
                    <p className="text-[10px] text-gray-600">الكاشير: {safeData.cashier}</p>
                </div>
            </div>
            <div className="p-2 border-2 border-black rounded-lg mb-4">
                <h3 className="text-center text-sm font-black mb-2 border-b border-dashed border-gray-400 pb-1">بيانات العميل</h3>
                <div className="mb-2">
                    <span className="text-[10px] text-gray-600 font-medium block leading-none">الاسم:</span>
                    <span className="text-lg font-bold block leading-tight">{safeData.customer.name}</span>
                </div>
                <div className={`border-y border-dashed border-black py-1 ${order.deliveryMethod === 'delivery' ? 'mb-2' : ''}`}>
                    <span className="text-[10px] text-gray-600 font-medium block leading-none">الهاتف:</span>
                    <span className="text-2xl font-black en-font tracking-tight block leading-tight" dir="ltr">{safeData.customer.phone}</span>
                </div>
                {order.deliveryMethod === 'delivery' && (
                    <div>
                        <span className="text-[10px] text-gray-600 font-medium block leading-none">العنوان:</span>
                        <p className="text-sm font-bold leading-snug">{safeData.customer.addressLine1}</p>
                        <p className="text-sm font-bold leading-snug">{safeData.customer.addressLine2}</p>
                        {safeData.customer.addressLine3 && (<p className="text-sm font-bold leading-snug">{safeData.customer.addressLine3}</p>)}
                    </div>
                )}
            </div>
            <div className="border border-black rounded-lg overflow-hidden mb-4">
                <table className="w-full text-[11px]">
                    <thead className="bg-gray-100 border-b border-black text-black">
                        <tr>
                            <th className="py-1.5 font-bold w-[40%] text-center">الصنف</th>
                            <th className="py-1.5 font-bold w-[15%] text-center">الكمية</th>
                            <th className="py-1.5 font-bold w-[20%] text-center">السعر</th>
                            <th className="py-1.5 font-bold w-[25%] text-center">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-black">
                        {safeData.items.map((item, index) => (
                            <tr key={index} className="text-center">
                                <td className="py-2 font-bold px-1 text-right">{item.name}</td>
                                <td className="py-2 font-medium en-font">{item.quantity}</td>
                                <td className="py-2 font-medium en-font">{item.price.toFixed(2)}</td>
                                <td className="py-2 font-bold en-font">{item.total.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-2 mb-4">
                <div className="flex justify-between text-xs font-medium mb-1">
                    <span>المجموع الفرعي:</span>
                    <span className="en-font">{safeData.subtotal.toFixed(2)}</span>
                </div>
                {safeData.discount > 0 && (
                    <div className="flex justify-between text-xs font-bold text-black mb-2">
                        <span>خصم خاص:</span>
                        <span className="en-font">-{safeData.discount.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between items-center border-t border-dashed border-gray-400 pt-2 mb-2">
                    <span className="text-xs font-bold">طريقة الدفع:</span>
                    <span className="text-xs font-bold border border-black px-2 rounded">{safeData.paymentMethod}</span>
                </div>
                <div className="border-t-2 border-black pt-2 mt-2">
                    <div className="flex flex-col items-center justify-center text-center">
                        <span className="text-sm font-bold text-black mb-1">إجمالي المبلغ</span>
                        <div className="text-3xl font-black text-black leading-none en-font">{finalTotal.toFixed(2)} <span className="text-xs font-medium font-sans">EGP</span></div>
                        <span className="text-[10px] text-gray-600 mt-1">{finalTotalNote}</span>
                    </div>
                </div>
            </div>
            <div className="text-center mt-6">
                <p className="text-[11px] font-bold mb-1">شكراً لاختيارك مطعمنا ❤️</p>
                <p className="text-[10px] text-gray-600 mb-4">نتمنى زيارتك قريباً</p>
                <div className="border-t border-gray-200 w-1/2 mx-auto mb-2"></div>
                <p className="text-[8px] text-gray-400 font-sans tracking-wide">Powered by Apex Synex</p>
            </div>
        </div>
    );
}

export default PrintableDeliveryInvoice;