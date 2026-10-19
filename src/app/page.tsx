'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';

const AuraApp = dynamic(() => import('@/aura/App'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white">
      <div className="relative w-24 h-24 mb-6">
        <div className="absolute inset-0 border-4 border-orange-100 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-orange-500 rounded-full border-t-transparent animate-spin"></div>
        <div className="absolute inset-4 flex items-center justify-center">
          <img src="/logo_aura.webp" alt="Aura POS" className="w-10 h-10 object-contain animate-pulse" />
        </div>
      </div>
      <h2 className="text-xl font-bold text-gray-800 font-sans">Aura POS 2.0</h2>
      <p className="text-sm text-gray-500 mt-2 font-sans">جاري تحميل النظام...</p>
    </div>
  ),
});

/**
 * منع الزوم بالكامل على مستوى التطبيق
 * - يمنع pinch-to-zoom على الأجهزة اللمسية
 * - يمنع double-tap zoom
 * - يمنع Ctrl+Scroll zoom
 * - يمنع الزوم التلقائي على خانات الإدخال
 * ضروري لـ Electron.js ومتوافق مع المتصفح العادي
 */
function usePreventZoom() {
  useEffect(() => {
    // منع pinch-to-zoom (Ctrl + scroll)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // منع double-tap zoom و pinch-zoom على اللمس
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    // منع double-tap zoom
    let lastTouchEnd = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    // منع keyboard zoom shortcuts (Ctrl + +/-/0)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

export default function Home() {
  usePreventZoom();
  return <AuraApp />;
}
