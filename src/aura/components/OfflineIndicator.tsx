'use client';

import React from 'react';
import { useOffline } from '../contexts/OfflineContext';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

/**
 * OfflineIndicator - A small, elegant indicator for connectivity status.
 * Shows in the top-right corner with Arabic text.
 * - Green dot + "متصل" when online
 * - Orange dot + "غير متصل" when offline
 * - Spinning icon + "جاري المزامنة..." when syncing
 * - Pending operations count when offline
 */
const OfflineIndicator: React.FC = () => {
  const { isOnline, status, pendingCount, forceSync } = useOffline();

  // Syncing state
  if (status === 'syncing') {
    return (
      <button
        onClick={forceSync}
        className="fixed top-4 left-4 z-[9999] flex items-center gap-2 rounded-full
                   bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800
                   px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300
                   shadow-sm transition-all duration-300 hover:shadow-md
                   cursor-default select-none"
        aria-label="جاري المزامنة"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>جاري المزامنة...</span>
      </button>
    );
  }

  // Offline state
  if (!isOnline || status === 'offline') {
    return (
      <button
        onClick={forceSync}
        className="fixed top-4 left-4 z-[9999] flex items-center gap-2 rounded-full
                   bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800
                   px-3 py-1.5 text-xs font-medium text-orange-700 dark:text-orange-300
                   shadow-sm transition-all duration-300 hover:shadow-md
                   cursor-pointer select-none"
        aria-label="غير متصل - انقر للمزامنة"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
        </span>
        <WifiOff className="h-3.5 w-3.5" />
        <span>غير متصل</span>
        {pendingCount > 0 && (
          <span className="inline-flex items-center justify-center
                           bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200
                           rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
            {pendingCount}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-orange-600 dark:text-orange-400 hidden sm:inline">
            عمليات معلقة
          </span>
        )}
      </button>
    );
  }

  // Online state
  return (
    <div
      className="fixed top-4 left-4 z-[9999] flex items-center gap-2 rounded-full
                 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800
                 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300
                 shadow-sm transition-all duration-300 select-none"
      aria-label="متصل بالإنترنت"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <Wifi className="h-3.5 w-3.5" />
      <span>متصل</span>
    </div>
  );
};

export default OfflineIndicator;
