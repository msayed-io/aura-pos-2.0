// ============================================================================
// WAKZ API Proxy — Catch-all Route
// ============================================================================
// Proxies all /api/wakz/* requests to the WAKZ server.
// Adds the x-cashier-key header server-side to keep the API key secure.
// Supports: GET, POST, PUT, DELETE methods.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

// Credentials must be provided by the deployment environment, never committed.
const WAKZ_API_KEY = process.env.WAKZ_API_KEY;
const WAKZ_BASE_URL = process.env.WAKZ_BASE_URL;

// Timeout for regular API calls (15 seconds)
const API_TIMEOUT_MS = 15000;

// Timeout for AI-powered endpoints that need more processing time (60 seconds)
const AI_API_TIMEOUT_MS = 60000;

/**
 * Catch-all handler for /api/wakz/[...path]
 * Proxies the request to the WAKZ server with the API key.
 */
async function proxyRequest(request: NextRequest): Promise<NextResponse> {
  try {
    if (!WAKZ_API_KEY || !WAKZ_BASE_URL) {
      return NextResponse.json(
        { success: false, error: 'WAKZ_NOT_CONFIGURED', message: 'تكامل WAKZ غير مُعد على الخادم.' },
        { status: 503 }
      );
    }

    // Extract the path after /api/wakz/
    const url = new URL(request.url);
    const pathSegments = url.pathname.replace('/api/wakz', '');

    // Forward query params (e.g. limit, channel)
    const forwardParams = new URLSearchParams(url.searchParams);
    const queryString = forwardParams.toString();

    const baseUrl = WAKZ_BASE_URL.replace(/\/+$/, '');
    const targetUrl = `${baseUrl}/api/v1/cashier${pathSegments}${queryString ? `?${queryString}` : ''}`;

    console.log(`[WAKZ Proxy] ${request.method} → ${targetUrl}`);

    // Prepare headers — add the API key
    // When the incoming request is multipart/form-data (e.g. file uploads),
    // we must forward the original Content-Type (which includes the boundary)
    // instead of forcing application/json, otherwise the upload will break.
    const incomingContentType = request.headers.get('content-type') || '';
    const contentType = incomingContentType.includes('multipart/form-data')
      ? incomingContentType
      : 'application/json';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'x-cashier-key': WAKZ_API_KEY,
    };

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(
        pathSegments.includes('magic-wand') ? AI_API_TIMEOUT_MS : API_TIMEOUT_MS
      ),
    };

    // Forward body for POST/PUT/DELETE
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const body = await request.text();
        if (body) {
          fetchOptions.body = body;
        }
      } catch {
        // No body — that's fine for some requests
      }
    }

    // Make the proxied request
    const response = await fetch(targetUrl, fetchOptions);

    // Parse and return the response
    const responseContentType = response.headers.get('content-type') || '';
    let responseBody: unknown;

    if (responseContentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      const textBody = await response.text();
      try {
        // Try to parse as JSON anyway (some servers don't set content-type correctly)
        responseBody = JSON.parse(textBody);
      } catch {
        responseBody = { rawResponse: textBody };
      }
    }

    // If WAKZ returned a non-OK status, build a proper error response
    if (!response.ok) {
      const errorBody = typeof responseBody === 'object' && responseBody !== null
        ? responseBody as Record<string, unknown>
        : {};

      const errorMsg = (errorBody.message as string) || (errorBody.error as string) || getDefaultErrorMessage(response.status);

      console.error(`[WAKZ Proxy] Error ${response.status} from ${targetUrl}:`, JSON.stringify(errorBody).slice(0, 300));

      // Always return 200 with success:false so the client can handle errors gracefully
      // without triggering the throw in wakzService.apiCall
      return NextResponse.json(
        {
          success: false,
          error: (errorBody.error as string) || `HTTP_${response.status}`,
          message: errorMsg,
          statusCode: response.status,
        },
        { status: 200 }
      );
    }

    // Success — normalize and pass through the WAKZ response
    // WAKZ wraps some responses (connect/*) in a `data` envelope.
    // We unwrap it so the frontend gets a flat response.
    const normalized = normalizeWakzResponse(responseBody);
    return NextResponse.json(normalized, { status: 200 });
  } catch (error) {
    console.error('[WAKZ Proxy] Error:', error);

    // Handle timeout
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return NextResponse.json(
        {
          success: false,
          error: 'TIMEOUT',
          message: 'انتهت مهلة الاتصال بالخادم.',
        },
        { status: 200 }
      );
    }

    // Handle network errors (DNS failure, connection refused, etc.)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        {
          success: false,
          error: 'NETWORK_ERROR',
          message: 'لا يمكن الاتصال بخادم WAKZ.',
        },
        { status: 200 }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'حدث خطأ داخلي في الخادم.',
      },
      { status: 200 }
    );
  }
}

/**
 * Normalizes WAKZ API responses by unwrapping `data` envelopes.
 * WAKZ wraps connect endpoint responses in a `data` field.
 * We merge `data` into the top level so the frontend gets flat responses.
 */
function normalizeWakzResponse(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;

  const obj = body as Record<string, unknown>;

  // If there's a `data` field that's an object, merge it into the top level
  if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
    const dataObj = obj.data as Record<string, unknown>;
    // Merge data into the response, but keep top-level fields that aren't `data`
    const { data: _, ...rest } = obj;
    return { ...rest, ...dataObj };
  }

  return body;
}

/**
 * Returns a user-friendly Arabic error message for common HTTP status codes.
 */
function getDefaultErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'طلب غير صالح. تأكد من البيانات المُدخلة.';
    case 401:
      return 'مفتاح API غير صالح. تواصل مع دعم WAKZ.';
    case 403:
      return 'ليس لديك صلاحية لهذا الإجراء.';
    case 404:
      return 'الإندبوينت غير موجود على خادم WAKZ.';
    case 429:
      return 'طلبات كثيرة جداً. انتظر قليلاً ثم حاول مرة أخرى.';
    case 500:
      return 'خطأ داخلي في خادم WAKZ. قد يكون البوت لم يتم إعداده بعد.';
    case 502:
    case 503:
      return 'خادم WAKZ غير متاح حالياً. حاول لاحقاً.';
    default:
      return `خطأ في الاتصال بالخادم (${status})`;
  }
}

// Export all HTTP method handlers
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}
