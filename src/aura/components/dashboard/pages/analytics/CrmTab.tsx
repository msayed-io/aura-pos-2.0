import React, { useMemo, useState, useEffect } from 'react';
import { Order, CrmCustomer, OrderType, OrderSource, OrderStatus as AnalyticsStatus } from '../../../../types';
import { Search as SearchIcon, ShoppingBag, Clock, Phone, Calendar, ChevronDown, ChevronUp, Truck, Utensils } from 'lucide-react';
import { ArrowLeftIcon } from '../../Icons';
import OrderDetailsModal from '../../ui/OrderDetailsModal';
import { Order as DashboardOrder, OrderStatus as DashboardStatus } from '../../dashboardTypes';
import { useAuth } from '../../../../contexts/AuthContext';
import { useBranding } from '../../../../contexts/BrandingContext';

// --- Helper: Format currency ---
const formatCurrency = (value: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(value);

// ============================================================================
// --- 1. Customer Profile View (Inner) ---
// ============================================================================

const OrderTypeBadge: React.FC<{ type: OrderType }> = ({ type }) => {
    const typeMap = {
        [OrderType.DELIVERY]: { text: 'توصيل', icon: <Truck size={12} />, className: 'bg-orange-500/20 text-orange-300' },
        [OrderType.TAKEAWAY]: { text: 'استلام', icon: <ShoppingBag size={12} />, className: 'bg-teal-500/20 text-teal-300' },
        [OrderType.DINE_IN]: { text: 'صالة', icon: <Utensils size={12} />, className: 'bg-purple-500/20 text-purple-300' },
    };
    const { text, icon, className } = typeMap[type] || { text: type, icon: null, className: 'bg-gray-500/20 text-gray-300' };

    return (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full inline-flex items-center gap-1.5 ${className}`}>
            {icon}
            {text}
        </span>
    );
};

const SourceBadge: React.FC<{ source: OrderSource }> = ({ source }) => {
    const isPos = source === OrderSource.POS;
    const text = isPos ? 'POS' : 'أونلاين';
    const className = isPos ? 'bg-neo-primary/20 text-neo-primary' : 'bg-emerald-500/20 text-emerald-300';
    return (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full inline-flex items-center gap-1.5 ${className}`}>
            {text}
        </span>
    );
};

const OrderHistoryItem: React.FC<{ order: Order; onViewOrder: (order: Order) => void; }> = ({ order, onViewOrder }) => {
    return (
        <div 
            onClick={() => onViewOrder(order)}
            className="border-b border-white/5 last:border-0 p-4 hover:bg-white/5 cursor-pointer transition-colors group rounded-2xl"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`w-2 h-10 rounded-full ${order.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-gray-500'}`}></div>
                    <div>
                        <p className="font-bold text-white text-base flex items-center gap-2">
                            طلب #{order.id.slice(-4)} 
                            <SourceBadge source={order.source} />
                            <OrderTypeBadge type={order.type} />
                        </p>
                        <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1.5">
                            <Calendar size={12} />
                            {new Date(order.timestamp).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                            <span className="mx-1">•</span>
                            {new Date(order.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
                
                <div className="text-left flex items-center gap-4">
                    <div>
                        <p className="font-extrabold text-emerald-300 font-mono text-lg">{formatCurrency(order.totalPrice)}</p>
                        <p className="text-xs text-slate-500">{order.items.length} أصناف</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CustomerProfileView: React.FC<{ customer: CrmCustomer, onBack: () => void, onViewOrder: (order: Order) => void }> = ({ customer, onBack, onViewOrder }) => {
    const sortedOrders = [...customer.orders].sort((a, b) => b.timestamp - a.timestamp);
    const topItems = Array.from(customer.itemFrequency.entries())
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 3);
    const { primaryColor } = useBranding();

    return (
        <div className="h-full bg-[#09090b] flex flex-col animate-fade-in">
            <div className="flex-shrink-0 border-b border-white/10 p-4 flex items-center gap-4 bg-white/5 backdrop-blur-md sticky top-0 z-10 rounded-2xl">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 text-white transition">
                    <ArrowLeftIcon size={20} />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white font-cairo">ملف العميل</h2>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1" style={{ background: `linear-gradient(to right, ${primaryColor}, #10b981)` }}></div>
                            <div className="w-28 h-28 mx-auto bg-gradient-to-br from-gray-800 to-black rounded-full border-4 border-white/10 flex items-center justify-center mb-4 shadow-xl">
                                <span className="text-5xl font-black text-white">{customer.name.charAt(0)}</span>
                            </div>
                            <h1 className="text-3xl font-extrabold text-white mb-1">{customer.name}</h1>
                            <div className="flex items-center justify-center gap-2 text-slate-300 text-base mb-6">
                                <Phone size={14} />
                                <span className="font-mono" dir="ltr">{customer.phone}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-sm text-slate-500 mb-1">إجمالي الإنفاق</p>
                                    <p className="text-2xl font-bold text-emerald-400 font-mono">{formatCurrency(customer.totalSpent)}</p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-sm text-slate-500 mb-1">عدد الطلبات</p>
                                    <p className="text-2xl font-bold text-white">{customer.orderCount}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                            <h3 className="text-base font-bold text-slate-300 mb-4 flex items-center gap-2">
                                <ShoppingBag size={18} className="text-neo-primary"/> الأصناف المفضلة
                            </h3>
                            <div className="space-y-4">
                                {topItems.map(([key, data], i) => (
                                    <div key={key} className="flex items-center justify-between text-base">
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm font-bold text-slate-600 w-5 text-center">#{i+1}</span>
                                            <span className="text-slate-200 font-semibold">{data.name}</span>
                                        </div>
                                        <span className="bg-neo-primary/20 text-neo-primary px-2.5 py-1 rounded text-sm font-bold">{data.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-2xl flex flex-col">
                         <div className="p-6 border-b border-white/10 flex justify-between items-center">
                            <h3 className="font-bold text-white text-xl flex items-center gap-3">
                                <Clock size={20} className="text-emerald-400"/> سجل الطلبات
                            </h3>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar" style={{maxHeight: 'calc(100vh - 250px)'}}>
                            {sortedOrders.length > 0 ? (
                                sortedOrders.map(order => <OrderHistoryItem key={order.id} order={order} onViewOrder={onViewOrder} />)
                            ) : (
                                <p className="text-center text-slate-500 p-8">لا توجد طلبات مسجلة لهذا العميل.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// --- 2. Compact Grid View (Outer) ---
// ============================================================================

const CustomerGridCard: React.FC<{ customer: CrmCustomer, onClick: () => void }> = ({ customer, onClick }) => {
    return (
        <div 
            onClick={onClick}
            className="bg-white/5 border border-white/10 hover:border-neo-primary/50 hover:bg-white/10 rounded-2xl p-4 cursor-pointer transition-all duration-300 group flex items-center gap-4 relative overflow-hidden transform hover:-translate-y-1"
        >
            <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-br from-gray-700 to-black rounded-full flex items-center justify-center text-white font-extrabold text-2xl border-2 border-white/10 group-hover:scale-105 transition-transform">
                {customer.name.charAt(0)}
            </div>
            <div className="flex-grow min-w-0">
                <h3 className="text-slate-100 font-extrabold text-base truncate group-hover:text-neo-primary transition-colors">{customer.name}</h3>
                <p className="text-slate-400 text-sm font-mono truncate" dir="ltr">{customer.phone}</p>
            </div>
            <div className="text-left flex-shrink-0">
                <p className="text-emerald-400 font-bold font-mono text-base">{formatCurrency(customer.totalSpent)}</p>
                <p className="text-xs text-slate-500 text-right">{customer.orderCount} طلب</p>
            </div>
        </div>
    );
};

// ============================================================================
// --- Main CRM Tab Component ---
// ============================================================================

// Adapter function to convert Analytics Order to Dashboard Order for the modal
const analyticsOrderToDashboardOrder = (analyticsOrder: Order): DashboardOrder | null => {
    if (!analyticsOrder) return null;

    const subtotal = analyticsOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryFee = analyticsOrder.totalPrice + (analyticsOrder.discount || 0) - subtotal;

    let dashboardStatus: DashboardStatus = 'Preparing';
    if (analyticsOrder.status === AnalyticsStatus.COMPLETED) {
        dashboardStatus = 'Delivered';
    } else if (analyticsOrder.status === AnalyticsStatus.PENDING) {
        dashboardStatus = 'Preparing';
    }

    let deliveryMethod: 'delivery' | 'pickup' = 'pickup';
    if (analyticsOrder.type === OrderType.DELIVERY) {
        deliveryMethod = 'delivery';
    }

    return {
        id: analyticsOrder.id,
        displayId: analyticsOrder.id,
        createdAt: analyticsOrder.timestamp,
        items: analyticsOrder.items.map(item => ({...item, notes: item.notes || ''})),
        customer: {
            name: analyticsOrder.customerName || 'N/A',
            phone: analyticsOrder.customerId || 'N/A',
            address: 'غير متوفر في هذا العرض'
        },
        status: dashboardStatus,
        summary: {
            subtotal,
            deliveryFee: deliveryFee > 0 ? deliveryFee : 0,
            discount: analyticsOrder.discount || 0,
            total: analyticsOrder.totalPrice,
        },
        deliveryMethod,
        paymentMethod: 'cash', // Default value, not available in analytics data
        isArchived: analyticsOrder.isArchived,
        isEdited: analyticsOrder.isEdited,
    };
};

interface CrmTabProps {
    allOrders: Order[];
    onViewChange: (isProfileVisible: boolean) => void;
}

const CrmTab: React.FC<CrmTabProps> = ({ allOrders, onViewChange }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
    const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
    const { currentUser } = useAuth();

    useEffect(() => {
        onViewChange(!!selectedCustomer);
    }, [selectedCustomer, onViewChange]);

    const customers = useMemo((): CrmCustomer[] => {
        const customerMap = new Map<string, CrmCustomer>();
        allOrders.forEach(order => {
            const phone = order.customerId;
            if (!phone || phone === '-') return; // Ignore dine-in customers with no phone

            let customer = customerMap.get(phone);
            if (!customer) {
                customer = {
                    id: phone,
                    name: order.customerName || 'عميل غير معروف',
                    phone: phone,
                    totalSpent: 0,
                    orderCount: 0,
                    lastOrderDate: 0,
                    firstOrderDate: Infinity,
                    orders: [],
                    itemFrequency: new Map(),
                };
            }
            customer.totalSpent += order.totalPrice;
            customer.orderCount += 1;
            customer.lastOrderDate = Math.max(customer.lastOrderDate, order.timestamp);
            customer.firstOrderDate = Math.min(customer.firstOrderDate, order.timestamp);
            customer.orders.push(order);
            
            order.items.forEach(item => {
                const freq = customer.itemFrequency.get(item.name) || { name: item.name, count: 0 };
                freq.count += item.quantity;
                customer.itemFrequency.set(item.name, freq);
            });
            customerMap.set(phone, customer);
        });
        return Array.from(customerMap.values()).sort((a,b) => b.lastOrderDate - a.lastOrderDate);
    }, [allOrders]);
    
    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customers;
        const term = searchTerm.toLowerCase();
        return customers.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term));
    }, [customers, searchTerm]);
    
    const viewingDashboardOrder = useMemo(() => {
        return viewingOrder ? analyticsOrderToDashboardOrder(viewingOrder) : null;
    }, [viewingOrder]);

    if (selectedCustomer) {
        return (
            <>
                <CustomerProfileView 
                    customer={selectedCustomer} 
                    onBack={() => setSelectedCustomer(null)}
                    onViewOrder={setViewingOrder}
                />
                <OrderDetailsModal
                    isOpen={!!viewingOrder}
                    onClose={() => setViewingOrder(null)}
                    order={viewingDashboardOrder}
                    currentUser={currentUser}
                    allowEdit={false}
                    isVoidView={true} // Disables all action buttons
                    modalTitle="تفاصيل الطلب"
                />
            </>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in h-full flex flex-col">
            <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md">
                <div>
                    <h1 className="text-2xl font-black text-white font-cairo">قاعدة بيانات العملاء</h1>
                    <p className="text-sm text-slate-400 mt-1">إدارة {customers.length} عميل مسجل</p>
                </div>
                <div className="relative w-full sm:w-72">
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <SearchIcon size={20}/>
                    </div>
                    <input
                        type="search"
                        placeholder="بحث بالاسم أو الهاتف..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pr-11 pl-4 py-3 bg-black/40 border border-white/10 text-white rounded-xl focus:outline-none focus:border-neo-primary/50 focus:bg-black/60 transition-all placeholder-slate-500 text-base"
                    />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 pb-10">
                {filteredCustomers.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-slate-500">
                        <p className="font-bold text-lg">لا توجد نتائج مطابقة.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                        {filteredCustomers.map(customer => (
                            <CustomerGridCard 
                                key={customer.id} 
                                customer={customer} 
                                onClick={() => setSelectedCustomer(customer)} 
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CrmTab;