import React, { useState, useEffect, useMemo } from 'react';
import { Complaint } from '../../../types';
import { complaintService } from '../../../services/complaintService';
import { useDashboard } from '../DashboardContext';
import { 
    SpinnerIcon, 
    ChatIcon,
    TrashIcon,
    CheckCircleIcon,
    PhoneIcon,
    UserIcon,
    ClockIcon,
    EyeIcon,
    ArchiveBoxIcon,
    InboxIcon
} from '../Icons';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';
import ReplyModal from '../ui/ReplyModal';

// --- Time Formatting Helper ---
const timeAgo = (date: number) => {
    const seconds = Math.floor((new Date().getTime() - date) / 1000);
    if (seconds < 60) return 'الآن';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `منذ ${minutes} د`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} س`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} ي`;
};

// ============================================================================
// --- Sub-components for the new layout ---
// ============================================================================

// --- 1. Complaint List Item ---
const ComplaintListItem: React.FC<{
    complaint: Complaint;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ complaint, isSelected, onSelect }) => {
    const getStatusIndicator = () => {
        if (!complaint.isRead) {
            return <div className="w-3 h-3 bg-neo-primary rounded-full animate-pulse" title="جديدة"></div>;
        }
        if (complaint.isReplied) {
            return <CheckCircleIcon className="w-4 h-4 text-neo-success" title="تم الرد"/>;
        }
        return <EyeIcon className="w-4 h-4 text-gray-400" title="مقروءة"/>;
    };

    return (
        <div 
            onClick={onSelect}
            className={`p-4 border-b border-gray-200 cursor-pointer transition-colors duration-200 ${isSelected ? 'bg-neo-primary/10' : 'hover:bg-gray-50/70'}`}
        >
            <div className="flex justify-between items-start">
                <div className="flex-grow min-w-0">
                    <h3 className="font-bold text-neo-secondary truncate">{complaint.customerName}</h3>
                    <p className="text-sm text-neo-secondary/60 truncate mt-1">{complaint.complaintText}</p>
                </div>
                <div className="flex-shrink-0 ml-4 flex flex-col items-end">
                    {getStatusIndicator()}
                    <span className="text-xs text-gray-400 mt-2">{timeAgo(complaint.timestamp)}</span>
                </div>
            </div>
        </div>
    );
};

// --- 2. Complaint Detail View ---
const ComplaintDetailView: React.FC<{
    complaint: Complaint | null;
    onReply: (c: Complaint) => void;
    onToggleRead: (id: string, isRead: boolean) => void;
    onArchive: (c: Complaint) => void;
}> = ({ complaint, onReply, onToggleRead, onArchive }) => {
    if (!complaint) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 p-8 bg-gray-50/50">
                <InboxIcon className="w-20 h-20 mb-4 text-gray-300"/>
                <p className="text-xl font-bold">اختر شكوى من القائمة</p>
                <p className="text-sm mt-1">لعرض تفاصيلها الكاملة واتخاذ إجراء.</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            {/* Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200 bg-white rounded-2xl">
                <div className="flex items-center gap-4 mb-4">
                     <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold bg-neo-primary/10 text-neo-primary">
                        {complaint.customerName.charAt(0)}
                    </div>
                    <div>
                        <h2 className="text-2xl font-extrabold text-neo-secondary">{complaint.customerName}</h2>
                        <div className="flex items-center gap-4 text-sm text-neo-secondary/60 mt-1">
                            <span className="flex items-center gap-1.5"><PhoneIcon className="w-3.5 h-3.5"/> {complaint.customerPhone}</span>
                            <span className="flex items-center gap-1.5"><ClockIcon className="w-3.5 h-3.5"/> {new Date(complaint.timestamp).toLocaleString('ar-EG')}</span>
                        </div>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => onReply(complaint)} className="flex-1 px-4 py-2.5 text-sm font-bold bg-neo-primary text-white hover:bg-neo-accent rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm shadow-neo-primary/30">
                        <ChatIcon className="w-4 h-4"/> رد عبر واتساب
                    </button>
                    <button 
                        onClick={() => onToggleRead(complaint.id, !complaint.isRead)} 
                        className={`px-4 py-2.5 text-sm font-semibold border rounded-lg transition-colors flex items-center justify-center gap-2 ${complaint.isRead ? 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' : 'bg-neo-primary/10 text-neo-primary border-neo-primary/20 hover:bg-neo-primary/20'}`}
                    >
                         {complaint.isRead ? <CheckCircleIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
                        <span>{complaint.isRead ? 'تحديد كـ غير مقروء' : 'تحديد كـ مقروء'}</span>
                    </button>
                    <button onClick={() => onArchive(complaint)} className="p-2.5 text-sm font-semibold text-neo-error hover:bg-neo-error/10 rounded-lg transition-colors" title="أرشفة الشكوى">
                        <ArchiveBoxIcon className="w-5 h-5"/>
                    </button>
                </div>
            </div>
            {/* Body */}
            <div className="flex-grow p-6 overflow-y-auto space-y-6">
                <div>
                    <h4 className="font-bold text-sm text-neo-secondary/70 mb-2">نص الشكوى</h4>
                    <p className="text-base text-neo-secondary leading-loose whitespace-pre-wrap bg-white p-4 rounded-lg border border-gray-200">
                        {complaint.complaintText}
                    </p>
                </div>

                {complaint.isReplied && complaint.replyText && (
                     <div>
                        <h4 className="font-bold text-sm text-neo-secondary/70 mb-2 flex items-center gap-2">
                            <CheckCircleIcon className="w-4 h-4 text-neo-success" />
                            الرد المسجل
                        </h4>
                        <div className="text-base text-neo-secondary leading-loose whitespace-pre-wrap bg-green-50 p-4 rounded-lg border border-green-200">
                            {complaint.replyText}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// --- Main Complaints Page Component ---
// ============================================================================

const ComplaintsPage: React.FC = () => {
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
    const { showToast } = useDashboard();

    const [complaintToReply, setComplaintToReply] = useState<Complaint | null>(null);
    const [complaintToArchive, setComplaintToArchive] = useState<Complaint | null>(null);
    const [showArchiveAllModal, setShowArchiveAllModal] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);

    useEffect(() => {
        setLoading(true);
        const unsubscribe = complaintService.subscribe(data => {
            const activeComplaints = data.filter(c => !c.isArchived);
            setComplaints(activeComplaints);
            // If the selected one is gone (archived), deselect it.
            if (selectedComplaintId && !activeComplaints.some(c => c.id === selectedComplaintId)) {
                setSelectedComplaintId(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [selectedComplaintId]);
    
    const unreadCount = useMemo(() => complaints.filter(c => !c.isRead).length, [complaints]);
    const selectedComplaint = useMemo(() => complaints.find(c => c.id === selectedComplaintId), [complaints, selectedComplaintId]);

    const handleToggleRead = async (id: string, isRead: boolean) => {
        await complaintService.toggleReadStatus(id, isRead);
        const message = isRead ? "تم تحديد الشكوى كمقروءة." : "تم تحديد الشكوى كغير مقروءة.";
        showToast({ message, type: 'info' });
    };

    const handleConfirmArchive = async () => {
        if (!complaintToArchive) return;
        setIsArchiving(true);
        await complaintService.archiveComplaint(complaintToArchive.id);
        showToast({ message: "تمت أرشفة الشكوى بنجاح.", type: 'success' });
        setComplaintToArchive(null);
        setIsArchiving(false);
    };
    
    const handleConfirmArchiveAll = async () => {
        setIsArchiving(true);
        await complaintService.archiveAllComplaints();
        showToast({ message: "تمت أرشفة جميع الشكاوي بنجاح.", type: 'success' });
        setShowArchiveAllModal(false);
        setIsArchiving(false);
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;
    }

    return (
        <>
            <div className="h-full flex flex-col">
                <header className="mb-6 flex-shrink-0 flex items-center justify-between">
                     <div>
                        <h1 className="text-3xl font-black font-cairo text-neo-secondary">مركز الشكاوي</h1>
                        <p className="text-neo-secondary/60 mt-1">
                            {unreadCount > 0 ? 
                                <span className="text-neo-primary font-bold">لديك {unreadCount} شكوى جديدة.</span> 
                                : 'لا توجد شكاوي جديدة.'
                            }
                        </p>
                    </div>
                    {complaints.length > 0 && (
                        <button
                            onClick={() => setShowArchiveAllModal(true)}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group bg-red-500/10 hover:bg-red-500/20"
                            title="أرشفة جميع الشكاوي"
                        >
                            <TrashIcon className="w-6 h-6 text-red-400 group-hover:scale-110 transition-transform" />
                        </button>
                    )}
                </header>
                
                <main className="flex-grow flex border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                    {/* Right Panel: List */}
                    <div className="w-2/5 border-l border-gray-200 flex flex-col">
                         <div className="p-4 border-b border-gray-200 flex-shrink-0">
                            <h2 className="font-bold text-neo-secondary">جميع الشكاوي ({complaints.length})</h2>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-grow">
                             {complaints.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">لا توجد شكاوى لعرضها.</div>
                            ) : (
                                complaints.map(c => (
                                    <ComplaintListItem 
                                        key={c.id}
                                        complaint={c}
                                        isSelected={selectedComplaintId === c.id}
                                        onSelect={() => setSelectedComplaintId(c.id)}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Left Panel: Details */}
                    <div className="w-3/5">
                        <ComplaintDetailView 
                            complaint={selectedComplaint}
                            onReply={setComplaintToReply}
                            onToggleRead={handleToggleRead}
                            onArchive={setComplaintToArchive}
                        />
                    </div>
                </main>
            </div>
            
            <ReplyModal
                isOpen={!!complaintToReply}
                onClose={() => setComplaintToReply(null)}
                complaint={complaintToReply}
            />

            <DeleteConfirmationModal
                isOpen={!!complaintToArchive}
                onClose={() => setComplaintToArchive(null)}
                onConfirm={handleConfirmArchive}
                title="تأكيد الأرشفة"
                message="هل أنت متأكد من رغبتك في أرشفة هذه الشكوى؟ يمكنك استعادتها لاحقاً من قسم الأرشيف."
                isDeleting={isArchiving}
            />

             <DeleteConfirmationModal
                isOpen={showArchiveAllModal}
                onClose={() => setShowArchiveAllModal(false)}
                onConfirm={handleConfirmArchiveAll}
                title="أرشفة جميع الشكاوي"
                message="هل أنت متأكد؟ سيتم نقل جميع الشكاوي الحالية إلى الأرشيف."
                isDeleting={isArchiving}
            />
        </>
    );
};

export default ComplaintsPage;
