import { LogEntry, LogActionType } from '../types';

class LoggingService {
    private subscribers: ((logs: LogEntry[]) => void)[] = [];

    constructor() {
        // Service is now stateless and does not connect to Firebase.
    }

    public init() {
        // No-op
    }

    private notifySubscribers() {
        this.subscribers.forEach(callback => callback([]));
    }

    public reset() {
        // No-op
    }

    subscribe(callback: (logs: LogEntry[]) => void): () => void {
        this.subscribers.push(callback);
        callback([]); // Immediately return empty data
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    getActiveShiftStartTime(cashierId: string): number | null {
        // Always return null as there are no logs
        return null;
    }

    async log(cashierId: string, cashierName: string, action: LogActionType, data?: { orderId?: string; details?: Record<string, any> }) {
        // No-op
        console.log("Logging service is offline. Log action ignored:", { cashierName, action, data });
    }

    async archiveAllVoidLogs(): Promise<void> {}

    async deleteLogPermanently(logId: string): Promise<void> {}

    async deleteAllArchivedVoidLogs(): Promise<void> {}
}

export const loggingService = new LoggingService();
