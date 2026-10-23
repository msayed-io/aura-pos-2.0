
import React, { useState, useEffect } from 'react';
import { AppProviders } from './providers/AppProviders';
import POSSystem from './POSSystem';
import Dashboard from './components/dashboard/Dashboard';
import { SECRET_CODES } from './constants';
import AuraAnalytics from './pages/AuraAnalytics';
import SettingsPage from './pages/SettingsPage';
import { Volume2Icon } from './components/dashboard/Icons';
import OnlineLogPage from './components/dashboard/pages/OnlineLogPage';
import { useAuth } from './contexts/AuthContext';

type AppView = 'pos' | 'dashboard' | 'analytics' | 'settings' | 'online_log';
type SettingsTab = 'menu' | 'branding' | 'offers' | 'coupons' | 'notifications' | 'printing' | 'botai' | 'system';


const AudioUnlocker = ({ unlockAudio }: { unlockAudio: () => void }) => (
  <div 
    className="fixed inset-0 z-[10000] bg-black/80 flex flex-col items-center justify-center cursor-pointer animate-fade-in"
    onClick={unlockAudio}
    role="button"
    tabIndex={0}
    aria-label="Click to enable sound"
  >
    <Volume2Icon className="w-24 h-24 text-white animate-pulse" />
    <h1 className="text-white text-3xl font-bold mt-6 font-cairo">انقر في أي مكان لتفعيل الصوت</h1>
    <p className="text-white/70 mt-2 max-w-sm text-center">
      يتطلب المتصفح تفاعلاً من المستخدم لتشغيل إشعارات الطلبات الجديدة تلقائياً.
    </p>
  </div>
);

function MainApp() {
  const { currentUser } = useAuth();

  const [currentView, setCurrentView] = useState<AppView>('pos');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [systemStartTime] = useState(new Date()); // Persists across view changes
  const [initialSettingsTab, setInitialSettingsTab] = useState<SettingsTab>('menu');


  const handleLogout = () => {
    // As per instructions, all services are now stateless or gutted.
    // A simple page reload is sufficient to reset the application state.
    console.log("Logout action triggered. Reloading page.");
    window.location.reload();
  };

  const showAnalytics = () => {
    if (currentUser?.accessLevel === 'Admin') {
      setCurrentView('analytics');
    }
  };
  const showSettings = (initialTab: SettingsTab = 'menu') => {
    if (currentUser?.accessLevel === 'Admin') {
      setInitialSettingsTab(initialTab);
      setCurrentView('settings');
    }
  };
  const showDashboard = () => setCurrentView('dashboard');
  const showOnlineLog = () => setCurrentView('online_log');

  const backgroundClass = ['dashboard', 'pos', 'settings'].includes(currentView) ? 'bg-neo-bg' : 'bg-secondary';

  const unlockAudio = async () => {
    try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        const buffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);

        console.log("Audio context unlocked successfully.");
    } catch (error) {
        console.error("Audio context unlock failed.", error);
    } finally {
        setIsAudioUnlocked(true);
    }
  };

  if (!currentUser) {
    // This should no longer happen with the mock auth provider, but kept as a safeguard.
    return null;
  }

  const renderView = () => {
    switch(currentView) {
      case 'pos':
        return <POSSystem onExit={showDashboard} />;
      case 'dashboard':
        return (
          <Dashboard 
            onLogout={handleLogout}
            securitySettings={SECRET_CODES}
            onNavigateToPOS={() => setCurrentView('pos')}
            onNavigateToAnalytics={showAnalytics}
            onNavigateToSettings={showSettings}
            systemStartTime={systemStartTime}
            currentUser={currentUser}
          />
        );
      case 'analytics':
        return <AuraAnalytics 
                  onExit={showDashboard} 
                  onNavigateToOnlineLog={showOnlineLog}
               />;
      case 'settings':
        return <SettingsPage onExit={showDashboard} initialTab={initialSettingsTab} />;
      case 'online_log':
        return <div className="dashboard-theme h-full dashboard-body p-8"><OnlineLogPage onBack={showAnalytics} /></div>;
      default:
        return null;
    }
  }

  return (
    <div className={`h-full w-full ${backgroundClass}`}>
        {!isAudioUnlocked && <AudioUnlocker unlockAudio={unlockAudio} />}
        {renderView()}
    </div>
  );
}

function App() {
  return (
    <AppProviders>
      <MainApp />
    </AppProviders>
  );
}

export default App;
