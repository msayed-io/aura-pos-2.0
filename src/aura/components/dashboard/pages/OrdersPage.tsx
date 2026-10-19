import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { dashboardOrderService } from '../services/dashboardOrderService';
import type { Order } from '../dashboardTypes';
import OrderCard from '../ui/OrderCard';
import { SpinnerIcon, TrashIcon } from '../Icons';
import { useDashboard } from '../DashboardContext';
import OrderDetailsModal from '../ui/OrderDetailsModal';
import { printOrderInvoice } from '../../../services/printingService';
import { useAuth } from '../../../contexts/AuthContext';
import { User, LogActionType } from '../../../types';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';
import { useBranding } from '../../../contexts/BrandingContext';
import VoidAuthModal from '../ui/VoidAuthModal';
import { fetchUsers } from '../services/userService';
import { loggingService } from '../../../services/loggingService';
import { BookOpen, FileText } from 'lucide-react';

interface OrdersPageProps {
    searchQuery: string;
    orderTypeToShow?: 'all' | 'reservations';
}


const OrdersPage: React.FC<OrdersPageProps> = ({ searchQuery, orderTypeToShow }) => {
    const [allOrders, setAllOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    
    const { showToast } = useDashboard();
    const { currentUser } = useAuth();
    const { logoUrl } = useBranding();
    
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
    const knownOrderIds = useRef(new Set<string>());
    const [showClearAllModal, setShowClearAllModal] = useState(false);

    const [isArchiveAuthOpen, setIsArchiveAuthOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState<string | null>(null);
    const [failedArchiveAttempts, setFailedArchiveAttempts] = useState(0);
    const [archiveLockoutEndTime, setArchiveLockoutEndTime] = useState(0);
    const [archiveLockoutLevel, setArchiveLockoutLevel] = useState(0);

    const title = 'الطلبات الحالية';
    const subtitle = 'عرض مباشر للطلبات النشطة';
    const EmptyIcon = <BookOpen className="w-10 h-10 text-neo-secondary/40" /> ;


    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setSelectedOrder(null);
        }
    }, []);
    
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);


    useEffect(() => {
        const unsubscribe = dashboardOrderService.subscribe((liveOrders: Order[]) => {
            if (knownOrderIds.current.size > 0 && liveOrders.length > knownOrderIds.current.size) {
                const newlyReceivedOrders = liveOrders.filter(order => !knownOrderIds.current.has(order.id));
                 if (newlyReceivedOrders.length > 0) {
                    showToast({ message: `تم استلام ${newlyReceivedOrders.length} طلب جديد!`, type: 'info' });
                    const newIds = newlyReceivedOrders.map(o => o.id);
                    setNewOrderIds(prev => new Set([...prev, ...newIds]));
                    
                    const cashierId = currentUser?.id;
                    const cashierName = currentUser?.username || 'System';

                    try {
                        const settingsJSON = localStorage.getItem('hotbroast_notification_settings');
                        if (settingsJSON) {
                            const settings = JSON.parse(settingsJSON);
                            if (settings.isEnabled && settings.soundUrl) {
                                const audio = new Audio(settings.soundUrl);
                                audio.volume = settings.volume / 100;
                                audio.play().catch(error => console.error("Audio playback failed:", error));
                            }
                        }
                    } catch (e) {
                        console.error("Failed to play notification sound:", e);
                    }

                    newlyReceivedOrders.forEach(newOrder => {
                        // Auto print incoming orders as standard restaurant receipts
                        printOrderInvoice(newOrder, 'delivery', logoUrl, cashierId, cashierName);
                        printOrderInvoice(newOrder, 'kitchen', logoUrl, cashierId, cashierName);
                    });

                     newIds.forEach(id => {
                        setTimeout(() => {
                            setNewOrderIds(prev => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                            });
                        }, 5000); 
                    });
                }
            }
            
            liveOrders.forEach(order => knownOrderIds.current.add(order.id));
            setAllOrders(liveOrders);
            setLoading(false);
        });
        
        if (currentUser?.accessLevel === 'Cashier' && !adminPassword) {
            fetchUsers().then(users => {
                const admin = users.find(u => u.accessLevel === 'Admin');
                if (admin && admin.password) {
                    setAdminPassword(admin.password);
                }
            });
        }

        return () => unsubscribe();
    }, [showToast, logoUrl, currentUser, adminPassword]);
    
    const processedOrders = useMemo(() => {
        let activeOrders = allOrders
            .filter(o => !o.isArchived)
            .sort((a, b) => b.createdAt - a.createdAt);

        if (searchQuery.trim() !== '') {
            const term = searchQuery.toLowerCase().trim();
            activeOrders = activeOrders.filter(order => {
                const displayId = (order.displayId || '').toLowerCase();
                const orderDate = new Date(order.createdAt);
                const formattedDate = orderDate.toLocaleDateString('en-CA');
                const formattedTime = orderDate.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: 'numeric', hour12: false });

                return (
                    (order.customer?.name || '').toLowerCase().includes(term) ||
                    (order.customer?.phone || '').includes(term) ||
                    displayId.includes(term.toLowerCase()) ||
                    order.id.toLowerCase().includes(term) ||
                    formattedDate.includes(term) ||
                    formattedTime.includes(term) ||
                    orderDate.toLocaleDateString('ar-EG', { month: 'long' }).toLowerCase().includes(term)
                );
            });
        }
        
        return activeOrders;
    }, [allOrders, searchQuery, orderTypeToShow]);

    const handleArchiveAll = async () => {
        setLoading(true);
        await dashboardOrderService.archiveAllActiveOrders();
        setShowClearAllModal(false);
        showToast({ message: 'تمت أرشفة جميع الطلبات بنجاح.', type: 'success' });
    };

    const requestArchiveAll = () => {
        if (archiveLockoutEndTime > Date.now()) {
            const remaining = Math.ceil((archiveLockoutEndTime - Date.now()) / 1000);
            showToast({
                message: `الإجراء مقفل. يرجى الانتظار ${remaining} ثانية.`,
                type: 'error',
            });
            return;
        }

        if (currentUser?.accessLevel === 'Admin') {
            setShowClearAllModal(true);
        } else {
            setIsArchiveAuthOpen(true);
        }
    };
    
    return (
        <div className="h-full flex flex-col">
            <header className="flex-shrink-0 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                  <div className="space-y-1">
                    <h1 className="text-3xl font-black font-cairo text-neo-secondary tracking-tight">{title}</h1>
                    <p className="text-neo-secondary/50 text-sm font-medium">{subtitle}</p>
                  </div>
              </div>
               {processedOrders.length > 0 && (
                <button
                    onClick={requestArchiveAll}
                    className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 backdrop-blur-sm"
                    title="أرشفة جميع الطلبات الحالية"
                >
                    <TrashIcon className="w-6 h-6 text-red-400 group-hover:scale-110 transition-transform" />
                </button>
               )}
            </header>
            
            <main className="flex-grow overflow-y-auto pb-4 px-1">
                {loading && allOrders.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                        <SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" />
                    </div>
                ) : processedOrders.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center opacity-60">
                         <div className="w-24 h-24 bg-neo-soft-gray rounded-full flex items-center justify-center mb-4">
                            {EmptyIcon}
                         </div>
                        <p className="text-xl font-bold text-neo-secondary/80">
                            {searchQuery ? 'لا توجد نتائج بحث مطابقة' : 'لا توجد طلبات نشطة حالياً'}
                        </p>
                        <p className="text-sm text-neo-secondary/50 mt-1">
                           {searchQuery ? 'جرّب تغيير كلمات البحث.' : 'الطلبات الجديدة ستظهر هنا تلقائياً.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 auto-rows-max">
                        {processedOrders.map(order => (
                            <OrderCard 
                                key={order.id} 
                                order={order} 
                                isNew={newOrderIds.has(order.id)}
                                onViewDetails={() => setSelectedOrder(order)}
                            />
                        ))}
                    </div>
                )}
            </main>

            <OrderDetailsModal
                isOpen={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                order={selectedOrder}
                currentUser={currentUser}
            />

            <DeleteConfirmationModal
                isOpen={showClearAllModal}
                onClose={() => setShowClearAllModal(false)}
                onConfirm={handleArchiveAll}
                title="أرشفة جميع الطلبات النشطة"
                message="هل أنت متأكد من رغبتك في نقل جميع الطلبات الحالية إلى الأرشيف في صفحة الإحصائيات؟"
                isDeleting={loading}
            />

            <VoidAuthModal
                isOpen={isArchiveAuthOpen}
                onClose={() => setIsArchiveAuthOpen(false)}
                passwordToCheck={adminPassword || ''}
                onSuccess={() => {
                    setFailedArchiveAttempts(0);
                    setArchiveLockoutLevel(0);
                    setArchiveLockoutEndTime(0);
                    setIsArchiveAuthOpen(false);
                    handleArchiveAll();
                }}
                onFailure={() => {
                    if (currentUser) {
                        loggingService.log(
                            currentUser.id,
                            currentUser.username,
                            LogActionType.ORDER_VOID_ATTEMPT,
                            {
                                details: { attemptedAction: 'ARCHIVE_ALL_ORDERS' }
                            }
                        );
                    }
                    const newAttempts = failedArchiveAttempts + 1;
                    setFailedArchiveAttempts(newAttempts);

                    if (newAttempts >= 3) {
                        const newLockoutLevel = archiveLockoutLevel + 1;
                        const durationSeconds = 30 * Math.pow(2, newLockoutLevel - 1);
                        
                        setArchiveLockoutLevel(newLockoutLevel);
                        setArchiveLockoutEndTime(Date.now() + durationSeconds * 1000);
                        setFailedArchiveAttempts(0);
                        
                        showToast({
                            message: `تم قفل الإجراء مؤقتاً لمدة ${durationSeconds} ثانية.`,
                            type: 'error',
                        });
                        setIsArchiveAuthOpen(false);
                    }
                }}
            />
        </div>
    );
};

export default OrdersPage;
