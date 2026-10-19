'use client';

import React from 'react';
import { useOffline } from '../contexts/OfflineContext';
import { Wifi, WifiOff, RefreshCw, CloudOff } from 'lucide-react';

type BadgeVariant = 'light' | 'dark';

interface ConnectivityBadgeProps {
  /** Visual variant to match the parent header theme */
  variant?: BadgeVariant;
  /** Optional extra CSS classes */
  className?: string;
}

/**
 * ConnectivityBadge - An inline badge for showing connectivity status
 * inside page headers. Adapts visually to light or dark header themes.
 *
 * - Green dot + "متصل" when online
 * - Orange pulsing dot + "غير متصل" when offline
 * - Spinning icon + "جاري المزامنة" when syncing
 * - Pending operations count badge when offline
 */
const ConnectivityBadge: React.FC<ConnectivityBadgeProps> = ({
  variant = 'light',
  className = '',
}) => {
  const { isOnline, status, pendingCount, forceSync } = useOffline();

  const isDark = variant === 'dark';

  // ── Syncing state ──
  if (status === 'syncing') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold select-none
          ${isDark
            ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20'
            : 'bg-blue-50 text-blue-700 border border-blue-200'
          } ${className}`}
        aria-label="جاري المزامنة"
      >
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>مزامنة</span>
      </div>
    );
  }

  // ── Offline state ──
  if (!isOnline || status === 'offline') {
    return (
      <button
        onClick={forceSync}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold
          transition-all duration-200 cursor-pointer select-none
          ${isDark
            ? 'bg-orange-500/15 text-orange-300 border border-orange-500/20 hover:bg-orange-500/25'
            : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
          } ${className}`}
        aria-label="غير متصل - انقر للمزامنة"
        title="انقر لمحاولة المزامنة"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
        </span>
        <WifiOff className="h-3 w-3" />
        <span>غير متصل</span>
        {pendingCount > 0 && (
          <span className={`inline-flex items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-bold leading-none
            ${isDark ? 'bg-orange-500/30 text-orange-200' : 'bg-orange-200 text-orange-800'}`}>
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  // ── Online state (compact, subtle) ──
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold select-none
        ${isDark
          ? 'bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/15'
          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        } ${className}`}
      aria-label="متصل بالإنترنت"
    >
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <Wifi className="h-3 w-3" />
      <span>متصل</span>
    </div>
  );
};

export default ConnectivityBadge;
