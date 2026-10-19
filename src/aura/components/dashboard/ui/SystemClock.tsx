import React from 'react';
import { useSystemTime, toArabicDigits } from '../../../hooks/useSystemTime';

interface SystemClockProps {
  onClick: () => void;
}

const SystemClock: React.FC<SystemClockProps> = ({ onClick }) => {
    const now = useSystemTime();

    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    const ampm = hours >= 12 ? 'م' : 'ص'; // مساءً / صباحًا

    hours = hours % 12;
    hours = hours ? hours : 12; // تحويل الساعة '0' إلى '12' لنظام 12 ساعة

    return (
        <button 
            onClick={onClick} 
            className="group h-12 px-4 rounded-xl bg-gray-100/70 hover:bg-white transition-all duration-300 cursor-pointer border border-gray-200/50 shadow-sm flex items-center justify-center" 
            title="عرض تفاصيل الوقت"
        >
            <div className="flex items-baseline font-black text-2xl font-mono tracking-tight text-neo-secondary group-hover:text-neo-primary transition-colors" dir="ltr">
                {/* AM/PM Indicator */}
                <span className="text-sm font-bold text-gray-500 group-hover:text-neo-primary/80 transition-colors mr-2">{ampm}</span>
                
                {/* Time */}
                <span>{toArabicDigits(hours)}</span>
                <span className="animate-pulse text-xl mx-0.5 group-hover:text-neo-primary/80 transition-colors">:</span>
                <span>{toArabicDigits(minutes)}</span>
            </div>
        </button>
    );
};

export default SystemClock;