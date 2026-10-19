// ============================================================================
// WAKZ Webhook Handler — Aura POS 2.0
// ============================================================================
// Receives webhook events from the WAKZ server and processes them.
// Handles: order.detected, message.received, message.processed,
//          connection.status, contact.new
//
// Security: Verifies HMAC-SHA256 signature from X-WAKZ-Signature header.
// The webhookSecret is fetched from WAKZ config on first use and cached.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Cache for webhook secret (fetched from WAKZ on first webhook)
let cachedWebhookSecret: string | null = null;

// Credentials must be provided by the deployment environment, never committed.
const WAKZ_API_KEY = process.env.WAKZ_API_KEY;
const WAKZ_BASE_URL = process.env.WAKZ_BASE_URL || 'https://wakz.com';

// ---------------------------------------------------------------------------
// Webhook Secret Fetcher
// ---------------------------------------------------------------------------

async function getWebhookSecret(): Promise<string | null> {
  if (cachedWebhookSecret) return cachedWebhookSecret;
  if (process.env.WAKZ_WEBHOOK_SECRET) {
    cachedWebhookSecret = process.env.WAKZ_WEBHOOK_SECRET;
    return cachedWebhookSecret;
  }
  if (!WAKZ_API_KEY) return null;

  try {
    const baseUrl = WAKZ_BASE_URL.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/v1/cashier/webhooks/config`, {
      headers: {
        'x-cashier-key': WAKZ_API_KEY,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json() as { config?: { webhookSecret?: string } };
      if (data.config?.webhookSecret) {
        cachedWebhookSecret = data.config.webhookSecret;
        return cachedWebhookSecret;
      }
    }
  } catch (error) {
    console.error('[WAKZ Webhook] Failed to fetch webhook secret:', error);
  }

  // Never fail open: accepting unsigned webhooks would allow forged events.
  console.error('[WAKZ Webhook] Webhook secret is unavailable; rejecting the request.');
  return null;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 Signature Verification
// ---------------------------------------------------------------------------

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event Processors
// ---------------------------------------------------------------------------

interface OrderDetectedData {
  from: string;
  rawText: string;
  channel: string;
  detectedAt: string;
  parsedItems?: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  customerName?: string;
  totalEstimate?: number;
}

interface MessageReceivedData {
  from: string;
  body: string;
  channel: string;
  receivedAt: string;
}

interface MessageProcessedData {
  from: string;
  reply: string;
  source: string;
  channel: string;
  processedAt: string;
}

interface ConnectionStatusData {
  status: string;
  changedAt: string;
  phoneNumber?: string;
}

interface ContactNewData {
  phone: string;
  name: string | null;
  channel: string;
  firstSeenAt: string;
}

/**
 * Process an order.detected event.
 * This is the most critical event — creates a POS order from a WhatsApp order.
 */
async function processOrderDetected(data: OrderDetectedData): Promise<void> {
  try {
    console.log('[WAKZ Webhook] Order detected from:', data.from, 'Text:', data.rawText);

    const eventOrder = {
      id: crypto.randomUUID(),
      eventType: 'order.detected' as const,
      timestamp: Date.now(),
      data: {
        from: data.from,
        rawText: data.rawText,
        parsedItems: data.parsedItems || [],
        customerName: data.customerName || 'عميل واتساب',
        totalEstimate: data.totalEstimate || 0,
        channel: data.channel,
      },
    };

    pendingEvents.push(eventOrder);

    // Keep only last 100 events
    if (pendingEvents.length > 100) {
      pendingEvents = pendingEvents.slice(-100);
    }

    console.log('[WAKZ Webhook] Order queued. Pending events:', pendingEvents.length);
  } catch (error) {
    console.error('[WAKZ Webhook] Error processing order.detected:', error);
  }
}

/**
 * Process a message.received event.
 */
function processMessageReceived(data: MessageReceivedData): void {
  try {
    console.log('[WAKZ Webhook] Message received from:', data.from, ':', data.body);
    pendingEvents.push({
      id: crypto.randomUUID(),
      eventType: 'message.received',
      timestamp: Date.now(),
      data,
    });
    if (pendingEvents.length > 100) {
      pendingEvents = pendingEvents.slice(-100);
    }
  } catch (error) {
    console.error('[WAKZ Webhook] Error processing message.received:', error);
  }
}

/**
 * Process a message.processed event.
 */
function processMessageProcessed(data: MessageProcessedData): void {
  try {
    console.log('[WAKZ Webhook] Message processed for:', data.from);
    pendingEvents.push({
      id: crypto.randomUUID(),
      eventType: 'message.processed',
      timestamp: Date.now(),
      data,
    });
    if (pendingEvents.length > 100) {
      pendingEvents = pendingEvents.slice(-100);
    }
  } catch (error) {
    console.error('[WAKZ Webhook] Error processing message.processed:', error);
  }
}

/**
 * Process a connection.status event.
 */
function processConnectionStatus(data: ConnectionStatusData): void {
  try {
    console.log('[WAKZ Webhook] Connection status changed:', data.status);
    pendingEvents.push({
      id: crypto.randomUUID(),
      eventType: 'connection.status',
      timestamp: Date.now(),
      data,
    });
    if (pendingEvents.length > 100) {
      pendingEvents = pendingEvents.slice(-100);
    }
  } catch (error) {
    console.error('[WAKZ Webhook] Error processing connection.status:', error);
  }
}

/**
 * Process a contact.new event.
 */
function processContactNew(data: ContactNewData): void {
  try {
    console.log('[WAKZ Webhook] New contact:', data.phone);
    pendingEvents.push({
      id: crypto.randomUUID(),
      eventType: 'contact.new',
      timestamp: Date.now(),
      data,
    });
    if (pendingEvents.length > 100) {
      pendingEvents = pendingEvents.slice(-100);
    }
  } catch (error) {
    console.error('[WAKZ Webhook] Error processing contact.new:', error);
  }
}

// ---------------------------------------------------------------------------
// In-memory event queue (for POS to fetch via GET)
// ---------------------------------------------------------------------------

interface PendingEvent {
  id: string;
  eventType: string;
  timestamp: number;
  data: unknown;
}

let pendingEvents: PendingEvent[] = [];

// ---------------------------------------------------------------------------
// POST Handler — Receive webhooks from WAKZ
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Read the raw body for signature verification
    const rawBody = await request.text();

    // Verify signature
    const signature = request.headers.get('X-WAKZ-Signature') || '';
    const event = request.headers.get('X-WAKZ-Event') || '';
    const deliveryId = request.headers.get('X-WAKZ-Delivery-ID') || '';

    // Get webhook secret and verify
    const secret = await getWebhookSecret();
    if (!secret || !signature || !verifySignature(rawBody, signature, secret)) {
      console.error('[WAKZ Webhook] Invalid or unavailable signature for event:', event);
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse the payload
    let payload: { event: string; timestamp: string; cashierKeyId: string; data: unknown };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      console.error('[WAKZ Webhook] Invalid JSON payload');
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    console.log(`[WAKZ Webhook] Received event: ${payload.event} (delivery: ${deliveryId})`);

    // Route to appropriate processor
    switch (payload.event) {
      case 'order.detected':
        await processOrderDetected(payload.data as OrderDetectedData);
        break;
      case 'message.received':
        processMessageReceived(payload.data as MessageReceivedData);
        break;
      case 'message.processed':
        processMessageProcessed(payload.data as MessageProcessedData);
        break;
      case 'connection.status':
        processConnectionStatus(payload.data as ConnectionStatusData);
        break;
      case 'contact.new':
        processContactNew(payload.data as ContactNewData);
        break;
      default:
        console.warn('[WAKZ Webhook] Unknown event type:', payload.event);
    }

    // Always return 200 OK quickly — WAKZ expects fast acknowledgment
    return NextResponse.json({ success: true, received: true });
  } catch (error) {
    console.error('[WAKZ Webhook] Error processing webhook:', error);
    // Return 200 even on error to prevent WAKZ from retrying unnecessarily
    return NextResponse.json({ success: true, received: true, _error: true });
  }
}

// ---------------------------------------------------------------------------
// GET Handler — POS fetches pending events
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  try {
    // Return and clear pending events (consumer pattern)
    const events = [...pendingEvents];
    pendingEvents = [];
    return NextResponse.json({ success: true, events, count: events.length });
  } catch (error) {
    console.error('[WAKZ Webhook] Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
