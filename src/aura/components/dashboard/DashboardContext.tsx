import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import DashboardToast, { ToastProps } from './ui/DashboardToast';

interface ToastOptions extends Omit<ToastProps, 'onClose' | 'isVisible'> {
  playSound?: boolean;
}

interface DashboardContextType {
  showToast: (options: ToastOptions) => void;
  playSound: (type?: 'success' | 'error' | 'info') => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<(ToastProps & { id: number }) | null>(null);

  const getNotificationSettings = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('hotbroast_notification_settings');
        if (saved) return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
    return { isEnabled: true, volume: 80, soundUrl: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' };
  }, []);

  const playSound = useCallback((type: 'success' | 'error' | 'info' = 'info') => {
    const settings = getNotificationSettings();
    if (!settings.isEnabled) return;

    // Use specific sounds for specific types if desired, otherwise use default
    const audio = new Audio(settings.soundUrl);
    audio.volume = settings.volume / 100;
    audio.play().catch(e => console.warn("Audio playback blocked or failed", e));
  }, [getNotificationSettings]);

  const showToast = useCallback((options: ToastOptions) => {
    setToast({ ...options, id: Date.now(), isVisible: true, onClose: () => setToast(null) });
    if (options.playSound) {
      playSound(options.type);
    }
  }, [playSound]);

  return (
    <DashboardContext.Provider value={{ showToast, playSound }}>
      {children}
      {toast && (
        <DashboardToast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={toast.onClose}
        />
      )}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
