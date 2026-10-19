

import React, { useState, useEffect, useMemo } from 'react';
import { Order as AnalyticsOrder, OrderSource } from '../types';
import { dashboardOrderService } from '../components/dashboard/services/dashboardOrderService';
import { transformDashboardOrderToAnalyticsOrder } from '../utils/analyticsUtils';

import OverviewTab from '../components/dashboard/pages/analytics/OverviewTab';
import OperationsTab from '../components/dashboard/pages/analytics/OperationsTab';
import CrmTab from '../components/dashboard/pages/analytics/CrmTab';
import CouponsAnalyticsTab from '../components/dashboard/pages/analytics/CouponsAnalyticsTab';
import ArchivedComplaintsTab from '../components/dashboard/pages/analytics/ArchivedComplaintsTab';
import ExportModal from '../components/ExportModal';
import { ArrowLeftOnRectangleIcon } from '../components/dashboard/Icons';
import { Activity, LineChart, Archive as ArchiveIcon, Contact as AddressBookIcon, Download, Ticket as TicketIcon, Inbox } from 'lucide-react';
import { useDragToScroll } from '../hooks/useDragToScroll';
import DateRangePicker from '../components/DateRangePicker';
import { useBranding } from '../contexts/BrandingContext';
import ConnectivityBadge from '../components/ConnectivityBadge';

type ViewMode = 'combined' | 'online' | 'crm' | 'coupons' | 'complaints_archive';

const AuraAnalytics: React.FC<{ 
  onExit: () => void; 
  onNavigateToOnlineLog: () => void;
}> = ({ onExit, onNavigateToOnlineLog }) => {
  const [view, setView] = useState<ViewMode>('combined');
  const [allOrders, setAllOrders] = useState<AnalyticsOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const scrollNavRef = useDragToScroll<HTMLDivElement>();
  const { logoUrl } = useBranding();
  
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
      start: new Date(new Date().setDate(new Date().getDate() - 6)),
      end: new Date(),
  });
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isProfileFullScreen, setIsProfileFullScreen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = dashboardOrderService.subscribe((liveDashboardOrders) => {
      const validOrders = liveDashboardOrders.filter(o => o && o.id);
      const analyticsOrders = validOrders.map(transformDashboardOrderToAnalyticsOrder);
      setAllOrders(analyticsOrders.sort((a, b) => b.timestamp - a.timestamp));
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
  const filteredOrders = useMemo(() => {
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);
    
    return allOrders.filter(o => o.timestamp >= start.getTime() && o.timestamp <= end.getTime());
  }, [allOrders, dateRange]);


  const onlineOrders = useMemo(() => {
    return filteredOrders.filter(o => o.source === OrderSource.ONLINE);
  }, [filteredOrders]);

  const abandonedCarts = useMemo(() => {
       if(filteredOrders.length === 0) return 0;
       return Math.floor(40 + (onlineOrders.length * 0.3) + (parseInt((filteredOrders[0].id || '0').slice(-1), 16) || 0));
  }, [filteredOrders, onlineOrders]);

  const handleCrmViewChange = (isProfileVisible: boolean) => {
    setIsProfileFullScreen(isProfileVisible);
  };

  const renderViewContent = () => {
    switch (view) {
      case 'combined':
        return <OverviewTab allOrders={filteredOrders} />;
      case 'online':
        return <OperationsTab orders={onlineOrders} onNavigateToOnlineLog={onNavigateToOnlineLog} />;
      case 'crm':
        return <CrmTab allOrders={filteredOrders} onViewChange={handleCrmViewChange} />;
      case 'coupons':
        return <CouponsAnalyticsTab />;
      case 'complaints_archive':
        return <ArchivedComplaintsTab />;
      default:
        return <div className="p-10 text-center text-gray-400">عرض غير معروف</div>;
    }
  };
  
  const viewOptions: {id: ViewMode, label: string, icon: React.ReactNode}[] = [
      { id: 'combined', label: 'نظرة شاملة', icon: <Activity size={18} /> },
      { id: 'online', label: 'الأونلاين', icon: <LineChart size={18} /> },
      { id: 'crm', label: 'العملاء', icon: <AddressBookIcon size={18} /> },
      { id: 'coupons', label: 'الكوبونات', icon: <TicketIcon size={18} /> },
      { id: 'complaints_archive', label: 'أرشيف الشكاوي', icon: <Inbox size={18} /> },
  ];

  return (
    <div className="dashboard-theme h-full flex flex-col dashboard-body bg-[#000000] text-white selection:bg-neo-primary/30 selection:text-neo-primary/10" dir="rtl">
      {!isProfileFullScreen && (
      <>
        <header className="flex-shrink-0 z-40 bg-black/40 backdrop-blur-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 sticky top-0 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-5">
                <div className="relative group">
                    <div className="absolute -inset-1 bg-neo-primary/20 rounded-full blur group-hover:bg-neo-primary/40 transition duration-500"></div>
                    <img src={logoUrl} alt="الشعار" className="relative w-12 h-12 object-contain filter drop-shadow-[0_0_8px_rgba(var(--neo-primary-rgb),0.5)]" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight font-cairo leading-none mb-1">
                      أورا <span className="text-neo-primary">للتحليلات</span>
                    </h1>
                    <p className="text-[10px] text-gray-400 font-black tracking-[0.2em] uppercase opacity-70">Aura Analytics Intelligence</p>
                </div>
            </div>
            <div className="flex items-center justify-center lg:justify-end gap-3 flex-wrap">
                <ConnectivityBadge variant="dark" />
                <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
                <button 
                    onClick={() => setIsExportModalOpen(true)} 
                    className="flex items-center gap-2 h-10 px-4 text-sm font-bold rounded-xl transition-all bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/20 shadow-lg"
                    title="تصدير تقرير"
                >
                    <Download size={16} />
                    <span>تصدير</span>
                </button>
                <div className="w-px h-8 bg-white/10 mx-1"></div>
                <button
                      onClick={onExit}
                      className="relative transition-all duration-300 ease-in-out w-11 h-11 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg text-gray-300 hover:bg-white/20"
                      aria-label="الخروج"
                      title="العودة للوحة التحكم"
                    >
                      <ArrowLeftOnRectangleIcon className="w-6 h-6" />
                  </button>
            </div>
        </header>
        
          <div className="sticky top-[89px] z-30 px-6 py-4 bg-transparent">
              <div ref={scrollNavRef} className="bg-black/40 p-1.5 rounded-full flex items-center justify-start gap-1 overflow-x-auto no-scrollbar border border-white/10 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
                  {viewOptions.map(opt => {
                      const isActive = view === opt.id;
                      return (
                          <button 
                              key={opt.id} 
                              onClick={() => setView(opt.id)} 
                              className={`
                                  flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-full transition-all duration-300 whitespace-nowrap
                                  ${isActive 
                                      ? 'bg-neo-primary text-white shadow-md shadow-neo-primary/20' 
                                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                                  }
                              `}
                          >
                            {opt.icon}
                            <span>{opt.label}</span>
                          </button>
                      )
                  })}
              </div>
          </div>
        </>
      )}

      <main className={`flex-1 ${isProfileFullScreen ? 'p-0 overflow-hidden' : 'px-6 py-4 overflow-y-auto custom-scrollbar'}`}>
        <div className={`${isProfileFullScreen ? 'h-full' : 'min-h-[500px]'}`}>
          {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center pt-20">
                  <div className="relative w-28 h-28 mb-8">
                      <div className="absolute inset-0 border-4 border-neo-primary/10 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-neo-primary rounded-full border-t-transparent animate-spin"></div>
                      <div className="absolute inset-4 flex items-center justify-center">
                          <img src={logoUrl} alt="الشعار" className="w-12 h-12 object-contain animate-pulse" />
                      </div>
                  </div>
                  <div className="text-white/40 animate-pulse font-black tracking-[0.3em] text-[10px] uppercase">Processing intelligence...</div>
              </div>
          ) : (
              <div className={`${isProfileFullScreen ? 'h-full' : 'animate-fade-in pb-10'}`}>
                  {renderViewContent()}
              </div>
          )}
        </div>
      </main>
      
       <ExportModal 
            isOpen={isExportModalOpen} 
            onClose={() => setIsExportModalOpen(false)} 
            orders={filteredOrders} 
            defaultDateRange={dateRange}
        />
    </div>
  );
};

export default AuraAnalytics;
