import React, { ReactElement } from 'react';
import { Order } from '../components/dashboard/dashboardTypes';
import PrintableDeliveryInvoice from '../components/invoices/PrintableDeliveryInvoice';
import PrintableDineInInvoice from '../components/invoices/PrintableDineInInvoice';
import PrintableKitchenInvoice from '../components/invoices/PrintableKitchenInvoice';

export type InvoiceType = 'delivery' | 'dine_in' | 'kitchen';

// Define the Electron API on the window object for TypeScript
declare global {
  interface Window {
    electronAPI?: {
      getPrinters: () => Promise<any[]>;
      print: (args: { printer: string; data: Order; type: InvoiceType }) => Promise<void>;
      savePrinterSettings: (settings: { cashierPrinter: string; kitchenPrinter: string; }) => Promise<void>;
      loadPrinterSettings: () => Promise<{ cashierPrinter: string; kitchenPrinter: string; } | null>;
    };
  }
}

interface PrintJob {
  component: React.ReactElement;
}

// --- BROWSER-ONLY PRINTING QUEUE ---
const printQueue: PrintJob[] = [];
let isPrinting = false;
let printableRoot: any = null;

const processBrowserPrintQueue = async () => {
    if (isPrinting || printQueue.length === 0) {
        return;
    }

    // Guard: only run in browser
    if (typeof window === 'undefined') return;

    isPrinting = true;
    const job = printQueue.shift();

    if (job) {
        const printableRootEl = document.getElementById('printable-content');
        if (!printableRootEl) {
            console.error('Printable root element #printable-content not found!');
            isPrinting = false;
            return;
        }

        try {
            const { createRoot } = await import('react-dom/client');
            printableRoot = createRoot(printableRootEl);
            printableRoot.render(job.component);

            const handleAfterPrint = () => {
                if (printableRoot) {
                    printableRoot.unmount();
                    printableRoot = null;
                }
                window.removeEventListener('afterprint', handleAfterPrint);
                isPrinting = false;
                setTimeout(processBrowserPrintQueue, 500); // Increased delay
            };

            window.addEventListener('afterprint', handleAfterPrint);

            setTimeout(() => {
                window.print();
            }, 300);
        } catch (error) {
            console.error('Failed to initialize react-dom/client for printing:', error);
            isPrinting = false;
        }
    }
};


/**
 * Main printing function. It now acts as a router.
 * If Electron API is available, it uses the new direct printing method.
 * Otherwise, it falls back to the old browser-based printing queue.
 */
export const printOrderInvoice = async (order: Order, type: InvoiceType, logoUrl: string | null, cashierId?: string, cashierName?: string) => {
    // Guard: printing is only available in the browser
    if (typeof window === 'undefined') return;

    // --- ELECTRON DIRECT PRINTING PATH ---
    if (window.electronAPI) {
        console.log(`Electron API detected. Attempting direct print for type: ${type}`);
        try {
            const settings = await window.electronAPI.loadPrinterSettings();
            if (!settings) {
                console.error('Printing failed: Printer settings are not configured.');
                // Here you might want to show a toast to the user.
                return;
            }
            
            const printerName = type === 'kitchen' ? settings.kitchenPrinter : settings.cashierPrinter;
            
            if (!printerName) {
                 console.error(`Printing failed: No printer assigned for type "${type}". Please check settings.`);
                 return;
            }

            await window.electronAPI.print({ printer: printerName, data: order, type });
            console.log(`Print job for order ${order.id} sent to printer ${printerName}.`);

        } catch (error) {
            console.error('Electron direct printing failed:', error);
        }
    
    // --- BROWSER FALLBACK PRINTING PATH ---
    } else {
        console.log(`No Electron API. Falling back to browser printing for type: ${type}`);
        
        let InvoiceComponent: ReactElement;
        const props: { order: Order; logoUrl?: string | null; cashierName?: string } = { order };

        if (type === 'delivery' || type === 'dine_in') {
            props.logoUrl = logoUrl;
            props.cashierName = cashierName || 'System';
        }

        switch (type) {
            case 'delivery':
                InvoiceComponent = React.createElement(PrintableDeliveryInvoice, props as React.ComponentProps<typeof PrintableDeliveryInvoice>);
                break;
            case 'dine_in':
                InvoiceComponent = React.createElement(PrintableDineInInvoice, props as React.ComponentProps<typeof PrintableDineInInvoice>);
                break;
            case 'kitchen':
                InvoiceComponent = React.createElement(PrintableKitchenInvoice, { order } as React.ComponentProps<typeof PrintableKitchenInvoice>);
                break;
            default:
                console.error('Unknown invoice type:', type);
                return;
        }
        
        printQueue.push({ component: InvoiceComponent });
        processBrowserPrintQueue();
    }
};
