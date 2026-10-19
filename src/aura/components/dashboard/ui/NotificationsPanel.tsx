import React, { useState } from 'react';
import { LogEntry } from '../../../types';
// FIX: Fix icon imports
import { 
    ShieldExclamationIcon, 
    BellIcon, 
    UserIcon, 
    PhoneIcon, 
    MapPinIcon, 
    TruckIcon, 
    ShoppingCartIcon, 
    StarIcon, 
    WalletIcon, 
    MinusCircleIcon, 
    ChevronDownIcon 
} from '../Icons';

// Helper to format time relative to now
const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return `منذ ${Math.floor(interval)} سنة`;
    
    interval = seconds / 2592000;
    if (interval > 1) return `منذ ${Math.floor(interval)} شهر`;
    
    interval = seconds / 86400;
    if (interval > 1) return `منذ ${Math.floor(interval)} يوم`;
    
    interval = seconds / 3600;
    if (interval > 1) return `منذ ${Math.floor(interval)} ساعة`;
    
    interval = seconds / 60;
    if (interval > 1) return `منذ ${Math.floor(interval)} دقيقة`;
    
    return "الآن";
};

// Component to display full order details when expanded
const LogDetailsView: React.FC<{ log: LogEntry }> = ({ log }) => {
    const details = log.details;
    if (!details) return null;

    const { customer, items, subtotal, discount, total, type, paymentMethod } = details;

    const orderTypeMap = {
        'DELIVERY': { text: 'توصيل', icon: <TruckIcon size={14} className="text-gray-400"/> },
        'TAKEAWAY': { text: 'استلام', icon: <ShoppingCartIcon size={14} className="text-gray-400"/> },
        'DINE_IN': { text: 'صالة', icon: <StarIcon size={14} className="text-gray-400"/> }
    };
    const orderTypeInfo = orderTypeMap[type as keyof typeof orderTypeMap] || { text: type, icon: null };

    return (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-neo-soft-gray space-y-4 animate-fade-in">
            {customer && (
                <div>
                    <h4 className="font-bold text-sm text-neo-secondary mb-2">بيانات العميل</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2"><UserIcon size={14} className="text-gray-400"/> <span className="text-gray-500">الاسم:</span> <strong className="text-neo-secondary">{customer.name}</strong></div>
                        <div className="flex items-center gap-2"><PhoneIcon size={14} className="text-gray-400"/> <span className="text-gray-500">الهاتف:</span> <strong className="text-neo-secondary" dir="ltr">{customer.phone}</strong></div>
                        {type === 'DELIVERY' && customer?.address && (
                            <div className="flex items-start gap-2"><MapPinIcon size={14} className="text-gray-400 mt-1"/> <span className="text-gray-500">العنوان:</span> <strong className="text-neo-secondary flex-1">{customer.address}</strong></div>
                        )}
                    </div>
                </div>
            )}
            {items && (
                <div>
                    <h4 className="font-bold text-sm text-neo-secondary mb-2">الأصناف الملغاة</h4>
                    <div className="space-y-2">
                        {items.map((item: any, index: number) => (
                            <div key={index} className="p-2 bg-gray-100/70 rounded-md">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-bold text-neo-secondary">{item.quantity}x {item.name}</span>
                                    <span className="font-mono font-bold text-neo-secondary">{(item.price * item.quantity).toFixed(2)} ج.م</span>
                                </div>
                                {item.notes && <p className="text-xs text-amber-600 mr-4 mt-1">ملاحظة: {item.notes}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div>
                <h4 className="font-bold text-sm text-neo-secondary mb-2">الملخص المالي</h4>
                <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600"><span>المجموع:</span> <span className="font-mono">{subtotal?.toFixed(2) || '0.00'} ج.م</span></div>
                    {discount > 0 && <div className="flex justify-between text-neo-error"><span><MinusCircleIcon size={12} className="inline-block ml-1"/> خصم:</span> <span className="font-mono">-{discount.toFixed(2)} ج.م</span></div>}
                    <div className="flex justify-between text-neo-secondary font-bold pt-1 border-t border-neo-soft-gray mt-1"><span>الإجمالي الملغي:</span> <span className="font-mono text-neo-error">{total?.toFixed(2) || '0.00'} ج.م</span></div>
                </div>
            </div>
        </div>
    );
};


// Component for a single notification item
const NotificationItem: React.FC<{ log: LogEntry }> = ({ log }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div 
            className="p-4 border-b border-neo-soft-gray last:border-b-0 hover:bg-gray-50/50 transition-colors duration-200 cursor-pointer"
            onClick={() => setIsExpanded(prev => !prev)}
        >
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-red-100 rounded-full mt-1">
                    <ShieldExclamationIcon className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-grow">
                    <p className="text-sm text-neo-secondary leading-relaxed">
                        <strong className="font-bold">{log.cashierName}</strong> حاول إلغاء الطلب رقم 
                        <strong className="font-mono mx-1">{log.orderId}</strong>
                    </p>
                    <span className="text-xs text-gray-500">{formatTimeAgo(log.timestamp)}</span>
                </div>
                <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
            {isExpanded && <LogDetailsView log={log} />}
        </div>
    );
};


// Main Panel Component
interface NotificationsPanelProps {
  logs: LogEntry[];
  onClose: () => void;
}

const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ logs, onClose }) => {
    return (
        <div className="absolute top-full mt-2 left-0 w-96 bg-white/80 backdrop-blur-lg rounded-xl shadow-2xl border border-neo-soft-gray z-50 animate-zoom-in-95 origin-top-left flex flex-col max-h-[80vh]">
            <header className="flex-shrink-0 p-4 border-b border-neo-soft-gray flex justify-between items-center">
                <h3 className="font-bold text-lg text-neo-secondary">إشعارات الإلغاء</h3>
                {/* Optional: Add a clear all button later */}
            </header>
            <div className="flex-grow overflow-y-auto">
                {logs.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">
                        <BellIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-semibold">لا توجد إشعارات جديدة</p>
                        <p className="text-sm mt-1">لم يتم تسجيل أي محاولات إلغاء مؤخراً.</p>
                    </div>
                ) : (
                    <div>
                        {logs.map(log => <NotificationItem key={log.id} log={log} />)}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsPanel;