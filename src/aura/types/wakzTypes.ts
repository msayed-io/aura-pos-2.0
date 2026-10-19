// ============================================================================
// WAKZ Integration Types — Aura POS 2.0
// ============================================================================
// All TypeScript types for the WAKZ Bot & AI integration.
// Covers: WhatsApp connection, Bot config (W-DNA), Knowledge base,
// Auto-reply, Webhooks, Messages, and incoming events.
// These types match the actual WAKZ Cashier API responses after
// the proxy normalizes (unwraps `data` envelopes).
// ============================================================================

// ---------------------------------------------------------------------------
// WhatsApp Connection
// ---------------------------------------------------------------------------

export type WhatsAppConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'qr_ready' | 'pairing_ready';

export interface WhatsAppConnectInitializeRequest {
  method?: 'qr' | 'pairing';  // Connection method
  phoneNumber?: string;        // Required when method is 'pairing'
}

export interface WhatsAppConnectInitializeResponse {
  success: boolean;
  message?: string;
  pairingCode?: string;  // Returned when method is 'pairing'
}

export interface WhatsAppQRResponse {
  success: boolean;
  qr?: string; // Base64 PNG image (data:image/png;base64,...) — from /connect/qr endpoint
  qrCode?: string; // Raw QR string — from /connect/status endpoint
  status?: string; // Connection status from QR response
  message?: string;
}

export interface WhatsAppPairingCodeRequest {
  phoneNumber: string; // E.g., "201012345678" — MUST match WAKZ API field name
  userId: string; // WhatsApp User ID from WAKZ (e.g., cashier_cmoy402u90000nrwtb3xyy0c1_...)
}

export interface WhatsAppPairingCodeResponse {
  success: boolean;
  pairingCode?: string; // E.g., "2DPBYPPV"
  message?: string;
}

export interface WhatsAppConnectionStatusResponse {
  success: boolean;
  status: WhatsAppConnectionStatus;
  ready?: boolean;
  qrCode?: string | null;
  pairingCode?: string | null;
  phoneNumber?: string | null;
  lastConnected?: string | null;
  reconnectAttempts?: number;
  stats?: {
    activeConnections: number;
    totalSessions: number;
  };
  whatsappServiceAvailable?: boolean;
}

export interface WhatsAppLogoutResponse {
  success: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Bot Config (W-DNA)
// ---------------------------------------------------------------------------

export interface BotConfig {
  id?: string;
  botName: string;
  businessName: string;
  corePrompt?: string;
  emojiEnabled?: boolean;
  responseLength?: 'short' | 'medium' | 'long' | 'auto';
  isActive?: boolean;
  updatedAt?: string;
}

export interface BotConfigSaveResponse {
  success: boolean;
  message?: string;
  config?: BotConfig;
}

export interface MagicWandRequest {
  botName: string;
  businessName: string;
}

export interface MagicWandResponse {
  success: boolean;
  corePrompt?: string;
  greetingMessage?: string;
  awayMessage?: string;
  suggestions?: string[];
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  type: 'menu' | 'faq' | 'policy' | 'custom';
  sourceFile?: string;
  fileType?: string;
  chunkIndex?: number;
  metadata?: string;
  wdnaConfigId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface KnowledgeAddRequest {
  title: string;
  content: string;
  sourceFile?: string;
  fileType?: string;
}

export interface KnowledgeSearchRequest {
  query: string;
  limit?: number;
}

export interface KnowledgeSearchResponse {
  success: boolean;
  results?: KnowledgeEntry[];
}

export interface KnowledgeListResponse {
  success: boolean;
  entries?: KnowledgeEntry[];
  total?: number;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  from: string; // Phone number
  to: string;
  body: string;
  direction: 'inbound' | 'outbound';
  channel: 'whatsapp';
  timestamp: string;
  isRead: boolean;
  source?: 'ai' | 'human' | 'system';
}

export interface Conversation {
  id: string;
  phoneNumber: string;
  contactName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  messages?: Message[];
}

export interface MessageListResponse {
  success: boolean;
  conversations?: Conversation[];
  messages?: Message[];
  count?: number;
  hasMore?: boolean;
}

export interface MessageSendRequest {
  to: string; // Phone number
  message: string;
}

export interface MessageSendResponse {
  success: boolean;
  messageId?: string;
}

// ---------------------------------------------------------------------------
// Auto-Reply
// ---------------------------------------------------------------------------

export interface AutoReplyToggleResponse {
  success: boolean;
  enabled: boolean;
  whatsappAutoReply?: boolean;
}

export interface AutoReplyToggleRequest {
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEvent = 
  | 'order.detected' 
  | 'message.received' 
  | 'message.processed' 
  | 'connection.status' 
  | 'contact.new';

export interface WebhookConfig {
  webhookUrl: string;
  webhookEvents: WebhookEvent[];
  webhookSecret?: string; // Only returned on GET, never on POST response
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookConfigResponse {
  success: boolean;
  webhookUrl?: string;
  webhookEvents?: WebhookEvent[];
  webhookSecret?: string;
  config?: WebhookConfig;
}

export interface WebhookConfigUpdateRequest {
  webhookUrl: string;
  webhookEvents: WebhookEvent[];
}

// ---------------------------------------------------------------------------
// Incoming Webhook Events (from WAKZ server)
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  cashierKeyId: string;
  data: WebhookEventData;
}

export type WebhookEventData = 
  | OrderDetectedData 
  | MessageReceivedData 
  | MessageProcessedData 
  | ConnectionStatusData 
  | ContactNewData;

export interface OrderDetectedData {
  from: string;
  rawText: string;
  channel: 'whatsapp';
  detectedAt: string;
  /** Parsed order details (if the AI could extract them) */
  parsedItems?: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  customerName?: string;
  totalEstimate?: number;
}

export interface MessageReceivedData {
  from: string;
  body: string;
  channel: 'whatsapp';
  receivedAt: string;
}

export interface MessageProcessedData {
  from: string;
  reply: string;
  source: 'ai' | 'human' | 'system';
  channel: 'whatsapp';
  processedAt: string;
}

export interface ConnectionStatusData {
  status: WhatsAppConnectionStatus;
  changedAt: string;
  phoneNumber?: string;
}

export interface ContactNewData {
  phone: string;
  name: string | null;
  channel: 'whatsapp';
  firstSeenAt: string;
}

// ---------------------------------------------------------------------------
// Business Hours (local config, not WAKZ API)
// ---------------------------------------------------------------------------

export interface BusinessHours {
  enabled: boolean;
  startTime: string; // "09:00"
  endTime: string; // "22:00"
  days: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  timezone?: string;
}

export interface QuickReply {
  id: string;
  trigger: string; // Keyword or phrase that triggers this reply
  reply: string; // The auto-reply text
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// WAKZ Config (stored locally in localStorage)
// ---------------------------------------------------------------------------

export interface WakzLocalConfig {
  /** WhatsApp connection status (cached) */
  connectionStatus: WhatsAppConnectionStatus;
  /** Last known connection phone number */
  connectedPhone?: string;
  /** WhatsApp User ID (from WAKZ, required for pairing code) */
  whatsappUserId: string;
  /** Connection mode: 'qr' for QR code, 'pairing' for pairing code, 'idle' for neither */
  connectionMode: 'qr' | 'pairing' | 'idle';
  /** Bot config (cached) */
  botConfig?: BotConfig;
  /** Auto-reply enabled state (cached) */
  autoReplyEnabled: boolean;
  /** Business hours (local setting) */
  businessHours: BusinessHours;
  /** Quick replies (local setting) */
  quickReplies: QuickReply[];
  /** Send speed in ms between messages */
  sendSpeedMs: number;
  /** Knowledge entries count (cached) */
  knowledgeEntriesCount: number;
  /** Last sync timestamp */
  lastSyncAt?: string;
}

// ---------------------------------------------------------------------------
// API Error
// ---------------------------------------------------------------------------

export interface WakzApiError {
  success: false;
  error: string;
  message?: string;
  statusCode?: number;
}
