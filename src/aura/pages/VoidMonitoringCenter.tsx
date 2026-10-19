import React, { useState, useEffect } from 'react';
import { LogEntry, LogActionType, User } from '../../types';
import { loggingService } from '../../services/loggingService';
import { useDashboard } from '../../components/dashboard/DashboardContext';
import { 
    ArrowLeftOnRectangleIcon,
    ShieldExclamationIcon,
    SpinnerIcon,
    FileXIcon,
    TrashIcon,
} from '../../components/dashboard/Icons';
import DeleteConfirmationModal from '../../components/dashboard/ui/DeleteConfirmationModal';
import OrderDetailsModal from '../../components/dashboard/ui/OrderDetailsModal';
import { Order as DashboardOrder } from '../../components/dashboard/dashboardTypes';
import { useAuth } from '../../contexts/AuthContext';
import VoidAuthModal from '../../components/dashboard/ui/VoidAuthModal';
import { fetchUsers } from '../../components/dashboard/services/userService';


// Helper to convert log entry to a format OrderDetailsModal can understand
const logToOrderAdapter = (log: LogEntry): DashboardOrder | null => {
    if (!log.details || !log.orderId) return null;
    const { details } = log;
    return {
        id: log.orderId,
        // FIX: Use the human-readable displayId from the details, fallback to the log's key.
        displayId: details.displayId || log.orderId,
        createdAt: log.timestamp,
        customer: details.customer || { name: 'غير معروف', phone: '-', address: '-' },
        items: details.items || [],
        summary: {
            subtotal: details.subtotal || 0,
            deliveryFee: details.deliveryFee || 0,
            discount: details.discount || 0,
            total: details.total || 0,
        },
        status: 'Delivered', // Dummy status, as it's a void log
        deliveryMethod: details.type === 'DELIVERY' ? 'delivery' : 'pickup',
        paymentMethod: details.paymentMethod || 'cash',
        isEdited: details.isEdited,
    };
};


// --- Main Page Component ---
const VoidMonitoringCenter: React.FC<{ onExit: () => void; }> = ({ onExit }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
    const [showClearModal, setShowClearModal] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const { showToast } = useDashboard();
    const { currentUser } = useAuth();

    // States for auth modal & lockout
    const [isVoidAuthOpen, setIsVoidAuthOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState<string | null>(null);
    const [failedClearAttempts, setFailedClearAttempts] = useState(0);
    const [clearLockoutEndTime, setClearLockoutEndTime] = useState(0);
    const [clearLockoutLevel, setClearLockoutLevel] = useState(0);


    useEffect(() => {
        setLoading(true);
        const unsubscribe = loggingService.subscribe((allLogs) => {
            const voidLogs = allLogs.filter(log => (log.action === LogActionType.ORDER_VOIDED || log.action === LogActionType.ORDER_VOID_ATTEMPT) && !log.isArchived);
            setLogs(voidLogs);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    useEffect(() => {
        if (currentUser?.accessLevel === 'Cashier' && !adminPassword) {
            fetchUsers().then(users => {
                const admin = users.find(u => u.accessLevel === 'Admin');
                if (admin && admin.password) {
                    setAdminPassword(admin.password);
                }
            });
        }
    }, [currentUser, adminPassword]);

    const handleClearAll = async () => {
        setIsClearing(true);
        await loggingService.archiveAllVoidLogs();
        showToast({ message: "تم مسح وأرشفة جميع السجلات بنجاح.", type: "success" });
        setShowClearModal(false);
        setIsClearing(false);
    };
    
    const requestClearAll = () => {
        if (clearLockoutEndTime > Date.now()) {
            const remaining = Math.ceil((clearLockoutEndTime - Date.now()) / 1000);
            showToast({
                message: `الإجراء مقفل. يرجى الانتظار ${remaining} ثانية.`,
                type: 'error',
            });
            return;
        }

        if (currentUser?.accessLevel === 'Admin') {
            setShowClearModal(true);
        } else {
            setIsVoidAuthOpen(true);
        }
    };


    const isSuccess = selectedLog?.action === LogActionType.ORDER_VOIDED;

    return (
        <>
            <div className="flex flex-col h-screen overflow-hidden text-neo-secondary font-sans bg-neo-bg" dir="rtl">
                {/* Header */}
                 <header className="flex-shrink-0 bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-neo-soft-gray sticky top-0 z-30">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 flex items-center justify-center bg-rose-100 rounded-xl border border-rose-200">
                            <ShieldExclamationIcon className="w-6 h-6 text-rose-500" />
                        </div>
                        <div>
                            <h1 className="text-xl font-extrabold text-neo-secondary">مركز مراقبة الإلغاءات</h1>
                            <p className="text-sm text-neo-secondary/60 font-medium">سجل مباشر لمحاولات إلغاء الطلبات</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {logs.length > 0 && (
                             <button
                                onClick={requestClearAll}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group bg-red-500/10 hover:bg-red-500/20"
                                title="مسح وأرشفة جميع السجلات"
                            >
                                <TrashIcon className="w-6 h-6 text-red-400 group-hover:scale-110 transition-transform" />
                            </button>
                        )}
                        <button
                            onClick={onExit}
                            className="relative transition-all duration-300 ease-in-out w-11 h-11 flex items-center justify-center rounded-full bg-white/60 backdrop-blur-md border border-gray-900/10 shadow-md text-gray-700 hover:bg-white/90"
                            title="العودة للوحة التحكم"
                        >
                            <ArrowLeftOnRectangleIcon className="w-6 h-6 text-neo-secondary/80" />
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6">
                     <div className="max-w-7xl mx-auto">
                        {loading ? (
                            <div className="flex h-full items-center justify-center p-20"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>
                        ) : logs.length === 0 ? (
                            <div className="text-center text-gray-500 py-20 bg-white rounded-xl border border-neo-soft-gray shadow-sm">
                                <FileXIcon className="w-16 h-16 mx-auto mb-4 text-gray-400"/>
                                <p className="text-xl font-bold">لا توجد سجلات إلغاء</p>
                                <p className="text-sm mt-1">لم يتم تسجيل أي محاولات إلغاء مؤخراً.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {logs.map((log) => {
                                    const isAttempt = log.action === LogActionType.ORDER_VOID_ATTEMPT;
                                    const title = isAttempt ? 'محاولة إلغاء فاشلة' : 'إلغاء طلب ناجح';
                                    const Icon = isAttempt ? ShieldExclamationIcon : FileXIcon;
                                    const bgColor = isAttempt ? 'bg-amber-100' : 'bg-red-100';
                                    const textColor = isAttempt ? 'text-amber-600' : 'text-red-600';
                                    const hoverBorderColor = isAttempt ? 'hover:border-amber-400' : 'hover:border-red-400';

                                    return (
                                        <div 
                                            key={log.id} 
                                            onClick={() => setSelectedLog(log)}
                                            className={`bg-white rounded-2xl shadow-md border-2 border-transparent transition-all duration-300 ${hoverBorderColor} cursor-pointer group hover:-translate-y-1`}
                                        >
                                            <div className="p-5">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl ${bgColor}`}>
                                                            <Icon className={`w-6 h-6 ${textColor}`}/>
                                                        </div>
                                                        <div>
                                                            <p className={`font-bold text-base ${textColor}`}>
                                                                {title}
                                                            </p>
                                                            <div className="mt-1 flex items-center gap-2 text-sm text-neo-secondary/70">
                                                                <span>بواسطة:</span>
                                                                <strong className="font-bold text-neo-secondary">{log.cashierName}</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end flex-shrink-0">
                                                        <p className={`font-bold text-xl mb-1 font-mono ${textColor}`}>{log.details?.total?.toFixed(2) || '0.00'}</p>
                                                        <span className="text-xs text-neo-secondary/50 font-mono">{new Date(log.timestamp).toLocaleTimeString('ar-EG')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <OrderDetailsModal
                isOpen={!!selectedLog}
                onClose={() => setSelectedLog(null)}
                order={selectedLog ? logToOrderAdapter(selectedLog) : null}
                currentUser={currentUser}
                allowEdit={false}
                isVoidView={true}
                modalTitle={isSuccess ? 'إلغاء طلب ناجح' : 'محاولة إلغاء فاشلة'}
                approvingManager={isSuccess ? selectedLog?.cashierName : undefined}
            />

            <DeleteConfirmationModal
                isOpen={showClearModal}
                onClose={() => setShowClearModal(false)}
                onConfirm={handleClearAll}
                title="مسح وأرشفة جميع سجلات الإلغاء"
                message="هل أنت متأكد؟ سيتم نقل جميع السجلات المعروضة إلى أرشيف الإلغاءات في صفحة الإحصائيات."
                isDeleting={isClearing}
            />
             <VoidAuthModal
                isOpen={isVoidAuthOpen}
                onClose={() => setIsVoidAuthOpen(false)}
                passwordToCheck={adminPassword || ''}
                onSuccess={() => {
                    setFailedClearAttempts(0);
                    setClearLockoutLevel(0);
                    setClearLockoutEndTime(0);
                    setIsVoidAuthOpen(false);
                    handleClearAll();
                }}
                onFailure={() => {
                    if (currentUser) {
                        loggingService.log(
                            currentUser.id,
                            currentUser.username,
                            LogActionType.ORDER_VOID_ATTEMPT,
                            {
                                details: { attemptedAction: 'CLEAR_VOID_LOGS_ARCHIVE' }
                            }
                        );
                    }
                    const newAttempts = failedClearAttempts + 1;
                    setFailedClearAttempts(newAttempts);

                    if (newAttempts >= 3) {
                        const newLockoutLevel = clearLockoutLevel + 1;
                        const durationSeconds = 30 * Math.pow(2, newLockoutLevel - 1);
                        
                        setClearLockoutLevel(newLockoutLevel);
                        setClearLockoutEndTime(Date.now() + durationSeconds * 1000);
                        setFailedClearAttempts(0);
                        
                        showToast({
                            message: `تم قفل الإجراء مؤقتاً لمدة ${durationSeconds} ثانية.`,
                            type: 'error',
                        });
                        setIsVoidAuthOpen(false);
                    }
                }}
            />
        </>
    );
};

export default VoidMonitoringCenter;