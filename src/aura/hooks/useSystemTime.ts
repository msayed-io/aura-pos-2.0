import { useState, useEffect } from 'react';

// Centralized helper for Arabic numerals
export const toArabicDigits = (num: number | string): string => {
    const arabicMap = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num).replace(/[0-9]/g, (digit) => arabicMap[parseInt(digit, 10)]);
};

// Centralized helper for duration formatting
export const formatDuration = (milliseconds: number): string => {
    if (milliseconds < 0) milliseconds = 0;
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};


// The main hook for providing real-time date object
export const useSystemTime = () => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timerId = setInterval(() => {
            setNow(new Date());
        }, 1000);

        return () => clearInterval(timerId);
    }, []);

    return now;
};
