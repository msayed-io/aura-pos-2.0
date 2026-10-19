import type { InvoiceType } from '../aura/services/printingService';
import type { Order } from '../aura/components/dashboard/dashboardTypes';

declare global {
  interface Window {
    electronAPI?: {
      getPrinters: () => Promise<Array<{ name: string; displayName?: string; isDefault?: boolean }>>;
      print: (args: { printer: string; data: Order; type: InvoiceType }) => Promise<void>;
      savePrinterSettings: (settings: { cashierPrinter: string; kitchenPrinter: string }) => Promise<void>;
      loadPrinterSettings: () => Promise<{ cashierPrinter: string; kitchenPrinter: string } | null>;
      showNotification: (payload: { title: string; body: string }) => Promise<void>;
    };
  }
}

export {};
