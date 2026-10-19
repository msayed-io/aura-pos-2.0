

import React, { useState, useEffect } from 'react';
import MenuPage from '../components/dashboard/pages/settings/MenuPage';
import SystemInfoPage from '../components/dashboard/pages/settings/SystemInfoPage';
import CouponsPage from '../components/dashboard/pages/settings/CouponsPage';
import OffersPage from '../components/dashboard/pages/settings/OffersPage';
import NotificationsPage from '../components/dashboard/pages/settings/NotificationsPage';
import PrintingPage from '../components/dashboard/pages/settings/PrintingPage';
import BrandingPage from '../components/dashboard/pages/settings/BrandingPage';
import PricingPage from '../components/dashboard/pages/settings/PricingPage';
import BotAIPage from '../components/dashboard/pages/settings/BotAIPage';
import { ArrowLeftOnRectangleIcon, TicketIcon, PrinterIcon, InfoIcon, BellIcon, PaletteIcon, FileTextIcon, ListChecksIcon, SparklesIcon } from '../components/dashboard/Icons';
import { Bot, LayoutList } from 'lucide-react';
import { useDragToScroll } from '../hooks/useDragToScroll';

import ConnectivityBadge from '../components/ConnectivityBadge';

type SettingsTab = 'menu' | 'branding' | 'offers' | 'coupons' | 'pricing' | 'notifications' | 'printing' | 'botai' | 'system';

interface SettingsPageProps {
    onExit: () => void;
    initialTab?: SettingsTab;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onExit, initialTab }) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'menu');
    const scrollNavRef = useDragToScroll<HTMLElement>();

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
        { id: 'menu', label: 'المنيو', icon: <LayoutList className="w-5 h-5" /> },
        { id: 'offers', label: 'العروض', icon: <TicketIcon className="w-5 h-5" /> },
        { id: 'coupons', label: 'الكوبونات', icon: <TicketIcon className="w-5 h-5" /> },
        { id: 'branding', label: 'الهوية البصرية', icon: <PaletteIcon className="w-5 h-5" /> },
        { id: 'printing', label: 'الطباعة', icon: <PrinterIcon className="w-5 h-5" /> },
        { id: 'notifications', label: 'الإشعارات', icon: <BellIcon className="w-5 h-5" /> },
        { id: 'pricing', label: 'التسعير الذكي', icon: <SparklesIcon className="w-5 h-5" /> },
        { id: 'botai', label: 'البوت و AI', icon: <Bot className="w-5 h-5" /> },
        { id: 'system', label: 'معلومات النظام', icon: <InfoIcon className="w-5 h-5" /> },
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'menu':
                return <MenuPage />;
            case 'branding':
                return <BrandingPage />;
            case 'offers':
                return <OffersPage />;
            case 'coupons':
                return <CouponsPage />;
            case 'notifications':
                return <NotificationsPage />;
            case 'printing':
                return <PrintingPage />;
            case 'pricing':
                return <PricingPage />;
            case 'botai':
                return <BotAIPage />;
            case 'system':
                return <SystemInfoPage />;
            default:
                return (
                    <div className="p-8 text-center text-neo-secondary/50 border border-dashed border-neo-soft-gray rounded-xl">
                        الوحدة "{tabs.find(t => t.id === activeTab)?.label}" غير متاحة حالياً.
                    </div>
                );
        }
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden text-neo-secondary font-sans bg-neo-bg" dir="rtl">
            {/* Modern Compact "Pill" Header */}
            <header className="flex-shrink-0 z-30 bg-neo-bg/80 px-4 py-3 border-b border-neo-soft-gray">
                <div className="flex justify-between items-center">
                    {/* Right Side: Exit Button */}
                    <button
                        onClick={onExit}
                        className="relative transition-all duration-300 ease-in-out w-11 h-11 flex items-center justify-center rounded-full bg-white/60 backdrop-blur-md border border-gray-900/10 shadow-md text-gray-700 hover:bg-white/90"
                        aria-label="الخروج من الإعدادات"
                        title="العودة للوحة التحكم"
                    >
                        <ArrowLeftOnRectangleIcon className="w-6 h-6 text-neo-secondary/80" />
                    </button>

                    {/* Center: Pill Navigation */}
                    <nav ref={scrollNavRef} className="flex-1 min-w-0 mx-4 bg-gray-200/70 p-1.5 rounded-full flex items-center justify-start gap-1 overflow-x-auto no-scrollbar">
                        {tabs.map((tab) => (
                             <button
                                key={tab.id}
                                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                                disabled={tab.disabled}
                                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-full transition-all duration-300 whitespace-nowrap
                                    ${activeTab === tab.id
                                        ? 'bg-neo-primary text-white shadow-md shadow-neo-primary/20'
                                        : tab.disabled 
                                            ? 'text-neo-secondary/30 cursor-not-allowed'
                                            : 'text-neo-secondary/60 hover:bg-white/50'
                                    }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>

                    {/* Left Side: Connectivity Status */}
                    <ConnectivityBadge variant="light" />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-6">
                <div className="min-h-full">
                    {renderTabContent()}
                </div>
            </main>
        </div>
    );
};

export default SettingsPage;