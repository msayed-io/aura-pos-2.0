'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { offlineSyncService, ConnectivityStatus, OfflineState } from '../services/offlineSyncService';

interface OfflineContextType {
  isOnline: boolean;
  status: ConnectivityStatus;
  pendingCount: number;
  lastSyncTime: number | null;
  forceSync: () => void;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<OfflineState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    status: typeof navigator !== 'undefined' ? (navigator.onLine ? 'online' : 'offline') : 'online',
    pendingOperationsCount: 0,
    lastSyncTimestamp: null,
  });

  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Initialize the sync service
    offlineSyncService.init().catch((err) => {
      console.error('[OfflineContext] Failed to init offline sync service:', err);
    });

    // Subscribe to state changes
    const unsubscribe = offlineSyncService.subscribe((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const forceSync = useCallback(() => {
    offlineSyncService.syncNow().catch((err) => {
      console.error('[OfflineContext] Force sync failed:', err);
    });
  }, []);

  const contextValue: OfflineContextType = {
    isOnline: state.isOnline,
    status: state.status,
    pendingCount: state.pendingOperationsCount,
    lastSyncTime: state.lastSyncTimestamp,
    forceSync,
  };

  return (
    <OfflineContext.Provider value={contextValue}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};

export type { OfflineContextType, ConnectivityStatus };
