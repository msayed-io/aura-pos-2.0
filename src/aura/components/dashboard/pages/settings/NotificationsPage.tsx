import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import ElasticSlider from '../../ui/ElasticSlider';
// FIX: Use newly exported icons
import { BellIcon, Volume2Icon, VolumeXIcon, MusicIcon, PlayIcon, UploadCloudIcon } from '../../Icons';
import { useDashboard } from '../../DashboardContext';


const SOUNDS = [
    { name: 'إشعار احترافي 1 (Pro 1)', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
    { name: 'إشعار احترافي 2 (Pro 2)', url: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3' },
    { name: 'تنبيه سريع (Quick Alert)', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3' },
];

const DEFAULT_SETTINGS = {
    isEnabled: true,
    volume: 80, // Stored as 0-100
    soundUrl: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    customSoundName: null as string | null,
};

const NotificationsPage: React.FC = () => {
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [isToneModalOpen, setIsToneModalOpen] = useState(false);
    const { showToast } = useDashboard();
    
    // Load settings from localStorage on mount
    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem('hotbroast_notification_settings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                // Ensure all keys are present, falling back to default if a key is missing
                setSettings({ ...DEFAULT_SETTINGS, ...parsedSettings });
            }
        } catch (e) {
            console.error("Failed to load notification settings:", e);
        }
    }, []);

    // Save settings to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem('hotbroast_notification_settings', JSON.stringify(settings));
        } catch (e) {
            console.error("Failed to save notification settings:", e);
        }
    }, [settings]);

    const handleSettingChange = (key: keyof typeof settings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const debouncedPlayRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (debouncedPlayRef.current) clearTimeout(debouncedPlayRef.current);
        };
    }, []);

    const playSound = useCallback((url: string, volume: number) => {
        if (!settings.isEnabled) return;
        
        const audio = new Audio(url);
        audio.volume = volume / 100;
        audio.play().catch(e => {
            console.error("Could not play sound preview:", e);
        });
    }, [settings.isEnabled]);

    const handleVolumeChange = useCallback((val: number) => {
        handleSettingChange('volume', val);
        
        // Debounce audio preview while sliding
        if (debouncedPlayRef.current) clearTimeout(debouncedPlayRef.current);
        debouncedPlayRef.current = setTimeout(() => {
            playSound(settings.soundUrl, val);
        }, 400);
    }, [settings.soundUrl, playSound]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!['audio/wav', 'audio/mpeg', 'audio/mp3'].includes(file.type)) {
            showToast({ message: 'الرجاء اختيار ملف بصيغة WAV أو MP3.', type: 'error' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            showToast({ message: 'حجم الملف كبير جداً (الحد الأقصى 2MB).', type: 'error' });
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setSettings(prev => ({
                ...prev,
                soundUrl: dataUrl,
                customSoundName: file.name,
            }));
            showToast({ message: `تم رفع "${file.name}" بنجاح.`, type: 'success' });
            // Auto-play the uploaded sound
            playSound(dataUrl, settings.volume);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col h-full">
            <header className="text-center pt-12 pb-6 max-w-3xl mx-auto">
                <h1 className="text-4xl font-black font-cairo text-neo-secondary">إعدادات الإشعار والنظام</h1>
                <p className="mt-3 text-lg text-neo-secondary/60 leading-relaxed">
                    تحكم في الإشعارات الصوتية والبصرية لكافة أحداث النظام (الطلبات، الطباعة، الأخطاء، والنجاح).
                </p>
            </header>

             <main className="flex-grow flex items-center justify-center pb-12">
                <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl border border-neo-soft-gray shadow-sm p-8 space-y-8 animate-fade-in">
                    
                    {/* Master Switch */}
                    <div className="flex justify-between items-center p-4 bg-neo-bg rounded-xl border border-neo-soft-gray">
                        <div className="flex items-center gap-3">
                            <BellIcon className="w-6 h-6 text-neo-primary"/>
                            <div>
                                <h3 className="font-bold text-neo-secondary">الإشعارات الصوتية للنظام</h3>
                                <p className="text-xs text-neo-secondary/60">تفعيل أو تعطيل الصوت عند حدوث عمليات هامة (طلبات، طباعة، تنبيهات).</p>
                            </div>
                        </div>
                        <ToggleSwitch
                            checked={settings.isEnabled}
                            onChange={(checked) => handleSettingChange('isEnabled', checked)}
                        />
                    </div>

                    {/* Volume Control */}
                    <div className={`transition-opacity duration-300 ${!settings.isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                         <label htmlFor="volume-slider" className="font-bold text-sm text-neo-secondary/80 flex items-center gap-2 mb-3">
                            <Volume2Icon className="w-5 h-5" />
                            مستوى الصوت
                        </label>
                        <div className="flex flex-col items-center justify-center p-6 bg-neo-bg rounded-xl border border-neo-soft-gray relative overflow-hidden">
                            <ElasticSlider
                                defaultValue={settings.volume}
                                onValueChange={handleVolumeChange}
                                leftIcon={<VolumeXIcon className="w-5 h-5 text-gray-500" />}
                                rightIcon={<Volume2Icon className="w-5 h-5 text-neo-primary" />}
                                className="z-10"
                            />
                        </div>
                    </div>
                    
                     {/* Tone Selection */}
                    <div className={`transition-opacity duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-neo-bg rounded-xl border border-neo-soft-gray ${!settings.isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-3">
                            <MusicIcon className="w-6 h-6 text-neo-primary" />
                            <div>
                                <h3 className="font-bold text-neo-secondary">نغمة الإشعار</h3>
                                <p className="text-sm font-semibold text-neo-primary mt-1">
                                    {settings.customSoundName ? settings.customSoundName : SOUNDS.find(s => s.url === settings.soundUrl)?.name || 'مخصصة'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                             <button
                                onClick={() => playSound(settings.soundUrl, settings.volume)}
                                className="p-2.5 rounded-full bg-neo-primary/10 text-neo-primary hover:bg-neo-primary/20 transition-colors"
                                title="تجربة الصوت (Preview)"
                            >
                                <PlayIcon className="w-5 h-5 ml-0.5" />
                            </button>
                            <button
                                onClick={() => setIsToneModalOpen(true)}
                                className="flex-grow sm:flex-grow-0 px-4 py-2 bg-white border-2 border-neo-primary text-neo-primary font-bold rounded-lg hover:bg-neo-primary/5 transition-colors"
                            >
                                تغيير النغمة
                            </button>
                        </div>
                    </div>

                    {/* Custom Sound Upload */}
                    <div className={`p-4 bg-neo-bg rounded-xl border-2 border-dashed border-neo-soft-gray transition-opacity duration-300 ${!settings.isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                         <label className="font-bold text-sm text-neo-secondary/80 flex items-center gap-2 mb-2">
                            <UploadCloudIcon className="w-5 h-5" />
                            أو رفع ملف صوتي خاص
                        </label>
                        <label htmlFor="sound-upload" className="w-full text-center cursor-pointer bg-white border border-neo-soft-gray rounded-lg px-4 py-3 text-neo-secondary font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2">
                             <span>اختر ملف (.wav, .mp3)</span>
                        </label>
                        <input id="sound-upload" type="file" className="hidden rounded-xl" accept="audio/wav,audio/mpeg,audio/mp3" onChange={handleFileChange} />
                        {settings.customSoundName && (
                             <p className="text-xs text-center text-green-700 font-semibold mt-3 bg-green-100 p-2 rounded-md">
                                الملف النشط حالياً: <strong>{settings.customSoundName}</strong>
                            </p>
                        )}
                    </div>

                </div>
            </main>

            {/* Tone Selection Modal */}
            {isToneModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setIsToneModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-neo-soft-gray" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-neo-soft-gray">
                            <h2 className="text-xl font-bold text-neo-secondary flex items-center gap-2">
                                <MusicIcon className="w-6 h-6 text-neo-primary" />
                                اختر نغمة الإشعار
                            </h2>
                            <button onClick={() => setIsToneModalOpen(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div className="p-5 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-1 gap-3">
                                {SOUNDS.map(sound => {
                                    const isSelected = settings.soundUrl === sound.url && !settings.customSoundName;
                                    return (
                                        <div 
                                            key={sound.url}
                                            onClick={() => {
                                                setSettings(prev => ({ ...prev, soundUrl: sound.url, customSoundName: null }));
                                                playSound(sound.url, settings.volume);
                                            }}
                                            className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-neo-primary bg-neo-primary/5' : 'border-neo-soft-gray bg-white hover:border-neo-primary/50'}`}
                                        >
                                            <span className={`font-semibold ${isSelected ? 'text-neo-primary' : 'text-neo-secondary'}`}>{sound.name}</span>
                                            <div className="flex items-center gap-2">
                                                {isSelected && <span className="text-xs font-bold text-neo-primary bg-white px-2 py-1 rounded-md shadow-sm border border-neo-primary/20">محددة</span>}
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        playSound(sound.url, settings.volume);
                                                    }}
                                                    title="تجربة الصوت (Preview)"
                                                    className={`p-2 rounded-full transition-colors ${isSelected ? 'bg-neo-primary text-white hover:bg-neo-primary/80' : 'bg-neo-bg text-neo-secondary hover:bg-gray-200'}`}
                                                >
                                                    <PlayIcon className="w-4 h-4 ml-0.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Custom Selection display in Modal */}
                                {settings.customSoundName && (
                                     <div 
                                        onClick={() => playSound(settings.soundUrl, settings.volume)}
                                        className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all border-neo-primary bg-neo-primary/5`}
                                    >
                                        <span className="font-semibold text-neo-primary">{settings.customSoundName}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-neo-primary bg-white px-2 py-1 rounded-md shadow-sm border border-neo-primary/20">مخصصة ومحددة</span>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    playSound(settings.soundUrl, settings.volume);
                                                }}
                                                className="p-2 rounded-full bg-neo-primary text-white hover:bg-neo-primary/80 transition-colors"
                                            >
                                                <PlayIcon className="w-4 h-4 ml-0.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t border-neo-soft-gray bg-neo-bg text-center">
                            <button onClick={() => setIsToneModalOpen(false)} className="px-6 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-primary/90 transition-colors">
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsPage;