import React from 'react';
import { createPortal } from 'react-dom';
import { Complaint } from '../../../types';
import { XIcon, UserIcon, PhoneIcon, CalendarIcon, ArchiveBoxIcon, CheckCircleIcon } from '../Icons';
import { MessageSquare } from 'lucide-react';

interface ComplaintDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  complaint: Complaint | null;
}

const InfoItem: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
    <div>
        <label className="text-xs text-neo-secondary/50 uppercase font-bold tracking-wider flex items-center gap-1.5">{icon}{label}</label>
        <p className="text-base font-semibold text-neo-secondary mt-1">{value}</p>
    </div>
);


const ComplaintDetailsModal: React.FC<ComplaintDetailsModalProps> = ({ isOpen, onClose, complaint }) => {
  if (!isOpen || !complaint) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 modal-backdrop-blur" onClick={onClose}>
      <div 
        className="relative bg-neo-bg rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <header className="bg-white px-10 py-5 border-b border-neo-soft-gray flex justify-between items-center rounded-2xl">
            <div>
                <h2 className="text-3xl font-extrabold text-neo-secondary flex items-center gap-3">
                    <UserIcon size={28} className="text-neo-primary"/>
                    تفاصيل الشكوى
                </h2>
            </div>
            <button 
                onClick={onClose}
                className="w-12 h-12 rounded-full bg-white border border-neo-soft-gray flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
                title="إغلاق"
            >
                <XIcon size={22} />
            </button>
        </header>

        <main className="p-10 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {/* Customer Info Card */}
            <div className="bg-white p-6 rounded-2xl border border-neo-soft-gray shadow-sm">
               <h3 className="text-neo-secondary font-black mb-4 text-2xl border-b border-neo-soft-gray pb-3">
                 {complaint.customerName}
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InfoItem label="رقم الهاتف" value={complaint.customerPhone} icon={<PhoneIcon size={14}/>} />
                  <InfoItem label="تاريخ الإرسال" value={new Date(complaint.timestamp).toLocaleString('ar-EG')} icon={<CalendarIcon size={14}/>} />
               </div>
            </div>

            {/* Complaint & Reply Card */}
            <div className="bg-white p-6 rounded-2xl border border-neo-soft-gray shadow-sm space-y-6">
                {/* Complaint Text */}
                <div>
                     <h3 className="text-base font-bold text-neo-secondary mb-2 flex items-center gap-2"><MessageSquare size={16} /> نص الشكوى</h3>
                     <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p className="text-neo-secondary leading-relaxed whitespace-pre-wrap">{complaint.complaintText}</p>
                     </div>
                </div>

                {/* Reply Section */}
                <div>
                     <h3 className="text-base font-bold text-neo-secondary mb-2 flex items-center gap-2"><CheckCircleIcon size={16} /> حالة الرد</h3>
                    {complaint.isReplied && complaint.replyText ? (
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <div className="flex items-center gap-2 text-green-800 font-bold text-sm mb-3">
                                <span>تم الرد على هذه الشكوى.</span>
                            </div>
                            <p className="text-green-900 leading-relaxed whitespace-pre-wrap">{complaint.replyText}</p>
                        </div>
                    ) : (
                         <div className="bg-gray-100 p-4 rounded-lg border border-gray-200 text-center">
                            <p className="text-gray-700 font-semibold">لم يتم الرد على هذه الشكوى بعد.</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Archive Info */}
            {complaint.archivedAt && (
                <div className="bg-gray-100 p-3 rounded-lg flex items-center justify-center gap-3 border border-gray-200">
                    <ArchiveBoxIcon size={18} className="text-slate-500" />
                    <p className="text-sm text-slate-600">
                        تمت الأرشفة في: <span className="font-bold text-slate-700">{new Date(complaint.archivedAt).toLocaleString('ar-EG')}</span>
                    </p>
                </div>
            )}
        </main>
      </div>
    </div>,
    portalRoot
  );
};

export default ComplaintDetailsModal;
