


import React, { useMemo, useState, useEffect } from 'react';
import { Order, OrderStatus } from '../../../../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ClipboardList, TrendingUp, Activity, AlertTriangle } from 'lucide-react';
import { useBranding } from '../../../../contexts/BrandingContext';
import { fraudDetectionService } from '../../../../services/fraudDetectionService';
import { aiAnalyticsService } from '../../../../services/aiAnalyticsService';

interface CombinedViewProps {
  allOrders: Order[];
}

// Compact Stat Card Component
const CompactStatCard: React.FC<{ title: string; value: string; subValue?: string; icon: React.ReactNode; trend?: 'up' | 'down' }> = ({ title, value, subValue, icon, trend }) => (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors group">
        <div>
            <p className="text-sm text-gray-400 font-medium mb-1">{title}</p>
            <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
                {subValue && <span className={`text-sm font-bold ${trend === 'down' ? 'text-red-400' : 'text-emerald-400'}`}>{subValue}</span>}
            </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-gray-300 group-hover:text-neo-primary group-hover:scale-110 transition-all shadow-inner">
            {icon}
        </div>
    </div>
);

const LocalAnalyticsSummary: React.FC<{ allOrders: Order[], totalSales: number }> = ({ allOrders, totalSales }) => {
    const [topItem, setTopItem] = useState<{name: string, count: number} | null>(null);
    const [topCashier, setTopCashier] = useState<{name: string, sales: number} | null>(null);
    const [criticalAlert, setCriticalAlert] = useState<any>(null);

    useEffect(() => {
        // Calculate Top Item
        const itemCounts: Record<string, number> = {};
        const cashierSales: Record<string, number> = {};

        allOrders.forEach(order => {
            if (order.status !== OrderStatus.COMPLETED) return;
            
            // Cashier stats
            const cashier = order.cashierName || 'غير معروف';
            if (!cashierSales[cashier]) cashierSales[cashier] = 0;
            cashierSales[cashier] += order.totalPrice;

            // Item stats
            order.items.forEach(item => {
                if (!itemCounts[item.name]) itemCounts[item.name] = 0;
                itemCounts[item.name] += item.quantity;
            });
        });

        // Get Top Item
        let topI = null;
        let maxCount = 0;
        for (const [name, count] of Object.entries(itemCounts)) {
            if (count > maxCount) { maxCount = count; topI = name; }
        }
        if (topI) setTopItem({ name: topI, count: maxCount });

        // Get Top Cashier
        let topC = null;
        let maxSales = 0;
        for (const [name, sales] of Object.entries(cashierSales)) {
            if (sales > maxSales) { maxSales = sales; topC = name; }
        }
        if (topC) setTopCashier({ name: topC, sales: maxSales });

        // Check for AI Alerts
        const frauds = fraudDetectionService.getAlerts().filter(a => !a.isResolved);
        if (frauds.length > 0) {
            setCriticalAlert(frauds[0]);
        } else {
            const aiAlerts = aiAnalyticsService.getSmartNotifications().filter(a => !a.isRead);
            if (aiAlerts.length > 0) {
                setCriticalAlert(aiAlerts[0]);
            }
        }


    }, [allOrders]);

    return (
        <div className="bg-gradient-to-r from-neo-primary/10 via-white/5 to-transparent border border-neo-primary/20 rounded-2xl p-6 mb-6 shadow-[0_0_20px_rgba(var(--neo-primary-rgb),0.1)] relative overflow-hidden">
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-neo-primary/20 blur-3xl rounded-full"></div>
            
            <div className="flex items-start gap-4 relative z-10">
                <div className="w-12 h-12 rounded-xl bg-neo-primary/20 flex items-center justify-center text-neo-primary border border-neo-primary/30 flex-shrink-0 relative">
                   <div className="absolute inset-0 bg-neo-primary/20 rounded-xl animate-ping opacity-50"></div>
                   <Activity className="w-6 h-6" />
                </div>
                
                <div className="flex-grow">
                    <h2 className="text-xl font-bold text-white mb-1">
                        ملخص أداء اليوم
                    </h2>
                    <div className="mb-4">
                      <p className="text-gray-400 text-xs leading-relaxed max-w-3xl">
                          ملخص الأرقام: حققنا إيرادات بقيمة <strong className="text-emerald-400">{totalSales.toLocaleString('ar-EG')} ج.م</strong>. 
                          {topItem ? <span> نجم المبيعات اليوم: <strong>{topItem.name}</strong> ({topItem.count} طلب). </span> : null}
                          {topCashier ? <span> الكاشير <strong>{topCashier.name}</strong> الأفضل أداءً بمبيعات ({topCashier.sales.toLocaleString('ar-EG')} ج.م).</span> : null}
                      </p>
                    </div>

                    {criticalAlert && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex flex-col sm:flex-row items-center sm:items-start gap-3 w-full max-w-2xl">
                            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-red-400 font-bold text-sm">ملاحظة هامة تتطلب تدخلك:</h4>
                                <p className="text-gray-300 text-sm mt-1">{criticalAlert.description || criticalAlert.title + ' - ' + criticalAlert.message}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const OverviewTab: React.FC<CombinedViewProps> = ({ allOrders }) => {
  const { primaryColor, logoUrl } = useBranding();

  const metrics = useMemo(() => {
    const completedOrders = allOrders.filter(o => o.status === OrderStatus.COMPLETED);
    const totalSales = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const orderCount = completedOrders.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;
    
    // Calculate simple trend (mock logic for demo)
    const trend = totalSales > 5000 ? '+12%' : '-5%';
    const trendDir = totalSales > 5000 ? 'up' : 'down';

    return {
      totalSales,
      orderCount,
      avgOrderValue,
      trend,
      trendDir
    };
  }, [allOrders]);

  const chartData = useMemo(() => {
    const dataMap: Record<string, { date: string; sales: number; orders: number }> = {};
    
    const sortedOrders = [...allOrders].sort((a, b) => a.timestamp - b.timestamp);

    sortedOrders.forEach(order => {
        if (order.status !== OrderStatus.COMPLETED) return;
        const dateKey = new Date(order.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        
        if (!dataMap[dateKey]) {
            dataMap[dateKey] = { date: dateKey, sales: 0, orders: 0 };
        }
        dataMap[dateKey].sales += order.totalPrice;
        dataMap[dateKey].orders += 1;
    });

    return Object.values(dataMap);
  }, [allOrders]);

  if (allOrders.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
            <Activity className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm font-bold">لا توجد بيانات كافية للعرض.</p>
        </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <LocalAnalyticsSummary allOrders={allOrders} totalSales={metrics.totalSales} />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <CompactStatCard 
            title="إجمالي الإيرادات" 
            value={metrics.totalSales.toLocaleString('ar-EG') + ' ج.م'} 
            subValue={metrics.trend}
            trend={metrics.trendDir as any}
            icon={<DollarSign size={20} />} 
        />
        <CompactStatCard 
            title="عدد الطلبات المكتملة" 
            value={metrics.orderCount.toString()} 
            subValue="+3 طلب"
            trend="up"
            icon={<ClipboardList size={20} />} 
        />
        <CompactStatCard 
            title="متوسط قيمة الطلب" 
            value={Math.round(metrics.avgOrderValue) + ' ج.م'} 
            icon={<TrendingUp size={20} />} 
        />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col relative overflow-hidden h-[380px]">
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ background: `linear-gradient(to bottom right, ${primaryColor}, transparent)` }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
              <img src={logoUrl} alt="" className="w-64 h-64 grayscale contrast-200" />
          </div>
          <div className="flex justify-between items-center mb-6 relative z-10">
              <h3 className="font-bold text-white text-lg font-cairo">تحليل المبيعات اليومية</h3>
              <div className="flex gap-2">
                  <span className="text-xs px-2 py-1 rounded border" style={{ backgroundColor: `${primaryColor}33`, color: primaryColor, borderColor: `${primaryColor}4D` }}>الإيرادات</span>
              </div>
          </div>
          <div className="flex-grow w-full h-full min-h-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                      <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={primaryColor} stopOpacity={0}/>
                          </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis 
                          dataKey="date" 
                          stroke="#64748b" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickMargin={10}
                      />
                      <YAxis 
                          stroke="#64748b" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(val) => `${val}`}
                      />
                      <Tooltip 
                          contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(value: number) => [`${value.toLocaleString()} ج.م`, 'المبيعات']}
                      />
                      <Area 
                          type="monotone" 
                          dataKey="sales" 
                          stroke={primaryColor} 
                          strokeWidth={3} 
                          fillOpacity={1} 
                          fill="url(#colorSales)" 
                          activeDot={{ r: 6, fill: primaryColor, strokeWidth: 0 }}
                      />
                  </AreaChart>
              </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
};

export default OverviewTab;
