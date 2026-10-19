/**
 * LocalDatabaseService - IndexedDB wrapper for persistent local storage.
 * Handles CRUD operations with simple encryption for sensitive data.
 */

const DB_NAME = 'aura_pos_db';
const DB_VERSION = 1;

type StoreName = 'orders' | 'menuItems' | 'categories' | 'inventory' | 'customers' | 'syncQueue' | 'auditLog';

const STORE_NAMES: StoreName[] = ['orders', 'menuItems', 'categories', 'inventory', 'customers', 'syncQueue', 'auditLog'];

// --- Encryption helpers (simple base64 + XOR for offline sensitive data) ---
const ENCRYPTION_KEY = 'AURA_POS_2024_OFFLINE_KEY';

function encrypt(data: string): string {
  try {
    const xorResult = data
      .split('')
      .map((char, i) => {
        const keyChar = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
        return String.fromCharCode(char.charCodeAt(0) ^ keyChar);
      })
      .join('');
    return btoa(unescape(encodeURIComponent(xorResult)));
  } catch {
    // If encryption fails, return base64 as fallback
    return btoa(unescape(encodeURIComponent(data)));
  }
}

function decrypt(encoded: string): string {
  try {
    const xorResult = decodeURIComponent(escape(atob(encoded)));
    return xorResult
      .split('')
      .map((char, i) => {
        const keyChar = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
        return String.fromCharCode(char.charCodeAt(0) ^ keyChar);
      })
      .join('');
  } catch {
    // If decryption fails, try plain base64
    try {
      return decodeURIComponent(escape(atob(encoded)));
    } catch {
      return encoded;
    }
  }
}

// --- Stored item wrapper with encryption support ---
interface StoredItem<T> {
  key: string;
  data: string; // encrypted JSON string
  encrypted: boolean;
  timestamp: number;
}

const SENSITIVE_STORES: Set<StoreName> = new Set(['customers']);

class LocalDatabaseService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database. Must be called before any other operation.
   */
  async init(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('[LocalDB] IndexedDB not available. Offline storage disabled.');
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (_event: IDBVersionChangeEvent) => {
        const database = request.result;
        for (const storeName of STORE_NAMES) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: 'key' });
          }
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[LocalDB] Database initialized successfully.');
        resolve();
      };

      request.onerror = () => {
        console.error('[LocalDB] Failed to open database:', request.error);
        reject(new Error(`Failed to open database: ${request.error?.message ?? 'Unknown error'}`));
      };

      request.onblocked = () => {
        console.warn('[LocalDB] Database upgrade blocked by another connection.');
      };
    });

    await this.initPromise;
  }

  /**
   * Ensure DB is initialized; throw if not available.
   */
  private ensureDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('[LocalDB] Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Wrap an IDBRequest in a promise.
   */
  private wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`IDB error: ${request.error?.message ?? 'Unknown error'}`));
    });
  }

  /**
   * Serialize and optionally encrypt an item for storage.
   */
  private serialize<T>(storeName: string, key: string, item: T): StoredItem<T> {
    const jsonString = JSON.stringify(item);
    const shouldEncrypt = SENSITIVE_STORES.has(storeName as StoreName);

    return {
      key,
      data: shouldEncrypt ? encrypt(jsonString) : jsonString,
      encrypted: shouldEncrypt,
      timestamp: Date.now(),
    };
  }

  /**
   * Deserialize a stored item, decrypting if necessary.
   */
  private deserialize<T>(stored: StoredItem<T>): T {
    const jsonString = stored.encrypted ? decrypt(stored.data) : stored.data;
    return JSON.parse(jsonString) as T;
  }

  /**
   * Store an item in the specified object store.
   */
  async put<T>(storeName: string, item: T): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDb();

      const itemWithKey = item as Record<string, unknown>;
      if (!itemWithKey.id && !itemWithKey.key) {
        throw new Error('[LocalDB] Item must have an "id" or "key" property for storage.');
      }
      const key = String(itemWithKey.id ?? itemWithKey.key);

      const stored = this.serialize<T>(storeName, key, item);
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await this.wrapRequest(store.put(stored));
    } catch (error) {
      console.error(`[LocalDB] Error putting item in ${storeName}:`, error);
      throw error;
    }
  }

  /**
   * Get a single item by key from the specified object store.
   */
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    try {
      await this.init();
      const db = this.ensureDb();

      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const result = await this.wrapRequest<StoredItem<T> | undefined>(store.get(key));

      if (!result) return undefined;
      return this.deserialize<T>(result);
    } catch (error) {
      console.error(`[LocalDB] Error getting item from ${storeName}:`, error);
      return undefined;
    }
  }

  /**
   * Get all items from the specified object store.
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    try {
      await this.init();
      const db = this.ensureDb();

      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const results = await this.wrapRequest<StoredItem<T>[]>(store.getAll());

      return results.map((item) => this.deserialize<T>(item));
    } catch (error) {
      console.error(`[LocalDB] Error getting all items from ${storeName}:`, error);
      return [];
    }
  }

  /**
   * Delete a single item by key from the specified object store.
   */
  async deleteItem(storeName: string, key: string): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDb();

      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await this.wrapRequest(store.delete(key));
    } catch (error) {
      console.error(`[LocalDB] Error deleting item from ${storeName}:`, error);
      throw error;
    }
  }

  /**
   * Clear all items from the specified object store.
   */
  async clearStore(storeName: string): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDb();

      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await this.wrapRequest(store.clear());
    } catch (error) {
      console.error(`[LocalDB] Error clearing store ${storeName}:`, error);
      throw error;
    }
  }

  /**
   * Count the number of items in the specified object store.
   */
  async count(storeName: string): Promise<number> {
    try {
      await this.init();
      const db = this.ensureDb();

      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return await this.wrapRequest<number>(store.count());
    } catch (error) {
      console.error(`[LocalDB] Error counting items in ${storeName}:`, error);
      return 0;
    }
  }

  /**
   * Check if any data exists locally in the specified store.
   */
  async hasData(storeName: string): Promise<boolean> {
    const count = await this.count(storeName);
    return count > 0;
  }

  /**
   * Check if IndexedDB is available in the current environment.
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.indexedDB;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Singleton instance
export const localDatabaseService = new LocalDatabaseService();
export type { StoreName, StoredItem };
