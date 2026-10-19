import React, { useState, useEffect } from 'react';
import { useDashboard } from '../../DashboardContext';
import { SpinnerIcon, PrinterIcon, SaveIcon } from '../../Icons';

interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options: Record<string, string>;
}

interface PrinterSettings {
    cashierPrinter: string;
    kitchenPrinter: string;
}

const PrintingPage: React.FC = () => {
    const [printers, setPrinters] = useState<PrinterInfo[]>([]);
    const [settings, setSettings] = useState<PrinterSettings>({ cashierPrinter: '', kitchenPrinter: '' });
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useDashboard();
    const isElectron = !!window.electronAPI;

    useEffect(() => {
        if (!isElectron) {
            setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            try {
                const availablePrinters = await window.electronAPI.getPrinters();
                const savedSettings = await window.electronAPI.loadPrinterSettings();
                
                setPrinters(availablePrinters);
                if (savedSettings) {
                    setSettings(savedSettings);
                }
            } catch (error) {
                console.error("Failed to load printer data:", error);
                showToast({ message: 'فشل تحميل بيانات الطابعات', type: 'error' });
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [isElectron, showToast]);

    const handleSave = async () => {
        if (!isElectron) return;
        setIsSaving(true);
        try {
            await window.electronAPI.savePrinterSettings(settings);
            showToast({ message: 'تم حفظ إعدادات الطابعة بنجاح', type: 'success' });
        } catch (error) {
            console.error("Failed to save settings:", error);
            showToast({ message: 'فشل حفظ الإعدادات', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({...prev, [name]: value}));
    };

    if (!isElectron) {
        return (
            <div className="flex h-full items-center justify-center bg-white rounded-xl p-10 border border-neo-soft-gray shadow-sm">
                <div className="text-center">
                    <PrinterIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-neo-secondary/80 font-display">إعدادات الطباعة المباشرة</h1>
                    <p className="text-neo-secondary/50 mt-2 max-w-md">
                        هذه الميزة متاحة فقط عند تشغيل النظام كتطبيق سطح مكتب (Desktop App) للوصول المباشر إلى الطابعات.
                    </p>
                </div>
            </div>
        );
    }
    
    if (loading) {
        return <div className="flex h-full items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;
    }

    return (
        <div className="flex flex-col h-full">
            <header className="mb-6">
                <h1 className="text-3xl font-black font-cairo text-neo-secondary">إدارة الطباعة</h1>
                <p className="text-neo-secondary/60 mt-1">تحديد الطابعات المسؤولة عن طباعة الفواتير وتذاكر المطبخ.</p>
            </header>

            <div className="flex-grow bg-white border border-neo-soft-gray rounded-xl shadow-sm p-8 space-y-8">
                <div>
                    <label htmlFor="cashierPrinter" className="block text-lg font-bold text-neo-secondary mb-2">
                        طابعة الكاشير (فواتير العملاء)
                    </label>
                    <p className="text-sm text-neo-secondary/60 mb-3">اختر الطابعة التي سيتم استخدامها لطباعة الفواتير النهائية للعملاء.</p>
                    <select
                        id="cashierPrinter"
                        name="cashierPrinter"
                        value={settings.cashierPrinter}
                        onChange={handleChange}
                        className="w-full p-3 border border-neo-soft-gray rounded-md bg-white text-black text-lg"
                    >
                        <option value="">-- اختر طابعة --</option>
                        {printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
                    </select>
                </div>

                 <div>
                    <label htmlFor="kitchenPrinter" className="block text-lg font-bold text-neo-secondary mb-2">
                        طابعة المطبخ (تذاكر التحضير)
                    </label>
                    <p className="text-sm text-neo-secondary/60 mb-3">اختر الطابعة التي سيتم استخدامها لطباعة طلبات التحضير للمطبخ.</p>
                     <select
                        id="kitchenPrinter"
                        name="kitchenPrinter"
                        value={settings.kitchenPrinter}
                        onChange={handleChange}
                        className="w-full p-3 border border-neo-soft-gray rounded-md bg-white text-black text-lg"
                    >
                        <option value="">-- اختر طابعة --</option>
                        {printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
                    </select>
                </div>
            </div>
            
            <footer className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm disabled:opacity-50"
                >
                    {isSaving ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <SaveIcon className="w-5 h-5"/>}
                    {isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                </button>
            </footer>
        </div>
    );
};

export default PrintingPage;
