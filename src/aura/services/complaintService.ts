import type { Complaint } from '../types';

// Raw data structure from Firebase as described by user
interface FirebaseComplaint {
    name: string;
    phone: string;
    message: string;
    createdAt: number;
    status?: 'New' | 'Read' | 'Replied' | 'Archived';
    // Fields that might be added by the dashboard
    isRead?: boolean;
    isReplied?: boolean;
    replyText?: string;
    isArchived?: boolean;
    archivedAt?: number;
}


class ComplaintService {
    private subscribers: ((complaints: Complaint[]) => void)[] = [];
    
    constructor() {
        // Service is now stateless and does not connect to Firebase.
    }

    public init() {
        // No-op
    }

    private notifySubscribers() {
        this.subscribers.forEach(cb => cb([]));
    }

    public reset() {
        // No-op
    }

    subscribe(callback: (complaints: Complaint[]) => void): () => void {
        this.subscribers.push(callback);
        callback([]); // Immediately return empty data
        return () => {
            this.subscribers = this.subscribers.filter(sub => sub !== callback);
        };
    }

    async toggleReadStatus(id: string, isRead: boolean) {}

    async saveReply(id: string, replyText: string) {}

    async archiveComplaint(id: string) {}
    
    async archiveAllComplaints() {}

    async unarchiveComplaint(id: string) {}

    async deleteComplaintPermanently(id: string) {}
    
    async deleteAllArchivedComplaints() {}
}

export const complaintService = new ComplaintService();
