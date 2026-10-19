import React, { useState, useMemo, useEffect } from 'react';
import { Order as AnalyticsOrder, OrderSource, OrderStatus as AnalyticsStatus, OrderType, LogActionType } from '../../../types';
import { 
    ArrowLeftOnRectangleIcon, 
    SearchIcon, 
    ReceiptIcon,
    TrashIcon
} from '../Icons';
import { Archive, RefreshCcw } from 'lucide-react';
import OrderDetailsModal from '../ui/OrderDetailsModal';
import { Order as DashboardOrder } from '../dashboardTypes';
import { useAuth } from '../../../contexts/AuthContext';
import { dashboardOrderService } from '../services/dashboardOrderService';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';
import { useDashboard } from '../DashboardContext';
import { loggingService } from '../../../services/loggingService';
import ConnectivityBadge from '../../ConnectivityBadge';

// Helper function to derive a category from an item's name for analytics purposes.
const getItemCategory = (itemName: string): string => {
    const lowerItemName = (itemName || '').toLowerCase();
    if (lowerItemName.includes('برجر')) return 'برجر';
    if (lowerItemName.includes('بروست')) return 'بروست';
    if (lowerItemName.includes('راب') || lowerItemName.includes('ساندويتش')) return 'سندويتشات';
    if (lowerItemName.includes('بطاطس') || lowerItemName.includes('سلاد')) return 'جانبي';
    if (lowerItemName.includes('كولا')) return 'مشروبات';
    return 'متنوع';
};

// CORRECTED Transformation function to map Dashboard Order to Analytics Order
const transformDashboardOrderToAnalyticsOrder = (dOrder: DashboardOrder): AnalyticsOrder => {
    // FIX: Use the `_source` field for robust classification. Online orders lack this field.
    const source = dOrder._source === 'POS' ? OrderSource.POS : OrderSource.ONLINE;
    const type = dOrder.deliveryMethod === 'delivery' ? OrderType.DELIVERY : (dOrder.customer?.address === 'استلام من الفرع' ? OrderType.TAKEAWAY : OrderType.DINE_IN);
    
    let status: AnalyticsStatus;
    if (dOrder.status === 'Delivered') {
      const hash = dOrder.id.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
      status = (Math.abs(hash) % 100) > 8 ? AnalyticsStatus.VOIDED : AnalyticsStatus.COMPLETED;
    } else {
      status = AnalyticsStatus.PENDING;
    }

    return {
        id: dOrder.displayId, // FIX: Use the human-readable displayId (HBxxxx) for consistency
        timestamp: dOrder.createdAt,
        totalPrice: dOrder.summary?.total || 0,
        items: dOrder.items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            cost: item.price * 0.45, // Simulate cost
            category: getItemCategory(item.name)
        })),
        source: source,
        type: type,
        status: status,
        customerId: dOrder.customer?.phone,
        customerName: dOrder.customer?.name,
        cashierId: source === OrderSource.POS 
            ? `EMP-${(Math.abs((dOrder.id || '').split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0)) % 3) + 1}` 
            : undefined,
        discount: dOrder.summary?.discount || 0,
        preparationTimeSeconds: 240 + Math.floor(Math.random() * 400),
        branchId: 'BR-01',
        isArchived: dOrder.isArchived,
        isEdited: dOrder.isEdited,
    };
};


const OnlineLogRow = React.memo(({ order, onRowClick, onArchive, onRestore, onDelete }: { 
    order: AnalyticsOrder; 
    onRowClick: () => void; 
    onArchive: () => void;
    onRestore: () => void;
    onDelete: () => void; 
}) => {
    return (
        <tr onClick={onRowClick} className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors duration-200 group cursor-pointer rounded-2xl">
            <td className="p-4 font-mono font-bold text-sm text-neo-primary group-hover:text-neo-primary/80">{order.id}</td>
            <td className="p-4 text-sm font-semibold text-gray-200">{order.customerName}</td>
            <td className="p-4 text-xs text-gray-400 font-mono tracking-wide">{new Date(order.timestamp).toLocaleString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric', hour:'2-digit', minute: '2-digit' })}</td>
            <td className="p-4 font-mono font-bold text-sm text-emerald-400">{(order.totalPrice || 0).toFixed(2)} ج.م</td>
            <td className={`p-4 font-mono font-bold text-sm ${(order.discount || 0) > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {(order.discount || 0) > 0 ? `${(order.discount || 0).toFixed(2)} ج.م` : '-'}
            </td>
             <td className="p-4 text-center">
                {order.isArchived ? (
                    <div className="flex items-center justify-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); onRestore(); }} title="استعادة" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                            <RefreshCcw className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="حذف نهائي" className="text-red-400 hover:text-red-300 transition-colors">
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); onArchive(); }} title="أرشفة" className="text-amber-400 hover:text-amber-300 transition-colors">
                            <Archive className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="حذف نهائي" className="text-red-400 hover:text-red-300 transition-colors">
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </td>
        </tr>
    );
});

const ITEMS_PER_LOAD = 30;

const OnlineLogPage: React.FC<{ onBack: () => void; }> = ({ onBack }) => {
    const [allAnalyticsOrders, setAllAnalyticsOrders] = useState<AnalyticsOrder[]>([]);
    const [allDashboardOrders, setAllDashboardOrders] = useState<DashboardOrder[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(ITEMS_PER_LOAD);
    const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(null);
    const [orderToDelete, setOrderToDelete] = useState<AnalyticsOrder | null>(null);
    const { currentUser } = useAuth();
    const { showToast } = useDashboard();
    const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
    const [isDeletingAll, setIsDeletingAll] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    
    useEffect(() => {
        const unsubscribe = dashboardOrderService.subscribe((liveOrders) => {
            setAllDashboardOrders(liveOrders);
            const analyticsOrders = liveOrders.map(transformDashboardOrderToAnalyticsOrder);
            setAllAnalyticsOrders(analyticsOrders);
        });
        return () => unsubscribe();
    }, []);
    
    const { activeOrders, archivedOrders } = useMemo(() => {
        // FIX: The core logic change. Filter by `source` instead of `type`.
        const online = allAnalyticsOrders.filter(order => order.source === OrderSource.ONLINE).sort((a, b) => b.timestamp - a.timestamp);
        return {
            activeOrders: online.filter(o => !o.isArchived),
            archivedOrders: online.filter(o => o.isArchived),
        };
    }, [allAnalyticsOrders]);

    const filteredLogs = useMemo(() => {
        const source = activeTab === 'active' ? activeOrders : archivedOrders;
        if (!searchTerm) return source;
        const term = searchTerm.toLowerCase();
        return source.filter(log =>
            log.customerName?.toLowerCase().includes(term) ||
            log.id?.toLowerCase().includes(term)
        );
    }, [activeOrders, archivedOrders, searchTerm, activeTab]);
    
    useEffect(() => {
        setVisibleCount(ITEMS_PER_LOAD);
    }, [activeTab, searchTerm]);

    const visibleLogs = useMemo(() => {
        return filteredLogs.slice(0, visibleCount);
    }, [filteredLogs, visibleCount]);
    
    // FIX: This function now correctly finds the original order by matching the `displayId`.
    const findOriginalId = (displayId: string): string | null => {
        const dashboardOrder = allDashboardOrders.find(o => o.displayId === displayId);
        return dashboardOrder ? dashboardOrder.id : null;
    };

    const handleArchive = async (displayId: string) => {
        const originalId = findOriginalId(displayId);
        if (!originalId) return;
        await dashboardOrderService.archiveOrder(originalId);
        showToast({ message: 'تمت أرشفة الطلب بنجاح.', type: 'success' });
    };

    const handleRestore = async (displayId: string) => {
        const originalId = findOriginalId(displayId);
        if (!originalId) return;
        await dashboardOrderService.unarchiveOrder(originalId);
        showToast({ message: 'تمت استعادة الطلب.', type: 'success' });
    };

    const handleConfirmDelete = async () => {
        if (!orderToDelete || !currentUser) return;
        const originalId = findOriginalId(orderToDelete.id);
        if (!originalId) {
            showToast({ message: 'خطأ: لم يتم العثور على الطلب.', type: 'error' });
            setOrderToDelete(null);
            return;
        }
        // FIX: Log the void action before deleting, and call deleteOrder with the correct arguments.
        const orderForLog = allDashboardOrders.find(o => o.id === originalId);
        if (orderForLog) {
            loggingService.log(currentUser.id, currentUser.username, LogActionType.ORDER_VOIDED, { orderId: orderForLog.id, details: { total: orderForLog.summary?.total || 0 }});
        }
        await dashboardOrderService.deleteOrder(originalId);
        showToast({ message: 'تم حذف الطلب نهائياً.', type: 'success' });
        setOrderToDelete(null);
    };

     const handleConfirmDeleteAll = async () => {
        if (!currentUser || filteredLogs.length === 0 || activeTab !== 'archived') return;
        setIsDeletingAll(true);
        const orderIdsToDelete = filteredLogs.map(log => findOriginalId(log.id)).filter((id): id is string => !!id);
        
        if (orderIdsToDelete.length > 0) {
            // FIX: Log each deletion and call the service method with the correct arguments.
            const ordersForLog = allDashboardOrders.filter(o => orderIdsToDelete.includes(o.id));
            for (const order of ordersForLog) {
                loggingService.log(currentUser.id, currentUser.username, LogActionType.ORDER_VOIDED, { orderId: order.id, details: { total: order.summary?.total || 0 }});
            }
            await dashboardOrderService.deleteMultipleOrders(orderIdsToDelete);
        }

        showToast({ message: 'تم حذف جميع السجلات المؤرشفة المعروضة بنجاح.', type: 'success' });
        setShowDeleteAllModal(false);
        setIsDeletingAll(false);
    };

    const handleRowClick = (analyticsOrder: AnalyticsOrder) => {
        const originalId = findOriginalId(analyticsOrder.id);
        if (!originalId) return;
        const fullOrder = allDashboardOrders.find(o => o.id === originalId);
        if (fullOrder) {
            setSelectedOrder(fullOrder);
        }
    };
     
    return (
        <>
            <div className="animate-fade-in space-y-6 h-full flex flex-col">
                <header className="flex-shrink-0 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black text-white font-cairo">سجل طلبات الأونلاين</h1>
                        <p className="text-lg text-gray-400">عرض وإدارة جميع الطلبات المسجلة عبر الموقع.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <ConnectivityBadge variant="dark" />
                        <button
                            onClick={onBack}
                            className="relative transition-all duration-300 ease-in-out w-11 h-11 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg text-gray-300 hover:bg-white/20"
                            title="العودة"
                        >
                            <ArrowLeftOnRectangleIcon className="w-6 h-6" />
                        </button>
                    </div>
                </header>

                <div className="flex-grow bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.3)] relative flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-30 pointer-events-none" />

                    <div className="p-4 border-b border-white/10 relative z-10 flex flex-col md:flex-row items-center gap-4">
                        <div className="flex items-center gap-2 bg-black/30 p-1 rounded-lg">
                            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors whitespace-nowrap ${activeTab === 'active' ? 'bg-neo-primary text-white' : 'text-gray-300 hover:bg-white/10'}`}>الطلبات النشطة ({activeOrders.length})</button>
                            <button onClick={() => setActiveTab('archived')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors whitespace-nowrap ${activeTab === 'archived' ? 'bg-neo-primary text-white' : 'text-gray-300 hover:bg-white/10'}`}>الأرشيف ({archivedOrders.length})</button>
                        </div>
                        <div className="relative flex-grow w-full">
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                <SearchIcon className="w-5 h-5" />
                            </div>
                            <input
                                type="search"
                                placeholder="ابحث باسم العميل أو رقم الطلب..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pr-10 pl-4 py-2.5 bg-black/40 border border-white/10 text-white rounded-xl focus:outline-none focus:border-neo-primary/50 focus:bg-black/60 transition-all placeholder-gray-600"
                            />
                        </div>
                         {activeTab === 'archived' && filteredLogs.length > 0 && (
                            <button
                                onClick={() => setShowDeleteAllModal(true)}
                                className="flex-shrink-0 flex items-center gap-2 h-11 px-4 text-sm font-bold rounded-xl transition-all bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                title="حذف جميع السجلات المؤرشفة"
                            >
                                <TrashIcon className="w-4 h-4" />
                                <span>حذف الكل</span>
                            </button>
                        )}
                    </div>

                    {filteredLogs.length === 0 ? (
                        <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500 p-8">
                            <ReceiptIcon className="w-16 h-16 mb-4 text-gray-600" />
                            <p className="text-xl font-bold text-gray-400">لا توجد سجلات لعرضها.</p>
                        </div>
                    ) : (
                        <div className="relative z-10 flex-grow overflow-y-auto custom-scrollbar">
                            <table className="w-full text-right min-w-[700px]">
                                <thead className="text-gray-400 text-xs font-bold uppercase bg-black/20 tracking-wider sticky top-0 backdrop-blur-sm">
                                    <tr>
                                        <th className="p-4">رقم الطلب</th>
                                        <th className="p-4">العميل</th>
                                        <th className="p-4">الوقت</th>
                                        <th className="p-4">الإجمالي</th>
                                        <th className="p-4">الخصم</th>
                                        <th className="p-4 text-center">إجراء</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleLogs.map(log => (
                                        <OnlineLogRow 
                                            key={log.id} 
                                            order={log} 
                                            onRowClick={() => handleRowClick(log)} 
                                            onArchive={() => handleArchive(log.id)}
                                            onRestore={() => handleRestore(log.id)}
                                            onDelete={() => setOrderToDelete(log)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    {visibleCount < filteredLogs.length && (
                         <div className="flex-shrink-0 p-4 border-t border-white/10 flex justify-center items-center bg-black/10">
                            <button 
                                onClick={() => setVisibleCount(prev => prev + ITEMS_PER_LOAD)}
                                className="px-8 py-2.5 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition-colors shadow-lg shadow-neo-primary/50"
                            >
                                تحميل المزيد
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <OrderDetailsModal
                isOpen={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                order={selectedOrder}
                currentUser={currentUser}
                allowEdit={false}
                isVoidView={true} // Re-using this to hide print/edit actions
                modalTitle="تفاصيل الطلب"
            />
             <DeleteConfirmationModal
                isOpen={!!orderToDelete}
                onClose={() => setOrderToDelete(null)}
                onConfirm={handleConfirmDelete}
                title={`حذف الطلب "${orderToDelete?.id}" نهائياً`}
                message="هل أنت متأكد من حذف هذا الطلب بشكل دائم؟ لا يمكن التراجع عن هذا الإجراء."
                isDeleting={false}
            />
            <DeleteConfirmationModal
                isOpen={showDeleteAllModal}
                onClose={() => setShowDeleteAllModal(false)}
                onConfirm={handleConfirmDeleteAll}
                title={`حذف جميع السجلات المؤرشفة (${filteredLogs.length})`}
                message="هل أنت متأكد من حذف جميع السجلات المعروضة في الأرشيف بشكل دائم؟ لا يمكن التراجع عن هذا الإجراء."
                isDeleting={isDeletingAll}
            />
        </>
    );
};

export default OnlineLogPage;