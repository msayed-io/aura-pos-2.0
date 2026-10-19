import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronDown as ChevronDownIcon, X as XIcon } from 'lucide-react';
import { useOnClickOutside } from '../hooks/useOnClickOutside';

interface DateRangePickerProps {
    dateRange: { start: Date; end: Date };
    setDateRange: (range: { start: Date; end: Date }) => void;
}

const formatDate = (date: Date) => date.toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric' });
const formatDateForInput = (date: Date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const presets = [
    { label: 'اليوم', days: 0 },
    { label: 'الأمس', days: 1, isSingleDay: true },
    { label: 'آخر 7 أيام', days: 6 },
    { label: 'آخر 30 يومًا', days: 29 },
    { label: 'هذا الشهر', days: 'this_month' as const },
];

const DateRangePicker: React.FC<DateRangePickerProps> = ({ dateRange, setDateRange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activePreset, setActivePreset] = useState<string | null>('آخر 7 أيام');
    const [customStart, setCustomStart] = useState<string>(formatDateForInput(dateRange.start));
    const [customEnd, setCustomEnd] = useState<string>(formatDateForInput(dateRange.end));

    const popoverRef = useRef<HTMLDivElement>(null);
    useOnClickOutside(popoverRef, () => setIsOpen(false));

    useEffect(() => {
        setCustomStart(formatDateForInput(dateRange.start));
        setCustomEnd(formatDateForInput(dateRange.end));
    }, [dateRange]);

    // FIX: Refactored the logic to ensure TypeScript correctly infers that `preset.days` is a number
    // when used in arithmetic operations.
    const handlePresetClick = (preset: typeof presets[0]) => {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const start = new Date();

        if (preset.days === 'this_month') {
            start.setDate(1);
        } else {
            // In this block, preset.days is guaranteed to be a number.
            if (preset.isSingleDay) {
                start.setDate(start.getDate() - preset.days);
                end.setDate(end.getDate() - preset.days);
            } else {
                start.setDate(start.getDate() - preset.days);
            }
        }
        start.setHours(0, 0, 0, 0);
        
        setDateRange({ start, end });
        setActivePreset(preset.label);
        setIsOpen(false);
    };
    
    const handleCustomApply = () => {
        const start = new Date(customStart);
        const end = new Date(customEnd);
        
        // Adjust for timezone offset to prevent off-by-one day errors
        start.setMinutes(start.getMinutes() + start.getTimezoneOffset());
        end.setMinutes(end.getMinutes() + end.getTimezoneOffset());

        if (start > end) {
            // Optionally show a toast message for error
            return;
        }

        setDateRange({ start, end });
        setActivePreset('نطاق مخصص');
        setIsOpen(false);
    }
    
    const displayRange = activePreset === 'نطاق مخصص'
        ? `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`
        : activePreset;

    return (
        <div className="relative" ref={popoverRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 h-10 px-4 text-sm font-bold rounded-xl transition-all bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/20 shadow-lg"
            >
                <CalendarIcon size={16} />
                <span>{displayRange}</span>
                <ChevronDownIcon size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 left-0 w-80 bg-dash-card/80 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-50 p-4 animate-fade-in text-white">
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {presets.map(p => (
                            <button
                                key={p.label}
                                onClick={() => handlePresetClick(p)}
                                className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${activePreset === p.label ? 'bg-orange-500 text-white' : 'bg-white/5 hover:bg-white/10'}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="border-t border-white/10 pt-4">
                        <p className="text-sm font-bold text-gray-300 mb-2">نطاق مخصص</p>
                        <div className="space-y-3">
                             <input
                                type="date"
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-white text-sm font-mono focus:ring-1 focus:ring-orange-500 focus:border-orange-500 [&::-webkit-calendar-picker-indicator]:invert"
                            />
                            <input
                                type="date"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-white text-sm font-mono focus:ring-1 focus:ring-orange-500 focus:border-orange-500 [&::-webkit-calendar-picker-indicator]:invert"
                            />
                            <button
                                onClick={handleCustomApply}
                                className="w-full bg-orange-500 text-white font-bold py-2 rounded-lg hover:bg-orange-400 transition-colors"
                            >
                                تطبيق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;