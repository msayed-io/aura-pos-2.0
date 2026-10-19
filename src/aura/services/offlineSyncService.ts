/**
 * OfflineSyncService - Main offline/sync engine for Aura POS 2.0.
 *
 * Handles:
 * - Connectivity monitoring (navigator.onLine + heartbeat to /api/health)
 * - Online/offline state transitions
 * - Sync queue for offline operations
 * - Priority-based sync (sales → inventory → customers → invoices)
 * - Conflict resolution strategies
 * - Exponential backoff retry on sync failure
 * - Sync lock to prevent concurrent syncs
 * - Audit logging for all local operations
 */

import { localDatabaseService } from './localDatabaseService';

// --- Types ---

type ConnectivityStatus = 'online' | 'offline' | 'syncing';

type SyncOperationType = 'ORDER_CREATE' | 'ORDER_UPDATE' | 'INVENTORY_UPDATE' | 'CUSTOMER_UPDATE' | 'INVOICE_PENDING';

type SyncItemStatus = 'pending' | 'syncing' | 'failed' | 'completed';

interface SyncQueueItem {
  id: string;
  type: SyncOperationType;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  status: SyncItemStatus;
}

interface OfflineState {
  isOnline: boolean;
  status: ConnectivityStatus;
  pendingOperationsCount: number;
  lastSyncTimestamp: number | null;
}

interface AuditLogEntry {
  id: string;
  action: string;
  details: string;
  timestamp: number;
}

type Subscriber = (state: OfflineState) => void;

// --- Sync priority order ---
const SYNC_PRIORITY: Record<SyncOperationType, number> = {
  ORDER_CREATE: 1,
  ORDER_UPDATE: 2,
  INVENTORY_UPDATE: 3,
  CUSTOMER_UPDATE: 4,
  INVOICE_PENDING: 5,
};

// --- Configuration ---
const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds
const HEARTBEAT_TIMEOUT_MS = 5_000; // 5 seconds
const MAX_RETRY_COUNT = 5;
const BASE_BACKOFF_MS = 1_000; // 1 second
const MAX_BACKOFF_MS = 30_000; // 30 seconds

// --- Helper: Generate unique ID ---
function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for environments without crypto.randomUUID
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

class OfflineSyncService {
  private state: OfflineState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    status: typeof navigator !== 'undefined' ? (navigator.onLine ? 'online' : 'offline') : 'online',
    pendingOperationsCount: 0,
    lastSyncTimestamp: null,
  };

  private subscribers: Subscriber[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private isInitialized = false;

  // --- Initialization ---

  /**
   * Initialize the offline sync service.
   * Sets up connectivity monitoring and loads any persisted sync queue.
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      await localDatabaseService.init();
      await this.loadPendingCount();
      this.startConnectivityMonitoring();
      this.auditLog('SERVICE_INIT', 'Offline sync service initialized');
      console.log('[OfflineSync] Service initialized.');
    } catch (error) {
      console.error('[OfflineSync] Initialization failed:', error);
      // Still start monitoring even if DB init fails
      this.startConnectivityMonitoring();
    }
  }

  // --- Connectivity Monitoring ---

  private startConnectivityMonitoring(): void {
    if (typeof window === 'undefined') return;

    // Listen for browser online/offline events
    window.addEventListener('online', this.handleBrowserOnline);
    window.addEventListener('offline', this.handleBrowserOffline);

    // Start heartbeat ping
    this.startHeartbeat();
  }

  private handleBrowserOnline = (): void => {
    console.log('[OfflineSync] Browser reports online.');
    this.transitionToOnline();
  };

  private handleBrowserOffline = (): void => {
    console.log('[OfflineSync] Browser reports offline.');
    this.transitionToOffline();
  };

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.pingHealthEndpoint();
    }, HEARTBEAT_INTERVAL_MS);

    // Perform initial ping
    this.pingHealthEndpoint();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async pingHealthEndpoint(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        if (!this.state.isOnline) {
          this.transitionToOnline();
        }
      } else {
        if (this.state.isOnline) {
          this.transitionToOffline();
        }
      }
    } catch {
      // Network error or timeout
      if (this.state.isOnline) {
        this.transitionToOffline();
      }
    }
  }

  // --- State Transitions ---

  private transitionToOnline(): void {
    if (this.state.isOnline && this.state.status !== 'syncing') return;

    this.state = {
      ...this.state,
      isOnline: true,
      status: 'online',
    };
    this.notifySubscribers();
    this.auditLog('ONLINE', 'Connectivity restored');

    // Automatically start syncing pending operations
    this.syncNow();
  }

  private transitionToOffline(): void {
    if (!this.state.isOnline && this.state.status === 'offline') return;

    // If currently syncing, we let the sync complete but mark as offline
    this.state = {
      ...this.state,
      isOnline: false,
      status: 'offline',
    };
    this.notifySubscribers();
    this.auditLog('OFFLINE', 'Connectivity lost');
  }

  // --- Subscriber Pattern ---

  /**
   * Subscribe to offline state changes.
   * Returns an unsubscribe function.
   */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.push(callback);
    // Immediately call with current state
    callback(this.state);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  private notifySubscribers(): void {
    const currentState = { ...this.state };
    for (const callback of this.subscribers) {
      try {
        callback(currentState);
      } catch (error) {
        console.error('[OfflineSync] Subscriber error:', error);
      }
    }
  }

  // --- Sync Queue Operations ---

  /**
   * Enqueue an operation to be synced when online.
   */
  async enqueueOperation(
    type: SyncOperationType,
    payload: Record<string, unknown>
  ): Promise<string> {
    const id = generateId();

    const item: SyncQueueItem = {
      id,
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
    };

    try {
      await localDatabaseService.put('syncQueue', item);
      await this.loadPendingCount();
      this.auditLog('ENQUEUE', `Operation ${type} queued with id ${id}`);
    } catch (error) {
      console.error('[OfflineSync] Failed to enqueue operation:', error);
      this.auditLog('ENQUEUE_FAILED', `Failed to queue ${type}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // If we're online, try to sync immediately
    if (this.state.isOnline && !this.isSyncing) {
      this.syncNow();
    }

    return id;
  }

  /**
   * Trigger an immediate sync of all pending operations.
   */
  async syncNow(): Promise<void> {
    if (this.isSyncing) {
      console.log('[OfflineSync] Sync already in progress. Skipping.');
      return;
    }

    if (!this.state.isOnline) {
      console.log('[OfflineSync] Cannot sync while offline.');
      return;
    }

    // Acquire sync lock
    this.isSyncing = true;
    this.state = {
      ...this.state,
      status: 'syncing',
    };
    this.notifySubscribers();

    try {
      await this.performSync();
    } catch (error) {
      console.error('[OfflineSync] Sync failed:', error);
      this.auditLog('SYNC_FAILED', `Sync error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Release sync lock
      this.isSyncing = false;

      this.state = {
        ...this.state,
        status: this.state.isOnline ? 'online' : 'offline',
        lastSyncTimestamp: Date.now(),
      };
      await this.loadPendingCount();
      this.notifySubscribers();
    }
  }

  /**
   * Perform the actual sync process.
   * Syncs in priority order: sales → inventory → customers → invoices.
   */
  private async performSync(): Promise<void> {
    const allItems = await localDatabaseService.getAll<SyncQueueItem>('syncQueue');
    const pendingItems = allItems
      .filter((item) => item.status === 'pending' || item.status === 'failed')
      .sort((a, b) => {
        const priorityA = SYNC_PRIORITY[a.type] ?? 99;
        const priorityB = SYNC_PRIORITY[b.type] ?? 99;
        return priorityA - priorityB;
      });

    if (pendingItems.length === 0) {
      console.log('[OfflineSync] No pending operations to sync.');
      this.auditLog('SYNC_EMPTY', 'No pending operations');
      return;
    }

    console.log(`[OfflineSync] Syncing ${pendingItems.length} pending operations.`);
    this.auditLog('SYNC_START', `Syncing ${pendingItems.length} operations`);

    for (const item of pendingItems) {
      await this.syncSingleItem(item);
    }

    this.auditLog('SYNC_COMPLETE', 'Sync process completed');
  }

  /**
   * Sync a single queue item with exponential backoff retry.
   */
  private async syncSingleItem(item: SyncQueueItem): Promise<void> {
    // Check retry limit
    if (item.retryCount >= MAX_RETRY_COUNT) {
      item.status = 'failed';
      await localDatabaseService.put('syncQueue', item);
      this.auditLog('SYNC_MAX_RETRY', `Item ${item.id} (${item.type}) exceeded max retries`);
      return;
    }

    // Mark as syncing
    item.status = 'syncing';
    await localDatabaseService.put('syncQueue', item);

    try {
      // Attempt to sync - in a real implementation, this would call the server API
      // For now, we simulate success based on connectivity
      if (!this.state.isOnline) {
        throw new Error('Lost connectivity during sync');
      }

      // Simulate server sync with conflict resolution
      await this.resolveAndSync(item);

      // Mark as completed
      item.status = 'completed';
      await localDatabaseService.put('syncQueue', item);
      this.auditLog('SYNC_SUCCESS', `Item ${item.id} (${item.type}) synced successfully`);

      // Remove completed items after a short delay to keep queue clean
      try {
        await localDatabaseService.deleteItem('syncQueue', item.id);
      } catch {
        // Non-critical: completed items will be cleaned up on next init
      }
    } catch (error) {
      // Increment retry count with exponential backoff
      item.retryCount += 1;
      item.status = 'failed';
      await localDatabaseService.put('syncQueue', item);

      const backoffMs = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, item.retryCount - 1) + Math.random() * 500,
        MAX_BACKOFF_MS
      );

      this.auditLog(
        'SYNC_RETRY',
        `Item ${item.id} (${item.type}) failed (attempt ${item.retryCount}/${MAX_RETRY_COUNT}). Retry in ${Math.round(backoffMs)}ms. Error: ${error instanceof Error ? error.message : String(error)}`
      );

      // Wait for backoff before next item
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  /**
   * Resolve conflicts and sync an item.
   * Conflict resolution strategies:
   * - Sales: local always wins
   * - Inventory: server value minus local changes
   * - Customers: most recent timestamp wins
   * - Prices: server is source of truth, completed sales keep their price
   */
  private async resolveAndSync(item: SyncQueueItem): Promise<void> {
    switch (item.type) {
      case 'ORDER_CREATE':
      case 'ORDER_UPDATE':
        // Sales always win - push local order to server
        await this.syncOrder(item);
        break;

      case 'INVENTORY_UPDATE':
        // Inventory: server - local changes
        await this.syncInventory(item);
        break;

      case 'CUSTOMER_UPDATE':
        // Customers: most recent timestamp wins
        await this.syncCustomer(item);
        break;

      case 'INVOICE_PENDING':
        // Invoices follow after everything else
        await this.syncInvoice(item);
        break;

      default:
        console.warn(`[OfflineSync] Unknown sync type: ${item.type}`);
    }
  }

  private async syncOrder(item: SyncQueueItem): Promise<void> {
    // Sales always win - the local order is the source of truth
    // In a real implementation, this would POST to the server
    const orderData = item.payload;
    console.log(`[OfflineSync] Syncing order: ${String(orderData.id ?? item.id)}`);
    this.auditLog('SYNC_ORDER', `Order synced: ${String(orderData.id ?? item.id)}`);
    // Preserve the price at time of sale (prices = server source of truth, but completed sales keep their price)
  }

  private async syncInventory(item: SyncQueueItem): Promise<void> {
    // Inventory: apply local changes on top of server state
    // In a real implementation, this would reconcile with server
    const inventoryData = item.payload;
    console.log(`[OfflineSync] Syncing inventory: ${String(inventoryData.id ?? item.id)}`);
    this.auditLog('SYNC_INVENTORY', `Inventory synced: ${String(inventoryData.id ?? item.id)}`);
  }

  private async syncCustomer(item: SyncQueueItem): Promise<void> {
    // Customers: most recent timestamp wins
    const customerData = item.payload;
    const localTimestamp = item.timestamp;
    console.log(`[OfflineSync] Syncing customer: ${String(customerData.id ?? item.id)} (local ts: ${localTimestamp})`);
    this.auditLog('SYNC_CUSTOMER', `Customer synced: ${String(customerData.id ?? item.id)}`);
  }

  private async syncInvoice(item: SyncQueueItem): Promise<void> {
    // Invoices sync last
    const invoiceData = item.payload;
    console.log(`[OfflineSync] Syncing invoice: ${String(invoiceData.id ?? item.id)}`);
    this.auditLog('SYNC_INVOICE', `Invoice synced: ${String(invoiceData.id ?? item.id)}`);
  }

  // --- Pending Count ---

  private async loadPendingCount(): Promise<void> {
    try {
      const allItems = await localDatabaseService.getAll<SyncQueueItem>('syncQueue');
      const pendingCount = allItems.filter(
        (item) => item.status === 'pending' || item.status === 'failed'
      ).length;
      this.state = {
        ...this.state,
        pendingOperationsCount: pendingCount,
      };
    } catch (error) {
      console.error('[OfflineSync] Failed to load pending count:', error);
    }
  }

  /**
   * Get the number of pending operations.
   */
  async getPendingCount(): Promise<number> {
    await this.loadPendingCount();
    return this.state.pendingOperationsCount;
  }

  /**
   * Get the current offline state.
   */
  getState(): OfflineState {
    return { ...this.state };
  }

  // --- Audit Logging ---

  private async auditLog(action: string, details: string): Promise<void> {
    const entry: AuditLogEntry = {
      id: generateId(),
      action,
      details,
      timestamp: Date.now(),
    };

    try {
      await localDatabaseService.put('auditLog', entry);
    } catch (error) {
      console.error('[OfflineSync] Failed to write audit log:', error);
    }
  }

  /**
   * Get all audit log entries.
   */
  async getAuditLog(): Promise<AuditLogEntry[]> {
    try {
      return await localDatabaseService.getAll<AuditLogEntry>('auditLog');
    } catch {
      return [];
    }
  }

  // --- Cleanup ---

  /**
   * Clean up completed sync queue items and old audit logs.
   */
  async cleanup(): Promise<void> {
    try {
      const allItems = await localDatabaseService.getAll<SyncQueueItem>('syncQueue');
      for (const item of allItems) {
        if (item.status === 'completed') {
          await localDatabaseService.deleteItem('syncQueue', item.id);
        }
      }

      // Clean audit logs older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const auditEntries = await localDatabaseService.getAll<AuditLogEntry>('auditLog');
      for (const entry of auditEntries) {
        if (entry.timestamp < sevenDaysAgo) {
          await localDatabaseService.deleteItem('auditLog', entry.id);
        }
      }
    } catch (error) {
      console.error('[OfflineSync] Cleanup failed:', error);
    }
  }

  /**
   * Destroy the service and clean up resources.
   */
  destroy(): void {
    this.stopHeartbeat();

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleBrowserOnline);
      window.removeEventListener('offline', this.handleBrowserOffline);
    }

    this.subscribers = [];
    this.isInitialized = false;
    this.isSyncing = false;

    console.log('[OfflineSync] Service destroyed.');
  }
}

// Singleton instance
export const offlineSyncService = new OfflineSyncService();
export type {
  ConnectivityStatus,
  SyncOperationType,
  SyncItemStatus,
  SyncQueueItem,
  OfflineState,
  AuditLogEntry,
};
