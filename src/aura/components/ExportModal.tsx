import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // This extends jsPDF with the autoTable method
import { Order, OrderSource, ExportFormat, ExportOptions, OrderKeys } from '../types';
import { DownloadIcon } from './dashboard/Icons';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  defaultDateRange: { start: Date; end: Date };
}

// Helper to format date for input fields
const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, orders, defaultDateRange }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(ExportFormat.PDF); // Default to PDF
  const [exportStartDate, setExportStartDate] = useState<string>(formatDateForInput(defaultDateRange.start));
  const [exportEndDate, setExportEndDate] = useState<string>(formatDateForInput(defaultDateRange.end));
  const [selectedFields, setSelectedFields] = useState<OrderKeys[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const availableFields: { key: OrderKeys; label: string; width?: number }[] = useMemo(() => [
    { key: 'id', label: 'رقم الطلب', width: 25 },
    { key: 'orderDate', label: 'التاريخ', width: 25 },
    { key: 'orderTime', label: 'الوقت', width: 20 },
    { key: 'source', label: 'المصدر', width: 20 },
    { key: 'type', label: 'نوع الطلب', width: 20 },
    { key: 'status', label: 'الحالة', width: 20 },
    { key: 'totalPrice', label: 'إجمالي السعر', width: 25 },
    { key: 'discount', label: 'الخصم', width: 20 },
    { key: 'itemCount', label: 'عدد العناصر', width: 20 },
    { key: 'itemDetails', label: 'تفاصيل العناصر', width: 60 },
    { key: 'customerId', label: 'العميل', width: 25 },
    { key: 'cashierId', label: 'الموظف', width: 25 },
    { key: 'preparationTimeSeconds', label: 'وقت التحضير (ثانية)', width: 30 },
    { key: 'branchId', label: 'معرف الفرع', width: 25 },
  ], []);

  useEffect(() => {
    if (isOpen) {
      setExportStartDate(formatDateForInput(defaultDateRange.start));
      setExportEndDate(formatDateForInput(defaultDateRange.end));
      setSelectedFields(availableFields.map(f => f.key)); // Select all fields by default
      setFeedbackMessage(null);
    }
  }, [isOpen, defaultDateRange, availableFields]);

  const handleFieldToggle = (fieldKey: OrderKeys) => {
    setSelectedFields(prev =>
      prev.includes(fieldKey) ? prev.filter(f => f !== fieldKey) : [...prev, fieldKey]
    );
  };

  const toggleSelectAllFields = () => {
    if (selectedFields.length === availableFields.length) {
      setSelectedFields([]);
    } else {
      setSelectedFields(availableFields.map(f => f.key));
    }
  };

  const processOrderData = (ordersToProcess: Order[], fields: OrderKeys[]) => {
    return ordersToProcess.map(order => {
      const row: Record<string, any> = {};
      fields.forEach(field => {
        switch (field) {
          case 'id': row['رقم الطلب'] = order.id; break;
          case 'orderDate': row['التاريخ'] = new Date(order.timestamp).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' }); break;
          case 'orderTime': row['الوقت'] = new Date(order.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); break;
          case 'source': row['المصدر'] = order.source === OrderSource.POS ? 'نقاط البيع' : (order.source === OrderSource.ONLINE ? 'أونلاين' : 'تجميع'); break;
          case 'type': row['نوع الطلب'] = order.type; break;
          case 'status': row['الحالة'] = order.status; break;
          case 'totalPrice': row['إجمالي السعر'] = (order.totalPrice || 0).toFixed(2); break;
          case 'discount': row['الخصم'] = (order.discount || 0).toFixed(2); break;
          case 'itemCount': row['عدد العناصر'] = order.items.length; break;
          case 'itemDetails': row['تفاصيل العناصر'] = order.items.map(i => `${i.name} (${i.quantity})`).join(' | '); break;
          case 'customerId': row['العميل'] = order.customerId || 'غير معروف'; break;
          case 'cashierId': row['الموظف'] = order.cashierId || '-'; break;
          case 'preparationTimeSeconds': row['وقت التحضير (ثانية)'] = order.preparationTimeSeconds; break;
          case 'branchId': row['معرف الفرع'] = order.branchId; break;
          default:
            const directField = field as Exclude<OrderKeys, 'itemDetails' | 'itemCount' | 'orderDate' | 'orderTime'>;
            if (order[directField] !== undefined) {
              row[availableFields.find(f => f.key === field)?.label || String(field)] = order[directField];
            }
            break;
        }
      });
      return row;
    });
  };

  const generatePdf = (data: Record<string, any>[], filename: string) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
    doc.setFont('Helvetica', 'normal');

    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15; // mm for general content
    const headerHeight = 25; // Height for the entire header section
    const footerHeight = 15; // Height for the entire footer section

    // AutoTable column configuration
    const headers = selectedFields.map(key => availableFields.find(f => f.key === key)?.label || String(key));
    const body = data.map(row => headers.map(header => row[header]));
    
    // Create column styles based on widths
    const columnStyles: { [key: number]: { cellWidth?: number, halign?: 'right' } } = {};
    selectedFields.forEach((fieldKey, index) => {
      const field = availableFields.find(f => f.key === fieldKey);
      if (field && field.width) {
        columnStyles[index] = { cellWidth: field.width };
      }
      columnStyles[index] = { ...columnStyles[index], halign: 'right' };
    });

    (doc as any).autoTable({
      startY: headerHeight + 5, // Start table below header
      head: [headers],
      body: body,
      theme: 'striped', // Cleaner theme
      styles: {
        font: 'Helvetica', // Use a standard font as Cairo is not embedded
        fontSize: 8,
        cellPadding: 2,
        halign: 'right', // Align text right for Arabic
        valign: 'middle',
        overflow: 'linebreak',
        lineColor: [50, 50, 50], // Darker grid lines
        lineWidth: 0.1,
        textColor: [200, 200, 200] // Light gray text
      },
      headStyles: {
        fillColor: [31, 31, 31], // Dark header background
        textColor: [255, 255, 255],
        fontStyle: 'bold', // 'bold' can be used with standard fonts like Helvetica
        halign: 'right', // Ensure header text is right-aligned
        fontSize: 9
      },
      bodyStyles: {
        fillColor: [42, 42, 42], // Dark body background
        textColor: [200, 200, 200],
      },
      alternateRowStyles: {
        fillColor: [50, 50, 50] // Slightly different for alternate rows
      },
      columnStyles: columnStyles, // Apply dynamic column widths and right align
      margin: { top: headerHeight, right: margin, bottom: footerHeight, left: margin },
      pageBreak: 'auto',
      didDrawPage: (hookData: any) => {
        // Current date for report generation
        const reportGenerationDate = new Date().toLocaleDateString('ar-EG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        // --- Header for each page ---
        doc.setFont('Helvetica', 'normal'); // Ensure font is set for header text (fallback)

        // Report Title
        doc.setFontSize(16);
        doc.setTextColor(255, 69, 0); // Primary color
        doc.text('تقرير تحليلات Aura POS', pageWidth / 2, 10, { align: 'center' });
        
        // Date Range
        doc.setFontSize(9);
        doc.setTextColor(180, 180, 180); // Gray color
        doc.text(`نطاق التواريخ: ${new Date(exportStartDate).toLocaleDateString('ar-EG')} - ${new Date(exportEndDate).toLocaleDateString('ar-EG')}`, pageWidth / 2, 16, { align: 'center' });

        // Branding (top-left/right)
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255); // White
        doc.text('Aura POS', pageWidth - margin, 10, { align: 'right' }); // Top Right

        // Header Line
        doc.setDrawColor(50, 50, 50); // Dark gray line
        doc.setLineWidth(0.2);
        doc.line(margin, headerHeight - 3, pageWidth - margin, headerHeight - 3);


        // --- Footer for each page ---
        doc.setFont('Helvetica', 'normal'); // Ensure font is set for footer text (fallback)
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150); // Lighter gray

        // Footer Line
        doc.setDrawColor(50, 50, 50); // Dark gray line
        doc.setLineWidth(0.2);
        doc.line(margin, pageHeight - footerHeight + 3, pageWidth - margin, pageHeight - footerHeight + 3);

        // Page number
        doc.text(`صفحة ${hookData.pageNumber} من ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
        
        // Generation Date
        doc.text(`تم الإنشاء في: ${reportGenerationDate}`, margin, pageHeight - 5, { align: 'left' });

        // Central Branding
        doc.setTextColor(255, 69, 0); // Primary color
        doc.setFontSize(7);
        doc.text('Aura POS', pageWidth / 2, pageHeight - 5, { align: 'center' });
      }
    });

    doc.save(filename);
  };

  const handleExport = () => {
    setIsLoading(true);
    setFeedbackMessage(null);

    const startDateMs = new Date(exportStartDate).setHours(0, 0, 0, 0);
    const endDateMs = new Date(exportEndDate).setHours(23, 59, 59, 999);

    if (startDateMs > endDateMs) {
      setFeedbackMessage('تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء.');
      setIsLoading(false);
      return;
    }
    if (selectedFields.length === 0) {
      setFeedbackMessage('الرجاء تحديد حقل واحد على الأقل للتصدير.');
      setIsLoading(false);
      return;
    }

    const filteredOrders = orders.filter(o =>
      o.timestamp >= startDateMs && o.timestamp <= endDateMs
    );

    if (filteredOrders.length === 0) {
      setFeedbackMessage('لا توجد بيانات مطابقة للمعايير المحددة.');
      setIsLoading(false);
      return;
    }

    const processedData = processOrderData(filteredOrders, selectedFields);

    let fileContent: string | Blob;
    let mimeType: string;
    let fileName: string;
    const dateTag = new Date().toISOString().slice(0, 10);

    if (selectedFormat === ExportFormat.CSV) {
      fileContent = Papa.unparse(processedData);
      const csvBlob = new Blob(["\ufeff" + fileContent], { type: 'text/csv;charset=utf-8;' });
      mimeType = 'text/csv;charset=utf-8;';
      fileName = `HotBroast_Report_${dateTag}.csv`;
      
      const url = URL.createObjectURL(csvBlob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (selectedFormat === ExportFormat.JSON) {
      fileContent = JSON.stringify(processedData, null, 2);
      mimeType = 'application/json';
      fileName = `HotBroast_Report_${dateTag}.json`;

      const blob = new Blob([fileContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (selectedFormat === ExportFormat.PDF) {
      fileName = `HotBroast_Report_${dateTag}.pdf`;
      generatePdf(processedData, fileName);
    }

    setFeedbackMessage('تم التصدير بنجاح!');
    setIsLoading(false);
    // onClose(); // Optionally close modal on success, or keep it open for feedback
  };

  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
      <div className="relative bg-dash-card border border-dash-border rounded-lg p-8 w-full max-w-lg md:max-w-2xl transform scale-95 opacity-0 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-6 text-dash-foreground text-center">تصدير البيانات</h2>

        {feedbackMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm text-center ${
            feedbackMessage.includes('نجاح') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {feedbackMessage}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-dash-muted-foreground text-sm font-bold mb-2">تنسيق التصدير:</label>
          <div className="flex gap-2 p-1 bg-dash-secondary rounded-md">
            {Object.values(ExportFormat).map(format => (
              <button
                key={format}
                className={`flex-1 py-2 px-4 rounded-md font-semibold text-sm transition-all duration-300 relative overflow-hidden group ${
                  selectedFormat === format ? 'bg-dash-primary text-dash-primary-foreground shadow-lg shadow-primary/30' : 'text-dash-muted-foreground hover:bg-dash-muted'
                }`}
                onClick={() => setSelectedFormat(format)}
              >
                <span className="relative z-10">{format}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-dash-muted-foreground text-sm font-bold mb-2">من تاريخ:</label>
            <input
              type="date"
              id="startDate"
              className="w-full bg-dash-input border border-dash-border rounded px-3 py-2 text-dash-foreground focus:outline-none focus:ring-1 focus:ring-dash-ring"
              value={exportStartDate}
              onChange={(e) => setExportStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-dash-muted-foreground text-sm font-bold mb-2">إلى تاريخ:</label>
            <input
              type="date"
              id="endDate"
              className="w-full bg-dash-input border border-dash-border rounded px-3 py-2 text-dash-foreground focus:outline-none focus:ring-1 focus:ring-dash-ring"
              value={exportEndDate}
              onChange={(e) => setExportEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-dash-muted-foreground text-sm font-bold">الحقول المراد تصديرها:</label>
            <button
              onClick={toggleSelectAllFields}
              className="text-sm text-dash-primary hover:underline rounded-xl"
            >
              {selectedFields.length === availableFields.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 max-h-48 overflow-y-auto custom-scrollbar p-3 bg-dash-secondary/50 rounded-md">
            {availableFields.map(field => (
              <label key={field.key} className="flex items-center text-sm text-dash-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-dash-primary bg-dash-input border-dash-border rounded focus:ring-dash-ring"
                  checked={selectedFields.includes(field.key)}
                  onChange={() => handleFieldToggle(field.key)}
                />
                <span className="mr-2">{field.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="bg-dash-secondary hover:bg-dash-muted text-dash-foreground font-bold py-2 px-6 rounded-lg transition-colors duration-300"
            disabled={isLoading}
          >
            إلغاء
          </button>
          <button
            onClick={handleExport}
            className="bg-dash-primary hover:bg-dash-primary/90 text-dash-primary-foreground font-bold py-2 px-6 rounded-lg shadow-lg shadow-primary/20 transition-all duration-300 flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading && (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            تصدير
            {!isLoading && (
              <DownloadIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default ExportModal;