// ============================================================================
// WAKZ Service — Aura POS 2.0
// ============================================================================
// Client-side singleton service for all WAKZ API interactions.
// All calls go through our Next.js proxy routes (/api/wakz/...) to keep
// the API key server-side. This service manages local state, caching,
// and provides a clean interface for UI components.
// ============================================================================

import type {
  BotConfig,
  BotConfigSaveResponse,
  MagicWandRequest,
  MagicWandResponse,
  WhatsAppConnectInitializeRequest,
  WhatsAppConnectInitializeResponse,
  WhatsAppQRResponse,
  WhatsAppPairingCodeRequest,
  WhatsAppPairingCodeResponse,
  WhatsAppConnectionStatusResponse,
  WhatsAppLogoutResponse,
  WhatsAppConnectionStatus,
  KnowledgeAddRequest,
  KnowledgeListResponse,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  MessageListResponse,
  MessageSendRequest,
  MessageSendResponse,
  AutoReplyToggleResponse,
  AutoReplyToggleRequest,
  WebhookConfigResponse,
  WebhookConfigUpdateRequest,
  WakzLocalConfig,
  WakzApiError,
  QuickReply,
  BusinessHours,
} from '../types/wakzTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCAL_STORAGE_KEY = 'aura_wakz_config';

const DEFAULT_LOCAL_CONFIG: WakzLocalConfig = {
  connectionStatus: 'disconnected',
  whatsappUserId: 'cashier_cmoy402u90000nrwtb3xyy0c1_1778316958307',
  connectionMode: 'idle',
  autoReplyEnabled: false,
  businessHours: {
    enabled: false,
    startTime: '09:00',
    endTime: '22:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    timezone: 'Africa/Cairo',
  },
  quickReplies: [],
  sendSpeedMs: 1500,
  knowledgeEntriesCount: 0,
};

// ---------------------------------------------------------------------------
// Type guard for API errors
// ---------------------------------------------------------------------------

function isWakzError(response: unknown): response is WakzApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as WakzApiError).success === false
  );
}

// ---------------------------------------------------------------------------
// WAKZ Service Singleton
// ---------------------------------------------------------------------------

class WakzService {
  private config: WakzLocalConfig;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.config = this.loadConfig();
  }

  // =========================================================================
  // Local Config Management
  // =========================================================================

  private loadConfig(): WakzLocalConfig {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<WakzLocalConfig>;
        return { ...DEFAULT_LOCAL_CONFIG, ...parsed };
      }
    } catch {
      // ignore parse errors
    }
    return { ...DEFAULT_LOCAL_CONFIG };
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // ignore storage errors
    }
    this.notifyListeners();
  }

  /** Subscribe to config changes */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // prevent one listener error from blocking others
      }
    });
  }

  /** Get current local config (read-only copy) */
  getConfig(): Readonly<WakzLocalConfig> {
    return { ...this.config };
  }

  /** Update local config partially */
  updateConfig(partial: Partial<WakzLocalConfig>): void {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
  }

  // =========================================================================
  // Generic API Call (through our Next.js proxy)
  // =========================================================================

  private async apiCall<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    try {
      const url = `/api/wakz${path}`;

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      // The proxy always returns 200 with success field
      // so we only need to check the success field in the response
      const data = await response.json() as T & { success?: boolean; message?: string; error?: string };

      // If the proxy returned an error (success: false), throw with the message
      if (data.success === false) {
        throw new Error(data.message || data.error || 'خطأ غير معروف');
      }

      return data;
    } catch (error) {
      // Re-throw with user-friendly message for network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('لا يمكن الاتصال بالخادم. تأكد من اتصالك بالإنترنت.');
      }
      throw error;
    }
  }



  // =========================================================================
  // WhatsApp Connection
  // =========================================================================

  /** Initialize WhatsApp connection
   *  @param params Optional parameters for the new WAKZ API flow:
   *    - method: 'qr' or 'pairing'
   *    - phoneNumber: Required when method is 'pairing'
   */
  async initializeConnection(params?: WhatsAppConnectInitializeRequest): Promise<WhatsAppConnectInitializeResponse> {
    try {
      const result = await this.apiCall<WhatsAppConnectInitializeResponse>(
        'POST',
        '/connect/initialize',
        params || {}
      );
      if (result.success && result.pairingCode) {
        this.updateConfig({ connectionStatus: 'pairing_ready', connectionMode: 'pairing' });
      } else if (result.success) {
        this.updateConfig({ connectionStatus: 'qr_ready', connectionMode: 'qr' });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] initializeConnection error:', error);
      throw error;
    }
  }

  /** Get QR Code for WhatsApp connection
   *  The WAKZ /connect/qr endpoint returns the QR image in the 'qr' field.
   *  We normalize it to 'qrCode' for consistency with our internal types.
   *  IMPORTANT: This will NOT fetch QR if we are in pairing mode,
   *  because calling /connect/qr invalidates the pairing code.
   */
  async getQRCode(): Promise<WhatsAppQRResponse> {
    // Don't fetch QR if we're in pairing mode — it would invalidate the pairing code
    if (this.config.connectionMode === 'pairing') {
      return { success: false, message: 'في وضع الاقتران — لا يمكن جلب رمز QR' };
    }
    try {
      const result = await this.apiCall<WhatsAppQRResponse>(
        'GET',
        '/connect/qr'
      );
      // The API returns 'qr' field, but we also check 'qrCode' for fallback
      const hasQr = result.success && (result.qr || result.qrCode);
      if (hasQr) {
        // Normalize: if 'qr' exists but 'qrCode' doesn't, copy 'qr' to 'qrCode'
        if (result.qr && !result.qrCode) {
          (result as WhatsAppQRResponse & { qrCode: string }).qrCode = result.qr;
        }
        this.updateConfig({ connectionStatus: 'qr_ready', connectionMode: 'qr' });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] getQRCode error:', error);
      throw error;
    }
  }

  /** Request pairing code for phone number
   *  Strategy:
   *  1. Try the new /connect/initialize with method='pairing' (recommended by WAKZ)
   *  2. Fall back to the old /connect/pairing-code endpoint
   *  Sets connectionMode to 'pairing' so QR auto-refresh is stopped.
   */
  async requestPairingCode(phone: string): Promise<WhatsAppPairingCodeResponse> {
    // Method 1: Use the new initialize with pairing method
    try {
      const initResult = await this.initializeConnection({ method: 'pairing', phoneNumber: phone });
      if (initResult.success && initResult.pairingCode) {
        this.updateConfig({ connectionStatus: 'pairing_ready', connectionMode: 'pairing' });
        return { success: true, pairingCode: initResult.pairingCode };
      }
    } catch {
      // Fallback to old method
    }

    // Method 2: Fallback — old /connect/pairing-code endpoint
    try {
      const userId = this.config.whatsappUserId;
      const result = await this.apiCall<WhatsAppPairingCodeResponse>(
        'POST',
        '/connect/pairing-code',
        { phoneNumber: phone, userId } as WhatsAppPairingCodeRequest
      );
      if (result.success) {
        this.updateConfig({ connectionStatus: 'pairing_ready', connectionMode: 'pairing' });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] requestPairingCode error:', error);
      throw error;
    }
  }

  /** Get current WhatsApp connection status */
  async getConnectionStatus(): Promise<WhatsAppConnectionStatusResponse> {
    try {
      const result = await this.apiCall<WhatsAppConnectionStatusResponse>(
        'GET',
        '/connect/status'
      );
      if (result.success) {
        const status = mapWakzStatus(result.status, result.ready, result.qrCode, result.pairingCode);
        this.updateConfig({
          connectionStatus: status,
          connectedPhone: result.phoneNumber || undefined,
        });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] getConnectionStatus error:', error);
      throw error;
    }
  }

  /** Disconnect WhatsApp */
  async logout(): Promise<WhatsAppLogoutResponse> {
    try {
      const result = await this.apiCall<WhatsAppLogoutResponse>(
        'POST',
        '/connect/logout'
      );
      if (result.success) {
        this.updateConfig({
          connectionStatus: 'disconnected',
          connectedPhone: undefined,
          connectionMode: 'idle',
        });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] logout error:', error);
      throw error;
    }
  }

  // =========================================================================
  // Bot Config (W-DNA)
  // =========================================================================

  /** Get current bot configuration */
  async getBotConfig(): Promise<BotConfig> {
    try {
      const result = await this.apiCall<{ success: boolean; configured?: boolean; config?: BotConfig }>(
        'GET',
        '/bot/config'
      );
      const botConfig = result.config || {
        botName: '',
        businessName: '',
        corePrompt: '',
        emojiEnabled: true,
        responseLength: 'auto' as const,
        isActive: false,
      };
      this.updateConfig({ botConfig });
      return botConfig;
    } catch (error) {
      console.error('[WAKZ] getBotConfig error:', error);
      throw error;
    }
  }

  /** Save bot configuration */
  async saveBotConfig(config: BotConfig): Promise<BotConfigSaveResponse> {
    try {
      // Only send fields the API accepts
      const payload = {
        botName: config.botName,
        businessName: config.businessName,
        corePrompt: config.corePrompt,
        emojiEnabled: config.emojiEnabled,
        responseLength: config.responseLength,
      };
      const result = await this.apiCall<BotConfigSaveResponse>(
        'POST',
        '/bot/config',
        payload
      );
      if (result.success) {
        this.updateConfig({ botConfig: config });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] saveBotConfig error:', error);
      throw error;
    }
  }

  /** Use AI to generate bot core prompt (Magic Wand) */
  async magicWand(request: MagicWandRequest): Promise<MagicWandResponse> {
    try {
      const result = await this.apiCall<MagicWandResponse>(
        'POST',
        '/bot/magic-wand',
        request
      );
      return result;
    } catch (error) {
      console.error('[WAKZ] magicWand error:', error);
      throw error;
    }
  }

  // =========================================================================
  // Knowledge Base
  // =========================================================================

  /** Get all knowledge entries */
  async getKnowledgeEntries(): Promise<KnowledgeListResponse> {
    try {
      const result = await this.apiCall<KnowledgeListResponse>(
        'GET',
        '/knowledge'
      );
      if (result.success && result.entries) {
        this.updateConfig({ knowledgeEntriesCount: result.total || result.entries.length });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] getKnowledgeEntries error:', error);
      throw error;
    }
  }

  /** Add a new knowledge entry */
  async addKnowledgeEntry(entry: KnowledgeAddRequest): Promise<{ success: boolean; id?: string }> {
    try {
      const result = await this.apiCall<{ success: boolean; id?: string }>(
        'POST',
        '/knowledge',
        { ...entry, sourceFile: entry.sourceFile || 'manual-entry' }
      );
      if (result.success) {
        this.updateConfig({
          knowledgeEntriesCount: this.config.knowledgeEntriesCount + 1,
        });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] addKnowledgeEntry error:', error);
      throw error;
    }
  }

  /** Search knowledge base */
  async searchKnowledge(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    try {
      const result = await this.apiCall<KnowledgeSearchResponse>(
        'POST',
        '/knowledge/search',
        request
      );
      return result;
    } catch (error) {
      console.error('[WAKZ] searchKnowledge error:', error);
      throw error;
    }
  }

  // =========================================================================
  // Messages
  // =========================================================================

  /** Get recent messages */
  async getMessages(limit: number = 50): Promise<MessageListResponse> {
    try {
      const result = await this.apiCall<MessageListResponse>(
        'GET',
        `/messages?limit=${limit}&channel=whatsapp`
      );
      return result;
    } catch (error) {
      console.error('[WAKZ] getMessages error:', error);
      throw error;
    }
  }

  /** Send a message as the bot */
  async sendMessage(request: MessageSendRequest): Promise<MessageSendResponse> {
    try {
      const result = await this.apiCall<MessageSendResponse>(
        'POST',
        '/messages/send',
        request
      );
      return result;
    } catch (error) {
      console.error('[WAKZ] sendMessage error:', error);
      throw error;
    }
  }

  // =========================================================================
  // Auto-Reply
  // =========================================================================

  /** Get auto-reply status */
  async getAutoReplyStatus(): Promise<AutoReplyToggleResponse> {
    try {
      const result = await this.apiCall<AutoReplyToggleResponse>(
        'GET',
        '/auto-reply/toggle'
      );
      if (result.success) {
        this.updateConfig({ autoReplyEnabled: result.enabled });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] getAutoReplyStatus error:', error);
      throw error;
    }
  }

  /** Toggle auto-reply on/off */
  async toggleAutoReply(request: AutoReplyToggleRequest): Promise<AutoReplyToggleResponse> {
    try {
      const result = await this.apiCall<AutoReplyToggleResponse>(
        'POST',
        '/auto-reply/toggle',
        request
      );
      if (result.success) {
        this.updateConfig({ autoReplyEnabled: request.enabled });
      }
      return result;
    } catch (error) {
      console.error('[WAKZ] toggleAutoReply error:', error);
      throw error;
    }
  }

  // =========================================================================
  // Webhooks
  // =========================================================================

  /** Get current webhook configuration */
  async getWebhookConfig(): Promise<WebhookConfigResponse> {
    try {
      const result = await this.apiCall<WebhookConfigResponse>(
        'GET',
        '/webhooks/config'
      );
      return result;
    } catch (error) {
      console.error('[WAKZ] getWebhookConfig error:', error);
      throw error;
    }
  }

  /** Register/update webhook */
  async updateWebhookConfig(request: WebhookConfigUpdateRequest): Promise<WebhookConfigResponse> {
    try {
      const result = await this.apiCall<WebhookConfigResponse>(
        'POST',
        '/webhooks/config',
        request
      );
      return result;
    } catch (error) {
      console.error('[WAKZ] updateWebhookConfig error:', error);
      throw error;
    }
  }

  // =========================================================================
  // Local-only: Business Hours
  // =========================================================================

  /** Update business hours (stored locally) */
  updateBusinessHours(hours: BusinessHours): void {
    this.updateConfig({ businessHours: hours });
  }

  // =========================================================================
  // Local-only: Quick Replies
  // =========================================================================

  /** Add a quick reply */
  addQuickReply(trigger: string, reply: string): void {
    const newReply: QuickReply = {
      id: crypto.randomUUID(),
      trigger,
      reply,
      isActive: true,
    };
    this.updateConfig({
      quickReplies: [...this.config.quickReplies, newReply],
    });
  }

  /** Remove a quick reply by ID */
  removeQuickReply(id: string): void {
    this.updateConfig({
      quickReplies: this.config.quickReplies.filter((qr) => qr.id !== id),
    });
  }

  /** Toggle a quick reply */
  toggleQuickReply(id: string): void {
    this.updateConfig({
      quickReplies: this.config.quickReplies.map((qr) =>
        qr.id === id ? { ...qr, isActive: !qr.isActive } : qr
      ),
    });
  }

  // =========================================================================
  // Local-only: Send Speed
  // =========================================================================

  /** Update send speed (ms between messages) */
  updateSendSpeed(speedMs: number): void {
    this.updateConfig({ sendSpeedMs: Math.max(500, Math.min(5000, speedMs)) });
  }

  // =========================================================================
  // Connection Status Polling (for Electron readiness)
  // =========================================================================

  private statusPollingInterval: ReturnType<typeof setInterval> | null = null;

  /** Start polling connection status every N seconds */
  startStatusPolling(intervalMs: number = 15000): void {
    this.stopStatusPolling();
    this.statusPollingInterval = setInterval(async () => {
      try {
        const result = await this.getConnectionStatus();
        if (result.success) {
          const status = mapWakzStatus(result.status, result.ready, result.qrCode, result.pairingCode);
          this.updateConfig({
            connectionStatus: status,
            connectedPhone: result.phoneNumber || undefined,
          });
        }
      } catch {
        // Silently handle polling errors (offline, etc.)
        this.updateConfig({ connectionStatus: 'disconnected' });
      }
    }, intervalMs);
  }

  /** Stop polling connection status */
  stopStatusPolling(): void {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
    }
  }

  // =========================================================================
  // Full Sync — Fetch all remote state
  // =========================================================================

  /** Sync all remote state to local cache */
  async fullSync(): Promise<void> {
    try {
      // Run all fetches in parallel for speed
      const [statusResult, , botConfigResult, , autoReplyResult] = await Promise.allSettled([
        this.getConnectionStatus(),
        this.getKnowledgeEntries(),
        this.getBotConfig(),
        this.getWebhookConfig(),
        this.getAutoReplyStatus(),
      ]);

      // Process connection status result
      if (statusResult.status === 'fulfilled' && statusResult.value.success) {
        const sr = statusResult.value;
        const status = mapWakzStatus(sr.status, sr.ready, sr.qrCode, sr.pairingCode);
        this.updateConfig({
          connectionStatus: status,
          connectedPhone: sr.phoneNumber || undefined,
        });
      }

      // Process bot config result
      if (botConfigResult.status === 'fulfilled') {
        this.updateConfig({ botConfig: botConfigResult.value });
      }

      // Process auto-reply result
      if (autoReplyResult.status === 'fulfilled') {
        this.updateConfig({ autoReplyEnabled: autoReplyResult.value.enabled });
      }

      this.updateConfig({ lastSyncAt: new Date().toISOString() });
    } catch (error) {
      console.error('[WAKZ] fullSync error:', error);
    }
  }

  // =========================================================================
  // Cleanup (for unmount / Electron shutdown)
  // =========================================================================

  /** Cleanup all resources */
  destroy(): void {
    this.stopStatusPolling();
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Status Mapping — WAKZ server uses simple strings, we need richer states
// ---------------------------------------------------------------------------

/**
 * Maps the WAKZ connection status to our richer status type.
 * The WAKZ server returns simple "connected"/"disconnected" status plus
 * `ready`, `qrCode`, and `pairingCode` fields that indicate intermediate states.
 */
function mapWakzStatus(
  status: string,
  ready?: boolean | null,
  qrCode?: string | null,
  pairingCode?: string | null
): WhatsAppConnectionStatus {
  if (status === 'connected') return 'connected';
  if (status === 'connecting') return 'connecting';

  // WAKZ server returns "qr" when session is waiting for QR scan
  if (status === 'qr') return 'qr_ready';

  // WAKZ server returns "pairing" when session is waiting for pairing code entry
  if (status === 'pairing') return 'pairing_ready';

  // For disconnected state, check if QR or pairing code is available
  // which means the connection was initialized and waiting for scan
  if (status === 'disconnected') {
    if (qrCode) return 'qr_ready';
    if (pairingCode) return 'pairing_ready';
    if (ready === false) return 'disconnected';
  }

  // Fallback: if qrCode or pairingCode exist in any unknown status, use them
  if (qrCode) return 'qr_ready';
  if (pairingCode) return 'pairing_ready';

  return 'disconnected';
}

// ---------------------------------------------------------------------------
// Export singleton instance
// ---------------------------------------------------------------------------

export const wakzService = new WakzService();
export { isWakzError };
