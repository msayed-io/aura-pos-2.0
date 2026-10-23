

import React, { useState, useRef, useEffect, useMemo } from 'react';
// FIX: Add RefreshIcon to the import list.
import { 
    ArrowLeftOnRectangleIcon, 
    TrendingUpIcon, 
    Cog6ToothIcon, 
    ChatIcon, 
    UserIcon, 
    SearchIcon, 
    XIcon, 
    BookOpenIcon,
    FileTextIcon,
    RefreshIcon,
    BellIcon,
} from './Icons';
import AnalyticsAuthModal from './AnalyticsAuthModal';
import SettingsAuthModal from './SettingsAuthModal';
import ComplaintsPage from './pages/ComplaintsPage';
import OrdersPage from './pages/OrdersPage';
import ReservationsPage from './pages/ReservationsPage';
import type { SECRET_CODES } from '../../constants';
import { useTranslation } from '../../contexts/AppContext';
import { User } from '../../types';
import SystemClock from './ui/SystemClock';
import ClockDropdown from './ui/ClockDropdown';
import { useDashboard } from './DashboardContext';
import { useBranding } from '../../contexts/BrandingContext';
import { fraudDetectionService } from '../../services/fraudDetectionService';
import SlidingTabs from './ui/SlidingTabs';
import SearchBar from './ui/SearchBar';
import ConnectivityBadge from '../ConnectivityBadge';

type DashboardPage = 'orders' | 'reservations' | 'complaints';
type SettingsTab = 'menu' | 'branding' | 'offers' | 'coupons' | 'notifications' | 'printing' | 'security' | 'botai' | 'system';


const pageComponents: Record<DashboardPage, React.FC<any>> = {
    orders: (props) => <OrdersPage {...props} orderTypeToShow="all" />,
    reservations: ReservationsPage,
    complaints: ComplaintsPage,
};

interface DashboardProps {
    onLogout: () => void;
    securitySettings: typeof SECRET_CODES;
    onNavigateToPOS: () => void;
    onNavigateToAnalytics: () => void;
    onNavigateToSettings: (initialTab?: SettingsTab) => void;
    systemStartTime: Date;
    currentUser: User;
}


const Dashboard: React.FC<DashboardProps> = ({ onLogout, securitySettings, onNavigateToPOS, onNavigateToAnalytics, onNavigateToSettings, systemStartTime, currentUser }) => {
    const [activeTab, setActiveTab] = useState<DashboardPage>('orders');
    
    const [isAnalyticsAuthOpen, setIsAnalyticsAuthOpen] = useState(false);
    const [isAnalyticsAuthenticated, setIsAnalyticsAuthenticated] = useState(false);
    
    const [isSettingsAuthOpen, setIsSettingsAuthOpen] = useState(false);
    const [isSettingsAuthenticated, setIsSettingsAuthenticated] = useState(false);

    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const { showToast } = useDashboard();
    const { logoUrl } = useBranding();
    
    const [isClockMenuOpen, setIsClockMenuOpen] = useState(false);
    const clockMenuRef = useRef<HTMLDivElement>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [settingsRedirectTab, setSettingsRedirectTab] = useState<SettingsTab | null>(null);
    
    // AI Fraud Alerts State
    const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
    const [isAlertsOpen, setIsAlertsOpen] = useState(false);
    const alertsMenuRef = useRef<HTMLDivElement>(null);

    // Effect for handling clicks outside of menus
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
            if (clockMenuRef.current && !clockMenuRef.current.contains(event.target as Node)) {
                setIsClockMenuOpen(false);
            }
            if (alertsMenuRef.current && !alertsMenuRef.current.contains(event.target as Node)) {
                setIsAlertsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setFraudAlerts([...fraudDetectionService.getAlerts().reverse()]);
        }, 5000); // Check every 5 seconds
        
        return () => clearInterval(interval);
    }, []);

    // Effect to focus search input when expanded
    useEffect(() => {
        if (isSearchExpanded && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isSearchExpanded]);

    // Effect to reset search when navigating away from the orders tab
    useEffect(() => {
        if (activeTab !== 'orders') {
            setIsSearchExpanded(false);
            setSearchQuery('');
        }
    }, [activeTab]);

    useEffect(() => {
        if (currentUser?.accessLevel !== 'Admin' && activeTab === 'complaints') {
            setActiveTab('orders');
        }
    }, [currentUser, activeTab]);

    const mainPagesConfig = [
        { id: 'orders' as DashboardPage, label: 'الطلبات', icon: <FileTextIcon className="w-5 h-5" /> },
        { id: 'reservations' as DashboardPage, label: 'الحجوزات', icon: <BookOpenIcon className="w-5 h-5" /> },
        { id: 'complaints' as DashboardPage, label: 'الشكاوي', icon: <ChatIcon className="w-5 h-5" /> }
    ];

    const mainPages = useMemo(() => {
        if (currentUser?.accessLevel === 'Admin') {
            return mainPagesConfig;
        }
        return mainPagesConfig.filter(page => page.id !== 'complaints');
    }, [currentUser]);

    const handleAnalyticsAccess = () => {
        if (currentUser?.accessLevel !== 'Admin') return;
        if (!isAnalyticsAuthenticated) {
            setIsAnalyticsAuthOpen(true);
        } else {
            onNavigateToAnalytics();
        }
    };
    
    const handleSettingsAccess = (tab: SettingsTab | null = null) => {
        if (currentUser?.accessLevel !== 'Admin') return;
        setSettingsRedirectTab(tab);
        if (!isSettingsAuthenticated) {
            setIsSettingsAuthOpen(true);
        } else {
            onNavigateToSettings(tab || undefined);
        }
    };

    const handleAnalyticsAuthSuccess = () => {
        setIsAnalyticsAuthenticated(true);
        setIsAnalyticsAuthOpen(false);
        onNavigateToAnalytics();
    };

    const handleSettingsAuthSuccess = () => {
        setIsSettingsAuthenticated(true);
        setIsSettingsAuthOpen(false);
        onNavigateToSettings(settingsRedirectTab || undefined);
        setSettingsRedirectTab(null); // Reset after navigation
    };
    
    const toggleSearch = () => {
        if (isSearchExpanded) {
            setSearchQuery('');
        }
        setIsSearchExpanded(!isSearchExpanded);
    };

    const handleRestartSystem = () => {
        showToast({ message: "جاري إعادة تشغيل النظام...", type: 'info' });
        setIsProfileMenuOpen(false);
        setTimeout(() => {
            onLogout();
        }, 1000); // Give user time to see toast
    };

    const renderPage = () => {
        const PageComponent = pageComponents[activeTab];
        if (!PageComponent) return <div className="p-8 text-center text-gray-500">جاري تحميل الوحدة...</div>;
        
        const props: any = {};
        
        if (activeTab === 'orders') {
            props.searchQuery = searchQuery;
        }

        return <PageComponent key={activeTab} {...props} />;
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden text-neo-secondary font-sans bg-neo-bg transition-colors duration-500" dir="rtl">
          <header className="flex-shrink-0 z-40 bg-white/70 backdrop-blur-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-neo-soft-gray/40 animate-fade-in relative">
              {/* Right Side */}
              <div className="flex items-center gap-3">
                  <img src={logoUrl} alt="Logo" className="w-[42px] h-[42px] object-contain drop-shadow-sm" />
                  <div>
                    <h1 className="text-xl font-extrabold text-neo-secondary tracking-tight">Aura POS</h1>
                    <p className="text-sm text-neo-secondary/50 font-medium">نظام الإدارة المتكامل</p>
                  </div>
              </div>

              {/* Left Side */}
              <div className="flex items-center gap-1 sm:gap-2">
                  
                  <div className="relative" ref={clockMenuRef}>
                    <SystemClock onClick={() => setIsClockMenuOpen(prev => !prev)} />
                    {isClockMenuOpen && (
                        <ClockDropdown systemStartTime={systemStartTime} />
                    )}
                  </div>

                  <ConnectivityBadge variant="light" />

                    {currentUser?.accessLevel === 'Admin' && (
                    <>
                      <button onClick={onNavigateToPOS} className="flex items-center gap-2 px-4 py-2 text-neo-secondary/80 hover:bg-neo-primary hover:text-white rounded-xl transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md active:scale-95" title="الكاشير">
                          <BookOpenIcon className="w-5 h-5" />
                          <span className="font-bold text-sm hidden sm:inline">الكاشير</span>
                      </button>
                      <button onClick={handleAnalyticsAccess} className="flex items-center gap-2 px-4 py-2 text-neo-secondary/80 hover:bg-neo-primary hover:text-white rounded-xl transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md active:scale-95" title="الإحصائيات">
                          <TrendingUpIcon className="w-5 h-5" />
                          <span className="font-bold text-sm hidden sm:inline">الإحصائيات</span>
                      </button>
                      <button onClick={() => handleSettingsAccess()} className="flex items-center gap-2 px-4 py-2 text-neo-secondary/80 hover:bg-neo-primary hover:text-white rounded-xl transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md active:scale-95" title="الإعدادات">
                          <Cog6ToothIcon className="w-5 h-5" />
                          <span className="font-bold text-sm hidden sm:inline">الإعدادات</span>
                      </button>
                      <div className="relative" ref={alertsMenuRef}>
                        <button onClick={() => setIsAlertsOpen(prev => !prev)} className="relative flex items-center justify-center p-2 text-neo-secondary/80 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md active:scale-95">
                          <BellIcon className={`w-5 h-5 ${fraudAlerts.length > 0 ? 'animate-pulse text-red-500' : ''}`} />
                          {fraudAlerts.length > 0 && (
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                          )}
                        </button>
                        {isAlertsOpen && (
                          <div className="absolute top-full mt-2 left-0 w-80 bg-white rounded-xl shadow-2xl border border-red-100 z-50 overflow-hidden">
                             <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex justify-between items-center">
                                <h3 className="font-bold text-red-700 text-sm">تنبيهات الذكاء الاصطناعي (احتيال)</h3>
                                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{fraudAlerts.length}</span>
                             </div>
                             <div className="max-h-72 overflow-y-auto">
                               {fraudAlerts.length === 0 ? (
                                 <div className="p-6 text-center text-gray-400 text-sm">لا يوجد حركات مريبة. النظام آمن.</div>
                               ) : (
                                 fraudAlerts.map(alert => (
                                   <div key={alert.id} className="p-3 border-b border-gray-100 bg-white hover:bg-red-50/50 transition-colors">
                                      <p className="text-xs text-gray-500 mb-1">{new Date(alert.timestamp).toLocaleTimeString()}</p>
                                      <p className="font-bold text-sm text-gray-800">{alert.description}</p>
                                      <p className="text-xs text-red-600 font-semibold mt-1">الكاشير: {alert.cashierName || alert.cashierId}</p>
                                   </div>
                                 ))
                               )}
                             </div>
                          </div>
                        )}
                      </div>
                    </>
                   )}
                  <div className="border-l h-6 border-neo-soft-gray mx-2 hidden sm:block"></div>
                      <div className="relative" ref={profileMenuRef}>
                        <button 
                            onClick={() => setIsProfileMenuOpen(prev => !prev)} 
                            className="w-10 h-10 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity focus:outline-none"
                            title="الحساب"
                        >
                            <img src="/logo_aura.webp" alt="Profile" className="w-8 h-8 object-contain drop-shadow-sm" />
                        </button>
                        {isProfileMenuOpen && (
                            <div className="absolute top-full mt-2 left-0 w-64 bg-white rounded-xl shadow-lg border border-neo-soft-gray z-50 animate-zoom-in-95 origin-top-left">
                                <div className="p-4 border-b border-neo-soft-gray flex items-center gap-3">
                                    <img src={logoUrl} alt="Profile Logo" className="w-12 h-12 object-contain drop-shadow-sm rounded-lg" />
                                    <div>
                                        <p className="font-bold text-neo-secondary">Aura POS</p>
                                        <p className="text-sm text-neo-secondary/50">
                                            {currentUser?.accessLevel === 'Admin' ? 'مدير النظام' : 'كاشير'}
                                        </p>
                                    </div>
                                </div>
                                <div className="p-2">
                                    {currentUser?.accessLevel === 'Admin' && (
                                        <button
                                            onClick={() => {
                                                handleSettingsAccess('security');
                                                setIsProfileMenuOpen(false);
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neo-secondary font-semibold rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                                        >
                                            <Cog6ToothIcon className="w-5 h-5" />
                                            <span>إعدادات الحساب</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={handleRestartSystem}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neo-secondary font-semibold rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                                    >
                                        <RefreshIcon className="w-5 h-5" />
                                        <span>إعادة تشغيل النظام</span>
                                    </button>
                                </div>
                                <div className="h-px bg-neo-soft-gray mx-2"></div>
                                <div className="p-2">
                                    <button
                                        onClick={() => {
                                            onLogout();
                                            setIsProfileMenuOpen(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neo-error font-semibold rounded-lg hover:bg-neo-error/10 transition-colors cursor-pointer"
                                    >
                                        <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                                        <span>تسجيل الخروج</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
              </div>
          </header>
          
          <main className="flex-1 flex flex-col overflow-hidden relative z-0">
              <div className="flex-grow overflow-y-auto custom-scrollbar">
                  <nav className="sticky top-0 z-30 flex-shrink-0 flex justify-center py-6 bg-neo-bg/80 backdrop-blur-md mb-2">
                      <div className="flex items-center gap-4 px-4 bg-white/40 p-2 rounded-3xl border border-white/50 shadow-sm backdrop-blur-lg">
                          <SlidingTabs 
                            tabs={mainPages.map(p => ({ id: p.id, label: p.label, icon: p.icon }))}
                            activeTab={activeTab}
                            onChange={(id) => setActiveTab(id as DashboardPage)}
                          />

                          {/* --- Integrated Search Component --- */}
                          {(activeTab === 'orders') && (
                              <>
                                  <div className="border-l h-8 border-gray-300/40 mx-2"></div>
                                  <SearchBar 
                                    value={searchQuery}
                                    onChange={setSearchQuery}
                                    placeholder="بحث في الطلبات..."
                                  />
                              </>
                          )}
                      </div>
                  </nav>

                  <div className="px-6 pb-6">
                      <div className="min-h-full animate-fade-in">
                          {renderPage()}
                      </div>
                  </div>
              </div>
          </main>

          <AnalyticsAuthModal isOpen={isAnalyticsAuthOpen} onClose={() => setIsAnalyticsAuthOpen(false)} onSuccess={handleAnalyticsAuthSuccess} passwordToCheck={securitySettings.ANALYTICS_ACCESS} />
          <SettingsAuthModal isOpen={isSettingsAuthOpen} onClose={() => setIsSettingsAuthOpen(false)} onSuccess={handleSettingsAuthSuccess} passwordToCheck={securitySettings.SETTINGS_ACCESS} />
        </div>
    );
};

export default Dashboard;
