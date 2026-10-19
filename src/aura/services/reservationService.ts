
import { Reservation, ReservationItem, MenuItem } from '../types';

class ReservationService {
    private subscribers: ((reservations: Reservation[]) => void)[] = [];

    constructor() {
        // Service is now stateless.
    }

    private notifySubscribers() {
        // Always notify with empty data.
        this.subscribers.forEach(callback => callback([]));
    }

    subscribe(callback: (reservations: Reservation[]) => void): () => void {
        this.subscribers.push(callback);
        callback([]); // Immediately provide empty data.
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    async updateReservationStatus(id: string, status: Reservation['status']) {
        console.log('Reservation service is offline. Action ignored.');
    }

    async deleteReservation(id: string) {
        console.log('Reservation service is offline. Action ignored.');
    }

    async deleteReservationPermanently(id: string) {
        console.log('Reservation service is offline. Action ignored.');
    }

    async deleteAllArchivedReservations() {
        console.log('Reservation service is offline. Action ignored.');
    }
}

export const reservationService = new ReservationService();
