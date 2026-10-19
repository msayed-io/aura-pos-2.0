import React, { useEffect } from 'react';
import type { Order } from '../dashboardTypes';

interface PrintableInvoiceProps {
  order: Order;
  logoUrl: string | null;
  onReady: () => void;
}

const PrintableCashierInvoice: React.FC<PrintableInvoiceProps> = ({ order, logoUrl, onReady }) => {
  useEffect(() => {
    // A small delay to ensure the component is fully rendered before printing
    const timer = setTimeout(onReady, 100);
    return () => clearTimeout(timer);
  }, [onReady]);

  return (
    <div className="invoice-base" style={{ width: '80mm', fontFamily: 'monospace', color: 'black', backgroundColor: 'white', padding: '5mm' }}>
      <h2 style={{ textAlign: 'center' }}>فاتورة الكاشير</h2>
      <p>رقم الطلب: {order.id}</p>
      <p>العميل: {order.customer?.name || 'غير معروف'}</p>
      <hr />
      <ul>
        {order.items.map(item => (
          <li key={item.id}>{item.name} x {item.quantity} - {item.price.toFixed(2)}</li>
        ))}
      </ul>
      <hr />
      <p style={{ fontWeight: 'bold' }}>الإجمالي: {order.summary?.total?.toFixed(2) || '0.00'} جنيه</p>
    </div>
  );
};

export default PrintableCashierInvoice;
