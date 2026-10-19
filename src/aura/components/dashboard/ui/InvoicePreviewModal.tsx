import React from 'react';
import { createPortal } from 'react-dom';
import type { Order } from '../dashboardTypes';
import { XIcon } from '../Icons';
import PrintableDineInInvoice from '../../invoices/PrintableDineInInvoice';
import PrintableDeliveryInvoice from '../../invoices/PrintableDeliveryInvoice';
import PrintableKitchenInvoice from '../../invoices/PrintableKitchenInvoice';
import { User } from '../../../types';
import { useBranding } from '../../../contexts/BrandingContext';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  currentUser: User | null;
}

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({ isOpen, onClose, order, currentUser }) => {
  const { logoUrl } = useBranding();
  if (!isOpen || !order) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  const cashierName = currentUser?.username || 'System';

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 modal-backdrop-blur"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-neo-bg rounded-2xl shadow-2xl w-full max-w-7xl overflow-hidden relative z-10 animate-scale-in duration-300 flex flex-col h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 flex justify-between items-center text-neo-secondary relative border-b border-neo-soft-gray">
          <h2 className="text-2xl font-extrabold">معاينة الفواتير</h2>
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 bg-gray-200/70 rounded-full text-gray-600 hover:text-neo-secondary hover:bg-gray-300/80 transition-colors"
            aria-label="إغلاق"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body - UPDATED */}
        <div className="flex-grow overflow-auto p-8 bg-gray-200">
          <div className="flex justify-center gap-8">
            
            {/* Dine-In Invoice Preview - UPDATED */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <h3 className="text-center font-bold mb-2 text-neo-secondary">فاتورة الصالة</h3>
              <div className="bg-white rounded-lg shadow-lg w-[80mm] flex-shrink-0">
                 <PrintableDineInInvoice order={order} cashierName={cashierName} />
              </div>
            </div>

            {/* Delivery Invoice Preview - UPDATED */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <h3 className="text-center font-bold mb-2 text-neo-secondary">فاتورة التوصيل/الاستلام</h3>
              <div className="bg-white rounded-lg shadow-lg w-[80mm] flex-shrink-0">
                 <PrintableDeliveryInvoice order={order} cashierName={cashierName} />
              </div>
            </div>

            {/* Kitchen Invoice Preview - UPDATED */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <h3 className="text-center font-bold mb-2 text-neo-secondary">فاتورة المطبخ</h3>
              <div className="bg-white rounded-lg shadow-lg w-[80mm] flex-shrink-0">
                 <PrintableKitchenInvoice order={order} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default InvoicePreviewModal;