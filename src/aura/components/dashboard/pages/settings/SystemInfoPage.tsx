

import React from 'react';
import { SYSTEM_VERSION } from '../../../../constants';
import { useDashboard } from '../../DashboardContext';
import { PhoneIcon } from '../../Icons';
import { useBranding } from '../../../../contexts/BrandingContext';

// Self-contained WhatsApp Icon component to ensure it renders correctly
const WhatsAppIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.002 2.024.63 3.965 1.739 5.618l-1.181 4.324a.5.5 0 00.623.623l4.325-1.182z" />
        <path d="M15.232 14.379c-.227-.114-1.341-.663-1.55-.738-.208-.075-.358-.114-.51.114-.15.227-.586.738-.719.886-.133.148-.266.168-.493.056-.227-.114-.944-.349-1.8-1.109-.664-.578-1.109-1.29-1.242-1.517-.133-.227-.014-.349.1-.463.102-.102.227-.266.34-.399.113-.133.152-.227.227-.38.075-.15.038-.285-.019-.399-.056-.114-.51-.623-.7-.85-.19-.227-.38-.19-.51-.19-.133.009-.285-.009-.437-.009s-.399.057-.601.285c-.201.228-.776.753-.776 1.832 0 1.078.796 2.133.91 2.28.114.148 1.565 2.413 3.782 3.326.54.227.975.362 1.32.463.504.149.95.129 1.3-.056.39-.19 1.144-.463 1.309-.909.165-.446.165-.83.114-.909-.051-.075-.184-.114-.411-.227z" />
    </svg>
);

const SystemInfoPage: React.FC = () => {
    const { showToast } = useDashboard();
    const { logoUrl } = useBranding();
    
    const versionString = `v${SYSTEM_VERSION.major}.${SYSTEM_VERSION.minor}.${SYSTEM_VERSION.patch} (Build ${SYSTEM_VERSION.buildId})`;

    const handleClearCache = () => {
        showToast({
            message: "تم إرسال طلب مسح الذاكرة المؤقتة بنجاح.",
            type: 'success'
        });
    };

    return (
        <div className="flex flex-col h-full">
            <header className="text-center pt-12 pb-6 max-w-3xl mx-auto">
                <h1 className="text-4xl font-black font-cairo text-neo-secondary">معلومات النظام</h1>
                <p className="mt-3 text-lg text-neo-secondary/60 leading-relaxed">
                    تفاصيل الإصدار، حالة النظام، وقنوات الدعم الفني المتاحة.
                </p>
            </header>
            
            <main className="flex-grow flex items-center justify-center pb-12">
                <div className="max-w-5xl mx-auto space-y-8 animate-fade-in w-full">
                    <div className="bg-white rounded-2xl border border-neo-soft-gray shadow-sm text-center p-10">
                        <img src="/logo_aura.webp" alt="Aura POS Logo" className="w-32 h-32 mx-auto mb-4 object-contain" />
                        <h1 className="text-4xl font-black text-neo-secondary tracking-tight font-cairo">Aura POS</h1>
                        <p className="text-neo-secondary/60 mt-2">نظام الإدارة الذكي المتكامل</p>
                        <div className="mt-6 inline-block bg-neo-bg border border-neo-soft-gray rounded-lg px-4 py-2">
                            <p className="font-mono text-sm text-neo-secondary tracking-wider">{versionString}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white rounded-2xl border border-neo-soft-gray shadow-sm p-10">
                            <h2 className="text-lg font-bold text-neo-secondary mb-6">حالة النظام والأدوات</h2>
                            <div className="space-y-5">
                                <div className="flex justify-between items-center p-4 bg-neo-bg rounded-lg">
                                    <span className="font-semibold text-neo-secondary/80">حالة الاتصال بالسيرفر</span>
                                    <div className="flex items-center gap-2 text-neo-success font-bold">
                                        <div className="w-2.5 h-2.5 bg-neo-success rounded-full animate-pulse"></div>
                                        <span>Online</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleClearCache}
                                    className="w-full text-left p-4 bg-neo-bg rounded-lg hover:bg-neo-primary/10 transition-colors group"
                                >
                                    <span className="font-bold text-neo-primary group-hover:text-neo-accent">مسح الذاكرة المؤقتة</span>
                                    <p className="text-xs text-neo-secondary/50 mt-1">يساعد في حل بعض المشاكل وتحسين أداء النظام بعد التحديثات.</p>
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-neo-soft-gray shadow-sm p-10 flex flex-col">
                             <h2 className="text-lg font-bold text-neo-secondary mb-6">مركز التواصل والدعم</h2>
                             <div className="flex-grow space-y-4 flex flex-col">
                                <a 
                                   href="https://wa.me/201140251843"
                                   target="_blank" 
                                   rel="noopener noreferrer"
                                   className="flex-grow flex items-center justify-center gap-3 text-center p-4 bg-[#25D366] text-white rounded-lg font-bold hover:bg-[#128C7E] transition-all transform hover:scale-105"
                                >
                                    <WhatsAppIcon />
                                    <span>تواصل عبر واتساب</span>
                                </a>
                                 <a 
                                   href="tel:01033254483"
                                   className="flex-grow flex items-center justify-center gap-3 text-center p-4 bg-neo-soft-gray text-neo-secondary rounded-lg font-bold hover:bg-gray-200 transition-all"
                                >
                                    <PhoneIcon className="w-6 h-6"/>
                                    <span>اتصال طوارئ (Hotline)</span>
                                </a>
                             </div>
                             <p className="text-center text-sm text-neo-secondary/70 mt-8 font-medium">
                                تم التطوير والبرمجة بواسطة{' '}
                                <span className="font-bold font-latin tracking-wide">
                                    <span className="text-neo-secondary">Apex</span>
                                    <span className="text-neo-primary">Synex</span>
                                </span>
                             </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SystemInfoPage;
