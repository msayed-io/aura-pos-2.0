import React, { useState, useEffect, useMemo } from 'react';
import { Complaint } from '../../../../types';
import { complaintService } from '../../../../services/complaintService';
import { SpinnerIcon, SearchIcon, RefreshIcon, TrashIcon, ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon, InboxIcon } from '../../Icons';
import { useDashboard } from '../../DashboardContext';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';
import ComplaintDetailsModal from '../../ui/ComplaintDetailsModal';

// --- Components ---

const ArchivedComplaintRow = React.memo(({ complaint, onRestore, onDelete, onRowClick, isActioning }: { complaint: Complaint, onRestore: () => void, onDelete: () => void, onRowClick: () => void, isActioning: boolean }) => {
    return (
        <tr onClick={onRowClick} className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors duration-200 group cursor-pointer rounded-2xl">
            <td className="p-4 text-sm font-semibold text-gray-200">{complaint.customerName}</td>
            <td className="p-4 text-xs text-gray-400 font-mono tracking-wide" dir="ltr">{complaint.customerPhone}</td>
            <td className="p-4 text-sm text-gray-300 max-w-sm truncate" title={complaint.complaintText}>{complaint.complaintText}</td>
            <td className="p-4 text-xs text-gray-500 font-mono tracking-wide">{new Date(complaint.timestamp).toLocaleDateString('ar-EG')}</td>
            <td className="p-4">
                <div className="flex items-center gap-2 justify-end">
                    <button onClick={(e) => { e.stopPropagation(); onRestore(); }} disabled={isActioning} className="h-8 px-3 flex items-center gap-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20 font-semibold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors" title="استعادة الشكوى">
                        {isActioning ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <RefreshIcon className="w-4 h-4" />}
                        <span>استعادة</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={isActioning} className="h-8 w-8 flex items-center justify-center text-xs text-red-400 hover:bg-red-500/10 hover:border-red-500/20 font-semibold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors" title="حذف نهائي">
                        {isActioning ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                    </button>
                </div>
            </td>
        </tr>
    );
});

// --- Main Tab Component ---

const ITEMS_PER_PAGE = 15;

const ArchivedComplaintsTab: React.FC = () => {
    const [allComplaints, setAllComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const { showToast } = useDashboard();
    
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [complaintToDelete, setComplaintToDelete] = useState<Complaint | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    
    const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
    const [isDeletingAll, setIsDeletingAll] = useState(false);
    const [viewingComplaint, setViewingComplaint] = useState<Complaint | null>(null);

    useEffect(() => {
        setLoading(true);
        const unsubscribe = complaintService.subscribe(setAllComplaints);
        setLoading(false);
        return () => unsubscribe();
    }, []);

    const filteredComplaints = useMemo(() => {
        let tempComplaints = allComplaints.filter(c => c.isArchived);

        if (searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase().trim();
            tempComplaints = tempComplaints.filter(c => 
                (c.customerName || '').toLowerCase().includes(term) ||
                (c.customerPhone || '').includes(term) ||
                (c.complaintText || '').toLowerCase().includes(term)
            );
        }
        return tempComplaints;
    }, [allComplaints, searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredComplaints.length, searchTerm]);

    const paginatedComplaints = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredComplaints.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredComplaints, currentPage]);

    const totalPages = Math.ceil(filteredComplaints.length / ITEMS_PER_PAGE);

    const handleRestore = async (complaintId: string) => {
        setActioningId(complaintId);
        try {
            await complaintService.unarchiveComplaint(complaintId);
            showToast({ message: 'تمت استعادة الشكوى بنجاح.', type: 'success' });
        } catch (e) {
            showToast({ message: 'فشلت عملية الاستعادة.', type: 'error' });
        } finally {
            setActioningId(null);
        }
    };
    
    const handleDelete = async () => {
        if (!complaintToDelete) return;

        setActioningId(complaintToDelete.id);
        try {
            await complaintService.deleteComplaintPermanently(complaintToDelete.id);
            showToast({ message: 'تم حذف الشكوى نهائياً.', type: 'success' });
        } catch (e) {
            showToast({ message: 'فشلت عملية الحذف.', type: 'error' });
        } finally {
            setActioningId(null);
            setComplaintToDelete(null);
        }
    };

    const handleDeleteAll = async () => {
        setIsDeletingAll(true);
        try {
            await complaintService.deleteAllArchivedComplaints();
            showToast({ message: 'تم حذف جميع الشكاوى المؤرشفة نهائياً.', type: 'success' });
        } catch (e) {
            showToast({ message: 'فشلت عملية الحذف الشامل.', type: 'error' });
        } finally {
            setIsDeletingAll(false);
            setShowDeleteAllModal(false);
        }
    };
    
    if (loading) {
         return <div className="flex h-64 items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;
    }

    return (
        <>
            <div className="space-y-6 animate-fade-in">
                <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.3)] relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-30 pointer-events-none" />
                    
                    <div className="p-4 border-b border-white/10 relative z-10 flex items-center gap-4">
                        <div className="relative flex-grow">
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                <SearchIcon className="w-5 h-5"/>
                            </div>
                            <input
                                type="search"
                                placeholder="ابحث بالاسم، الهاتف، أو نص الشكوى..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pr-10 pl-4 py-2.5 bg-black/40 border border-white/10 text-white rounded-xl focus:outline-none focus:border-neo-primary/50 focus:bg-black/60 transition-all placeholder-gray-600"
                            />
                        </div>
                        {filteredComplaints.length > 0 && (
                            <button
                                onClick={() => setShowDeleteAllModal(true)}
                                className="flex-shrink-0 flex items-center gap-2 h-11 px-4 text-sm font-bold rounded-xl transition-all bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                title="حذف جميع السجلات المؤرشفة نهائياً"
                            >
                                <TrashIcon className="w-4 h-4" />
                                <span>حذف الكل نهائياً</span>
                            </button>
                        )}
                    </div>
                {filteredComplaints.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center text-gray-500 p-8 min-h-[300px] relative z-10">
                            <InboxIcon className="w-16 h-16 mb-4 text-gray-600" />
                            <p className="text-xl font-bold text-gray-400">لا توجد شكاوى مؤرشفة.</p>
                            <p className="text-sm mt-1">عند أرشفة الشكاوى من الصفحة الرئيسية، ستظهر هنا.</p>
                        </div>
                ) : (
                    <div className="relative z-10">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[700px]">
                                <thead className="text-gray-400 text-xs font-bold uppercase bg-black/20 tracking-wider">
                                <tr>
                                    <th className="p-4 text-right">العميل</th>
                                    <th className="p-4 text-right">الهاتف</th>
                                    <th className="p-4 text-right">نص الشكوى</th>
                                    <th className="p-4 text-right">التاريخ</th>
                                    <th className="p-4 text-right">إجراءات</th>
                                </tr>
                                </thead>
                                <tbody>
                                    {paginatedComplaints.map(complaint => (
                                        <ArchivedComplaintRow 
                                            key={complaint.id} 
                                            complaint={complaint} 
                                            onRowClick={() => setViewingComplaint(complaint)}
                                            onRestore={() => handleRestore(complaint.id)}
                                            onDelete={() => setComplaintToDelete(complaint)}
                                            isActioning={actioningId === complaint.id}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="p-4 border-t border-white/10 flex justify-between items-center text-sm text-gray-400 bg-black/10">
                                <div>
                                    <span>صفحة <strong>{currentPage}</strong> من <strong>{totalPages}</strong></span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronsLeftIcon size={16}/></button>
                                    <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronLeftIcon size={16}/></button>
                                    <span className="font-bold w-10 text-center text-white">{currentPage}</span>
                                    <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronRightIcon size={16}/></button>
                                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronsRightIcon size={16}/></button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>
            <DeleteConfirmationModal
                isOpen={!!complaintToDelete}
                onClose={() => setComplaintToDelete(null)}
                onConfirm={handleDelete}
                title={`حذف الشكوى نهائياً`}
                message={`هل أنت متأكد من حذف هذا السجل بشكل دائم؟ لا يمكن التراجع عن هذا الإجراء.`}
                isDeleting={!!actioningId}
            />
            <DeleteConfirmationModal
                isOpen={showDeleteAllModal}
                onClose={() => setShowDeleteAllModal(false)}
                onConfirm={handleDeleteAll}
                title="حذف جميع الشكاوى المؤرشفة نهائياً"
                message="هل أنت متأكد؟ هذا الإجراء سيقوم بحذف جميع الشكاوى المؤرشفة بشكل دائم ولا يمكن التراجع عنه."
                isDeleting={isDeletingAll}
            />
             <ComplaintDetailsModal
                isOpen={!!viewingComplaint}
                onClose={() => setViewingComplaint(null)}
                complaint={viewingComplaint}
            />
        </>
    );
};

export default ArchivedComplaintsTab;
