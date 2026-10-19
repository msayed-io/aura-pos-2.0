import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Complaint } from '../../../types';
import { XIcon, MessageSquare } from 'lucide-react';
import { useDashboard } from '../DashboardContext';
import { complaintService } from '../../../services/complaintService';


interface ReplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  complaint: Complaint | null;
}

// الرسالة التعريفية الثابتة التي سيتم إرسالها مع كل رد.
// تتضمن تنسيق واتساب (* للنص العريض*) وفواصل الأسطر.
const WHATSAPP_REPLY_PREAMBLE = `*مرحباً عميلنا العزيز،*

*معك فريق دعم هوت بروست. نشكرك على مشاركتك لنا ملاحظتك، ونود أن نطمئنك بأننا نتابع شكواك بكل اهتمام. نضع راحتك وتجربتك في مقدمة أولوياتنا، ويسعدنا مشاركتك الرد التالي لمعالجة الأمر بالشكل الذي يليق بك وبخدمتك لدينا:*`;


const ReplyModal: React.FC<ReplyModalProps> = ({ isOpen, onClose, complaint }) => {
  const [replyText, setReplyText] = useState('');
  const { showToast } = useDashboard();

  useEffect(() => {
    // عند فتح النافذة، يتم تفريغ مربع النص لأن الرسالة التعريفية أصبحت تلقائية
    if (complaint) {
      setReplyText('');
    }
  }, [complaint]);

  const handleSendReply = async () => {
    if (!complaint) return;
    
    // التحقق من أن الرد ليس فارغاً
    if (!replyText.trim()) {
      showToast({ message: 'لا يمكن إرسال رد فارغ.', type: 'error' });
      return;
    }
    
    // تنسيق رقم الهاتف ليتوافق مع رابط واتساب (بافتراض الأرقام المصرية)
    let formattedPhone = complaint.customerPhone.replace(/\D/g, ''); // إزالة أي رموز غير رقمية
    if (formattedPhone.startsWith('0')) {
        // استبدال الصفر البادئ برمز الدولة 20. مثال: 010... -> 2010...
        formattedPhone = `2${formattedPhone}`;
    } else if (!formattedPhone.startsWith('20')) {
        // إضافة رمز الدولة إذا لم يكن موجوداً. مثال: 10... -> 2010...
        formattedPhone = `20${formattedPhone}`;
    }
    
    // دمج الرسالة التعريفية الثابتة مع الرد المخصص من الموظف
    const fullMessage = `${WHATSAPP_REPLY_PREAMBLE}\n\n${replyText}`;
    
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(fullMessage)}`;
    
    // Update status and save reply text before opening the window
    await complaintService.saveReply(complaint.id, replyText);

    window.open(whatsappUrl, '_blank');
    showToast({ message: 'تم فتح واتساب وتحديث حالة الشكوى.', type: 'success' });
    onClose();
  };

  if (!isOpen || !complaint) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
      <div className="relative bg-neo-bg rounded-2xl shadow-xl w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-neo-soft-gray flex justify-between items-center">
          <h2 className="text-xl font-bold font-cairo text-neo-secondary">
            الرد على شكوى: {complaint.customerName}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
        </header>
        <main className="p-6 space-y-4">
            <div className="p-4 bg-white border border-neo-soft-gray rounded-lg">
                <p className="font-semibold text-sm text-neo-secondary/60">نص الشكوى الأصلي:</p>
                <p className="mt-2 text-neo-secondary leading-relaxed">{complaint.complaintText}</p>
            </div>
            <div>
                <label htmlFor="reply-text" className="font-bold text-sm text-neo-secondary/80">نص الرد</label>
                <textarea
                    id="reply-text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={5}
                    className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black focus:ring-1 focus:ring-neo-primary focus:border-neo-primary"
                    placeholder="اكتب ردك هنا..."
                />
            </div>
        </main>
        <footer className="p-4 bg-white border-t border-neo-soft-gray flex justify-end gap-3 rounded-2xl">
          <button onClick={onClose} className="px-4 py-2 bg-neo-soft-gray text-neo-secondary/80 font-bold rounded-lg hover:bg-gray-200">إلغاء</button>
          <button 
            onClick={handleSendReply}
            className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-2 shadow-sm"
          >
            <MessageSquare className="w-4 h-4"/>
            إرسال عبر واتساب
          </button>
        </footer>
      </div>
    </div>,
    portalRoot
  );
};

export default ReplyModal;