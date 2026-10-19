
import React, { useState, useEffect, useMemo } from 'react';
import { Reservation } from '../../../types';
import { reservationService } from '../../../services/reservationService';
import { useDashboard } from '../DashboardContext';
import { 
    CalendarClockIcon, 
    SpinnerIcon, 
    UsersIcon, 
    ClockIcon,
    CalendarIcon
} from '../Icons';
import ReservationDetailsModal from '../ui/ReservationDetailsModal';

type StatusFilter = 'ALL' | 'PENDING' | 'CONFIRMED';

// New Reservation Card, styled like OrderCard
const ReservationCard: React.FC<{ reservation: Reservation; onViewDetails: () => void; }> = ({ reservation, onViewDetails }) => {
    const isPending = reservation.status === 'PENDING';
    
    const displayTime = useMemo(() => {
        if (!reservation.time) return '';
        const [hours, minutes] = reservation.time.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    }, [reservation.time]);

    return (
        <div 
            onClick={onViewDetails}
            className={`
                group bg-white rounded-2xl p-0 shadow-lg shadow-gray-500/5 
                hover:shadow-xl hover:shadow-gray-500/10 hover:-translate-y-1 
                transition-all duration-300 cursor-pointer border-2 hover:border-neo-primary
                ${isPending ? 'border-amber-400 animate-new-order-glow' : 'border-transparent'}
                relative overflow-hidden flex flex-col
            `}
        >
              {/* Card Header */}
              <div className="p-4 flex justify-between items-center border-b border-gray-100">
                <div className="flex-grow min-w-0">
                  <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-neo-primary transition-colors">
                    {reservation.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-400 font-medium mt-1">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      <span>{new Date(reservation.date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 mr-3">
                  <div className="bg-neo-primary text-white font-mono text-lg font-black px-3 py-0.5 rounded-full shadow-md shadow-neo-primary/30 tracking-wider">
                    {reservation.displayId}
                  </div>
                </div>
              </div>

              {/* Card Body: Info Grid */}
              <div className="px-4 py-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex items-center gap-2 text-gray-700">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><ClockIcon className="w-5 h-5 text-neo-primary"/></div>
                      <span className="font-bold text-sm">{displayTime}</span>
                  </div>
                   <div className="flex items-center gap-2 text-gray-700">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><UsersIcon className="w-5 h-5 text-green-600"/></div>
                      <span className="font-bold text-sm">{reservation.guests} أفراد</span>
                  </div>
              </div>

              {/* Card Footer (Total Price) */}
              <div className="mt-auto px-4 py-3 bg-gray-50/70 border-t border-gray-100 flex justify-between items-center">
                <span className="text-sm text-gray-500 font-bold">الإجمالي</span>
                <span className="font-mono font-extrabold text-lg text-neo-primary">
                  {(reservation.total ?? 0).toFixed(2)} ج.م
                </span>
              </div>
        </div>
    );
};


const ReservationsPage: React.FC = () => {
    const [allReservations, setAllReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
    const { showToast } = useDashboard();

    useEffect(() => {
        setLoading(true);
        const unsubscribe = reservationService.subscribe(data => {
            setAllReservations(data.filter(r => r.status !== 'CANCELLED'));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const filteredReservations = useMemo(() => {
        if (statusFilter === 'ALL') return allReservations;
        return allReservations.filter(r => r.status === statusFilter);
    }, [allReservations, statusFilter]);

    const handleConfirm = async (id: string) => {
        await reservationService.updateReservationStatus(id, 'CONFIRMED');
        showToast({ message: 'تم تأكيد الحجز بنجاح.', type: 'success' });
        setSelectedReservation(null); // Close modal on action
    };

    const handleCancel = async (id: string) => {
        await reservationService.deleteReservation(id); // This now archives the reservation
        showToast({ message: 'تم أرشفة الحجز.', type: 'info' });
        setSelectedReservation(null); // Close modal on action
    };

    const filterOptions: { id: StatusFilter; label: string }[] = [
        { id: 'ALL', label: 'الكل' },
        { id: 'PENDING', label: 'الحجوزات الجديدة' },
        { id: 'CONFIRMED', label: 'الحجوزات المؤكدة' },
    ];

    if (loading) {
        return <div className="flex h-full items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;
    }

    return (
        <>
            <div className="h-full flex flex-col">
                <header className="flex-shrink-0 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black font-cairo text-neo-secondary tracking-tight">صالة الحجوزات</h1>
                        <p className="text-neo-secondary/50 text-sm mt-1 font-medium">
                           عرض وإدارة جميع الحجوزات من الموقع
                        </p>
                    </div>
                     <div className="flex items-center gap-2 bg-gray-200/70 p-1.5 rounded-full w-full sm:w-auto">
                        {filterOptions.map(filter => (
                            <button key={filter.id} onClick={() => setStatusFilter(filter.id)} className={`flex-1 sm:flex-auto px-4 py-1.5 text-sm font-bold rounded-full transition-colors whitespace-nowrap ${statusFilter === filter.id ? 'bg-neo-primary text-white shadow-sm' : 'text-neo-secondary/70 hover:bg-white'}`}>
                                {filter.label} ({filter.id === 'ALL' ? allReservations.length : allReservations.filter(r => r.status === filter.id).length})
                            </button>
                        ))}
                    </div>
                </header>
                
                <main className="flex-grow overflow-y-auto custom-scrollbar -mr-4 pr-4 pb-4">
                    {filteredReservations.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-center text-neo-secondary/50 p-8 bg-white rounded-xl border border-neo-soft-gray shadow-sm">
                            <CalendarClockIcon className="w-16 h-16 mb-4 text-gray-300"/>
                            <p className="text-xl font-bold">لا توجد حجوزات تطابق هذا الفلتر.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 auto-rows-max">
                            {filteredReservations.map(res => (
                                <ReservationCard 
                                    key={res.id} 
                                    reservation={res} 
                                    onViewDetails={() => setSelectedReservation(res)}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>
            <ReservationDetailsModal
                isOpen={!!selectedReservation}
                onClose={() => setSelectedReservation(null)}
                reservation={selectedReservation}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </>
    );
};

export default ReservationsPage;
