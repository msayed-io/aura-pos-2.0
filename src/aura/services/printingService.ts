import React, { ReactElement } from 'react';
import { Order } from '../components/dashboard/dashboardTypes';
import PrintableDeliveryInvoice from '../components/invoices/PrintableDeliveryInvoice';
import PrintableDineInInvoice from '../components/invoices/PrintableDineInInvoice';
import PrintableKitchenInvoice from '../components/invoices/PrintableKitchenInvoice';

export type InvoiceType = 'delivery' | 'dine_in' | 'kitchen';
export type PrintErrorCode =
  | 'PRINT_UNAVAILABLE'
  | 'PRINTER_SETTINGS_MISSING'
  | 'PRINTER_UNASSIGNED'
  | 'PRINT_IPC_FAILED'
  | 'PRINT_ROOT_MISSING'
  | 'PRINT_INITIALIZATION_FAILED'
  | 'PRINT_STATUS_UNKNOWN'
  | 'UNKNOWN_INVOICE_TYPE';

const SAFE_PRINT_MESSAGES: Record<PrintErrorCode, string> = {
  PRINT_UNAVAILABLE: 'الطباعة غير متاحة في هذه البيئة.',
  PRINTER_SETTINGS_MISSING: 'إعدادات الطابعة غير متوفرة. راجع إعدادات الطباعة.',
  PRINTER_UNASSIGNED: 'لا توجد طابعة مخصصة لهذا النوع. راجع إعدادات الطباعة.',
  PRINT_IPC_FAILED: 'تعذر إرسال مهمة الطباعة. راجع الطابعة وحاول مجدداً.',
  PRINT_ROOT_MISSING: 'تعذر تجهيز صفحة الطباعة. أعد المحاولة أو راجع الدعم.',
  PRINT_INITIALIZATION_FAILED: 'تعذر بدء الطباعة. أعد المحاولة.',
  PRINT_STATUS_UNKNOWN: 'لم يؤكد المتصفح انتهاء الطباعة. راجع حالة الطابعة والطلب قبل إعادة الطباعة.',
  UNKNOWN_INVOICE_TYPE: 'نوع الفاتورة غير معروف؛ تعذر بدء الطباعة.',
};

export class PrintError extends Error {
  constructor(
    readonly code: PrintErrorCode,
    readonly operation: InvoiceType,
  ) {
    super(SAFE_PRINT_MESSAGES[code]);
    this.name = 'PrintError';
  }
}

interface PrintJob {
  component: React.ReactElement;
  type: InvoiceType;
  resolve: () => void;
  reject: (error: PrintError) => void;
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
    if (!job) {
        isPrinting = false;
        return;
    }

    let finished = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const handleAfterPrint = () => finishJob();
    const finishJob = (error?: PrintError) => {
        if (finished) return;
        finished = true;
        if (startTimer) clearTimeout(startTimer);
        if (deadlineTimer) clearTimeout(deadlineTimer);
        window.removeEventListener('afterprint', handleAfterPrint);
        if (printableRoot) {
            printableRoot.unmount();
            printableRoot = null;
        }
        isPrinting = false;
        if (error) job.reject(error);
        else job.resolve();
        setTimeout(processBrowserPrintQueue, 500);
    };

    const printableRootEl = document.getElementById('printable-content');
    if (!printableRootEl) {
        finishJob(new PrintError('PRINT_ROOT_MISSING', job.type));
        return;
    }

    try {
        deadlineTimer = setTimeout(() => finishJob(new PrintError('PRINT_STATUS_UNKNOWN', job.type)), 15000);
        const { createRoot } = await import('react-dom/client');
        if (finished) return;
        printableRoot = createRoot(printableRootEl);
        printableRoot.render(job.component);

        window.addEventListener('afterprint', handleAfterPrint);

        startTimer = setTimeout(() => {
            if (finished) return;
            try {
                window.print();
            } catch {
                finishJob(new PrintError('PRINT_INITIALIZATION_FAILED', job.type));
            }
        }, 300);
    } catch {
        finishJob(new PrintError('PRINT_INITIALIZATION_FAILED', job.type));
    }
};

/**
 * Main printing function. It now acts as a router.
 * If Electron API is available, it uses the new direct printing method.
 * Otherwise, it falls back to the old browser-based printing queue.
 */
export const printOrderInvoice = async (order: Order, type: InvoiceType, logoUrl: string | null, cashierId?: string, cashierName?: string): Promise<void> => {
    // Guard: printing is only available in the browser
    if (typeof window === 'undefined') {
        throw new PrintError('PRINT_UNAVAILABLE', type);
    }

    // --- ELECTRON DIRECT PRINTING PATH ---
    if (window.electronAPI) {
        let settings;
        try {
            settings = await window.electronAPI.loadPrinterSettings();
        } catch {
            throw new PrintError('PRINT_IPC_FAILED', type);
        }
        if (!settings) {
            throw new PrintError('PRINTER_SETTINGS_MISSING', type);
        }

        const printerName = type === 'kitchen' ? settings.kitchenPrinter : settings.cashierPrinter;
        if (!printerName) {
            throw new PrintError('PRINTER_UNASSIGNED', type);
        }

        try {
            await window.electronAPI.print({ printer: printerName, data: order, type });
        } catch {
            throw new PrintError('PRINT_IPC_FAILED', type);
        }

    // --- BROWSER FALLBACK PRINTING PATH ---
    } else {
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
                throw new PrintError('UNKNOWN_INVOICE_TYPE', type);
        }

        await new Promise<void>((resolve, reject) => {
            printQueue.push({
                component: InvoiceComponent,
                type,
                resolve,
                reject: (error) => reject(error),
            });
            void processBrowserPrintQueue();
        });
    }
};
