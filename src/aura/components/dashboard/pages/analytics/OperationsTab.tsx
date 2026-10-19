import React, { useMemo } from 'react';
import { Order, OrderStatus, OrderType } from '../../../../types';
import StatCard from '../../../StatCard';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Users, DollarSign, ClipboardList, MousePointerClick, Receipt, ArrowLeft } from 'lucide-react';

interface OnlineViewProps {
  orders: Order[];
  onNavigateToOnlineLog: () => void;
}

const OperationsTab: React.FC<OnlineViewProps> = ({ orders, onNavigateToOnlineLog }) => {
  const metrics = useMemo(() => {
    const completedOrders = orders.filter(o => o.status === OrderStatus.COMPLETED);
    const totalSales = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const orderCount = completedOrders.length;
    const deliveryOrders = completedOrders.filter(o => o.type === OrderType.DELIVERY).length;
    const takeawayOrders = completedOrders.filter(o => o.type === OrderType.TAKEAWAY).length;

    return {
      totalSales,
      orderCount,
      deliveryOrders,
      takeawayOrders,
    };
  }, [orders]);

  const orderTypeData = [
    { name: 'توصيل', value: metrics.deliveryOrders, color: '#f97316' },
    { name: 'استلام', value: metrics.takeawayOrders, color: '#2dd4bf' },
  ];

  const salesTrendData = useMemo(() => {
    const dataByDay: { [key: string]: { date: string, sales: number } } = {};
    orders.forEach(order => {
        if (order.status !== OrderStatus.COMPLETED) return;
        const date = new Date(order.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        if (!dataByDay[date]) {
            dataByDay[date] = { date, sales: 0 };
        }
        dataByDay[date].sales += order.totalPrice;
    });
    return Object.values(dataByDay).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [orders]);

  if (orders.length === 0) {
    return <div className="p-10 text-center text-gray-400 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl">لا توجد بيانات مطابقة للفلتر المحدد.</div>;
  }


  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
        <StatCard 
          title="مبيعات الأونلاين" 
          value={`${metrics.totalSales.toLocaleString('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 })}`}
          icon={<DollarSign size={20} />}
        />
        <StatCard 
          title="طلبات الأونلاين" 
          value={metrics.orderCount.toLocaleString('ar-EG')} 
          icon={<ClipboardList size={20} />}
        />
      </div>

      {/* Online Log Navigation Card */}
       <div className="bg-gradient-to-br from-neo-primary/40 to-black/30 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.3)] relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-neo-primary/20 border border-neo-primary/30 flex items-center justify-center text-neo-primary">
                  <Receipt size={32} />
              </div>
              <div>
                  <h3 className="text-xl font-bold text-white font-cairo">سجل طلبات الأونلاين</h3>
                  <p className="text-gray-400 mt-1">عرض وتفصيل جميع الطلبات التي تم إنشاؤها عبر الموقع.</p>
              </div>
          </div>
          <button
              onClick={onNavigateToOnlineLog}
              className="flex-shrink-0 flex items-center gap-2 h-12 px-6 text-base font-bold rounded-xl transition-all bg-neo-primary text-white hover:bg-neo-accent shadow-lg shadow-neo-primary/50 border border-neo-primary/50 transform hover:scale-105"
          >
              <span>فتح السجل الكامل</span>
              <ArrowLeft className="w-5 h-5" />
          </button>
      </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.3)] relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50 pointer-events-none" />
           <div className="relative z-10">
               <h3 className="text-xl font-bold text-white font-cairo mb-4">اتجاه المبيعات الأونلاين</h3>
               <div className="h-80" dir="ltr">
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesTrendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <defs>
                            <linearGradient id="onlineSalesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickFormatter={(value) => `${value.toLocaleString()}`} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ background: 'rgba(20,20,20,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', textAlign: 'right', backdropFilter: 'blur(10px)' }} 
                          formatter={(value: number) => [`${value.toLocaleString('ar-EG')} ج.م`, 'المبيعات']} 
                        />
                        <Area type="monotone" dataKey="sales" stroke="#2dd4bf" strokeWidth={3} fillOpacity={1} fill="url(#onlineSalesGradient)" />
                    </AreaChart>
                </ResponsiveContainer>
               </div>
           </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.3)] flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-bl from-white/5 to-transparent opacity-50 pointer-events-none" />
            <div className="relative z-10 flex flex-col h-full">
                <h3 className="text-xl font-bold text-white font-cairo mb-4">أنواع الطلبات الأونلاين</h3>
                <div className="flex-grow h-80" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <Pie data={orderTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} stroke="none">
                              {orderTypeData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(value: number) => [value, 'عدد الطلبات']} contentStyle={{ background: 'rgba(20,20,20,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}/>
                          <Legend iconType="circle" />
                      </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                    <h4 className="text-teal-300 font-bold text-sm mb-1 flex items-center gap-2">💡 استشارة تسويقية</h4>
                    <p className="text-sm text-gray-300 leading-relaxed">نسبة طلبات التوصيل مرتفعة. فكّر في إنشاء عروض خاصة بالاستلام من الفرع لزيادة حركة المرور داخل المطعم.</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default OperationsTab;