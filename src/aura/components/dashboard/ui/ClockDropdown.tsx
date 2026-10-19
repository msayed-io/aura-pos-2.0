import React from 'react';
import { CalendarDaysIcon, PowerIcon } from '../Icons';
import { useSystemTime, toArabicDigits, formatDuration } from '../../../hooks/useSystemTime';

interface ClockDropdownProps {
  systemStartTime: Date;
}

const ClockDropdown: React.FC<ClockDropdownProps> = ({ systemStartTime }) => {
    const now = useSystemTime();
    
    const uptime = formatDuration(now.getTime() - systemStartTime.getTime());

    const formattedTime = now.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });

    const formattedDate = now.toLocaleDateString('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return (
        <div className="absolute top-full mt-3 left-0 w-80 bg-white rounded-2xl shadow-2xl border border-neo-soft-gray z-50 animate-zoom-in-95 origin-top-left overflow-hidden">
            <div className="p-6 text-center border-b border-gray-200/80">
                <p className="text-5xl font-black text-neo-secondary font-mono" dir="ltr">
                    {toArabicDigits(formattedTime)}
                </p>
            </div>
            <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 text-neo-secondary/80">
                    <CalendarDaysIcon className="w-5 h-5 flex-shrink-0 text-neo-primary" />
                    <p className="text-sm font-bold">{toArabicDigits(formattedDate)}</p>
                </div>
                <div className="flex items-center gap-3 text-neo-secondary/80">
                    <PowerIcon className="w-5 h-5 flex-shrink-0 text-neo-success" />
                    <p className="text-sm font-semibold">
                        مدة تشغيل النظام: <span className="font-mono font-bold text-neo-secondary tracking-wider" dir="ltr">{toArabicDigits(uptime)}</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ClockDropdown;
