import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';

interface PaymentLogos {
  vodafoneCash: string | null;
  instapay: string | null;
}

const PaymentLogosContext = createContext<PaymentLogos>({
  vodafoneCash: null,
  instapay: null,
});

export const PaymentLogosProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // FIX: State is now static as the service is gutted.
  const [logos] = useState<PaymentLogos>({
    vodafoneCash: null,
    instapay: null,
  });

  // FIX: useEffect is gutted as Firebase connection is removed.
  useEffect(() => {
    // Service is now stateless.
    console.log("PaymentLogos service is offline.");
  }, []);

  return (
    <PaymentLogosContext.Provider value={logos}>
      {children}
    </PaymentLogosContext.Provider>
  );
};

export const usePaymentLogos = (): PaymentLogos => {
  const context = useContext(PaymentLogosContext);
  if (context === undefined) {
    throw new Error('usePaymentLogos must be used within a PaymentLogosProvider');
  }
  return context;
};
