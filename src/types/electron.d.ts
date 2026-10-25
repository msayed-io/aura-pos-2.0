import type { InvoiceType } from '../aura/services/printingService';
import type { Order } from '../aura/components/dashboard/dashboardTypes';

type WhatsAppConnectionState = 'idle' | 'connecting' | 'qr' | 'pairing' | 'connected' | 'reconnecting' | 'needs-attention' | 'paused' | 'stopping' | 'stopped';

declare global {
  interface Window {
    electronAPI?: {
      getPrinters: () => Promise<Array<{ name: string; displayName?: string; isDefault?: boolean }>>;
      print: (args: { printer: string; data: Order; type: InvoiceType }) => Promise<void>;
      savePrinterSettings: (settings: { cashierPrinter: string; kitchenPrinter: string }) => Promise<void>;
      loadPrinterSettings: () => Promise<{ cashierPrinter: string; kitchenPrinter: string } | null>;
      showNotification: (payload: { title: string; body: string }) => Promise<void>;
      notifyNewOrder: (displayId: string) => Promise<boolean>;
      getWhatsAppStatus: () => Promise<{ state: WhatsAppConnectionState; qr: string | null; pairingCode: string | null }>;
      connectWhatsApp: () => Promise<boolean>;
      pairWhatsApp: (phoneNumber: string) => Promise<boolean>;
      disconnectWhatsApp: () => Promise<boolean>;
      getGeminiKeyStatus: () => Promise<{ configured: boolean; encryptionAvailable: boolean; errorCode?: string }>;
      saveGeminiApiKey: (apiKey: string) => Promise<{ configured: boolean }>;
      clearGeminiApiKey: () => Promise<{ configured: boolean }>;
      testGeminiApiKey: () => Promise<{ ok: boolean; model: string | null }>;
      onWhatsAppStatus: (callback: (payload: { state: WhatsAppConnectionState }) => void) => () => void;
      onWhatsAppQr: (callback: (qr: string | null) => void) => () => void;
      onWhatsAppPairingCode: (callback: (code: string | null) => void) => () => void;
    };
  }
}

export {};
