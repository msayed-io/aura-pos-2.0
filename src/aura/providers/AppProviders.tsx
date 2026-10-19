import React from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { PaymentLogosProvider } from '../contexts/PaymentLogosContext';
import { AppProvider } from '../contexts/AppContext';
import { DashboardProvider } from '../components/dashboard/DashboardContext';
import { OfflineProvider } from '../contexts/OfflineContext';

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <AuthProvider>
      <BrandingProvider>
        <PaymentLogosProvider>
          <AppProvider>
            <OfflineProvider>
              <DashboardProvider>
                {children}
              </DashboardProvider>
            </OfflineProvider>
          </AppProvider>
        </PaymentLogosProvider>
      </BrandingProvider>
    </AuthProvider>
  );
};
