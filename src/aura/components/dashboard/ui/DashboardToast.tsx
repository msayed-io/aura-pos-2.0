import React, { useEffect } from 'react';
import { CheckCircleIcon, ShieldExclamationIcon, InfoIcon } from '../Icons';

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
}

const typeConfig = {
    success: {
        icon: CheckCircleIcon,
        bgColor: 'bg-neo-success',
        textColor: 'text-white',
        animationClass: 'animate-toast-glow-success',
    },
    error: {
        icon: ShieldExclamationIcon,
        bgColor: 'bg-neo-error',
        textColor: 'text-white',
        animationClass: 'animate-toast-glow-error',
    },
    info: {
        icon: InfoIcon,
        bgColor: 'bg-neo-primary',
        textColor: 'text-white',
        animationClass: 'animate-toast-glow-info',
    },
};

const DashboardToast: React.FC<ToastProps> = ({ message, type, isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000); // Duration is 3 seconds
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const config = typeConfig[type];
  const IconComponent = config.icon;

  return (
    <div 
        // Style Change: Removed min-w-[300px] for adaptive width.
        // Style Change: Added a subtle glow animation based on the notification type.
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 w-auto max-w-xs p-3 rounded-xl ${config.bgColor} ${config.textColor} ${config.animationClass} transition-all duration-500 ease-in-out z-[200]
            ${isVisible ? 'transform translate-y-0 opacity-100' : 'transform translate-y-10 opacity-0 pointer-events-none'}
        `}
        role="alert"
    >
      <div className="flex-shrink-0">
        <IconComponent className="w-5 h-5" />
      </div>
      <p className="flex-grow text-sm font-semibold">{message}</p>
    </div>
  );
};

export default DashboardToast;