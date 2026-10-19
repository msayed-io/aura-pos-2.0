import React, { useState, useEffect, useMemo } from 'react';
import { Coupon, CouponUsageLog } from '../../../../types';
import { couponService } from '../../services/couponService';
import { DollarSign, Ticket, Users, BarChart2, Calendar, FileText } from 'lucide-react';

// --- Reusable Components ---

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-gray-300 shadow-inner">
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400 font-medium mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
        </div>
    </div>
);

const CouponStatusBadge: React.FC<{ coupon: Coupon }> = ({ coupon }) => {
    let status: { text: string; color: string };

    if (!coupon.isActive) {
        status = { text: 'غير نشط', color: 'gray' };
    } else if (coupon.expiresAt && coupon.expiresAt < Date.now()) {
        status = { text: 'منتهي الصلاحية', color: 'red' };
    } else if (coupon.usageLimit !== Infinity && coupon.usageCount >= coupon.usageLimit) {
        status = { text: 'مكتمل الاستخدام', color: 'orange' };
    } else {
        status = { text: 'نشط', color: 'green' };
    }

    const colorClasses = {
        gray: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
        red: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        orange: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };

    return (
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${colorClasses[status.color as keyof typeof colorClasses]}`}>
            {status.text}
        </span>
    );
};

// --- Main Analytics Tab Component ---

const CouponsAnalyticsTab: React.FC = () => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [logs, setLogs] = useState<CouponUsageLog[]>([]);
    const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const fetchAllData = async () => {
            const allLogs = await couponService.getAllLogs();
            const unsubscribe = couponService.subscribe(couponsData => {
                setCoupons(couponsData);
                setLogs(allLogs);
                if (couponsData.length > 0 && !selectedCouponId) {
                    setSelectedCouponId(couponsData[0].id);
                }
                setLoading(false);
            });
            return unsubscribe;
        };
        fetchAllData();
    }, [selectedCouponId]);

    const couponAnalytics = useMemo(() => {
        return coupons.map(coupon => {
            const couponLogs = logs.filter(log => log.couponId === coupon.id);
            const totalDiscount = couponLogs.reduce((sum, log) => sum + log.discountApplied, 0);
            return {
                ...coupon,
                couponLogs,
                totalDiscount,
            };
        }).sort((a,b) => b.totalDiscount - a.totalDiscount);
    }, [coupons, logs]);

    const selectedCouponData = useMemo(() => {
        return couponAnalytics.find(c => c.id === selectedCouponId);
    }, [selectedCouponId, couponAnalytics]);
    
    if (loading) {
        return (
             <div className="h-full flex flex-col items-center justify-center pt-20">
                  <div className="relative w-16 h-16">
                      <div className="absolute inset-0 border-4 border-neo-primary/20 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-neo-primary rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <div className="text-gray-400 font-medium mt-4">جاري تحميل بيانات الكوبونات...</div>
              </div>
        )
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full animate-fade-in">
            {/* Left Panel: Coupon List */}
            <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col h-[calc(100vh-220px)]">
                <h2 className="p-4 text-lg font-bold text-white border-b border-white/10 flex-shrink-0">قائمة الكوبونات</h2>
                <div className="overflow-y-auto custom-scrollbar p-2">
                    {couponAnalytics.map(coupon => (
                        <div 
                            key={coupon.id} 
                            onClick={() => setSelectedCouponId(coupon.id)}
                            className={`p-3 rounded-lg cursor-pointer transition-all duration-200 border-2 ${selectedCouponId === coupon.id ? 'bg-neo-primary/20 border-neo-primary/50' : 'border-transparent hover:bg-white/5'}`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="font-mono font-bold text-lg text-white tracking-widest">{coupon.code}</span>
                                <CouponStatusBadge coupon={coupon} />
                            </div>
                            <div className="flex justify-between items-end mt-2">
                                <div className="text-xs text-gray-400">
                                    <p>الاستخدام: <span className="font-mono font-semibold">{coupon.usageCount} / {coupon.usageLimit === Infinity ? '∞' : coupon.usageLimit}</span></p>
                                </div>
                                <p className="font-mono font-bold text-emerald-400">{coupon.totalDiscount.toFixed(0)} <span className="text-xs text-emerald-500">ج.م</span></p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Panel: Details */}
            <div className="lg:col-span-8 space-y-6 h-[calc(100vh-220px)] flex flex-col">
                {selectedCouponData ? (
                    <>
                        <div className="flex-shrink-0">
                             <h1 className="text-3xl font-black text-white font-cairo">تحليل كوبون: <span className="text-neo-primary font-mono tracking-wider">{selectedCouponData.code}</span></h1>
                             <p className="text-gray-400 mt-1">
                                {selectedCouponData.discountType === 'percentage' ? `خصم بنسبة ${selectedCouponData.discountValue}%` : `خصم ثابت بقيمة ${selectedCouponData.discountValue} ج.م`}
                             </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
                            <StatCard title="إجمالي الخصم" value={`${selectedCouponData.totalDiscount.toFixed(0)} ج.م`} icon={<DollarSign size={20} />} />
                            <StatCard title="عدد مرات الاستخدام" value={selectedCouponData.usageCount.toLocaleString()} icon={<Users size={20} />} />
                            <StatCard title="متوسط الخصم للفاتورة" value={`${(selectedCouponData.usageCount > 0 ? selectedCouponData.totalDiscount / selectedCouponData.usageCount : 0).toFixed(2)} ج.م`} icon={<BarChart2 size={20} />} />
                        </div>
                        
                        <div className="bg-white/5 border border-white/10 rounded-2xl flex flex-col flex-grow min-h-0">
                            <h3 className="p-4 text-base font-bold text-white border-b border-white/10 flex-shrink-0 flex items-center gap-2">
                                <FileText size={18} /> سجل الاستخدام التفصيلي
                            </h3>
                            <div className="overflow-y-auto custom-scrollbar">
                                {selectedCouponData.couponLogs.length > 0 ? (
                                    <table className="w-full text-right">
                                        <thead className="text-gray-400 text-xs font-semibold uppercase sticky top-0 bg-[#101014] z-10">
                                            <tr>
                                                <th className="p-3">العميل</th>
                                                <th className="p-3">رقم الفاتورة</th>
                                                <th className="p-3">تاريخ الاستخدام</th>
                                                <th className="p-3">قيمة الخصم</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {selectedCouponData.couponLogs.map(log => (
                                                <tr key={log.id} className="border-t border-white/5 hover:bg-white/5 rounded-2xl">
                                                    <td className="p-3 text-white font-semibold">{log.customerName}</td>
                                                    <td className="p-3 font-mono text-neo-primary">{log.orderId}</td>
                                                    <td className="p-3 text-gray-400">{new Date(log.timestamp).toLocaleString('ar-EG')}</td>
                                                    <td className="p-3 font-mono font-bold text-rose-400">{log.discountApplied.toFixed(2)} ج.م</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="p-10 text-center text-gray-500">
                                        لم يتم استخدام هذا الكوبون بعد.
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-2xl border border-white/10">
                        <Ticket size={48} className="mb-4 opacity-50"/>
                        <p className="text-lg font-bold">اختر كوبوناً من القائمة</p>
                        <p className="text-sm">لعرض تحليلات الأداء وسجل الاستخدام الخاص به.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CouponsAnalyticsTab;
