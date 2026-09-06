export class ApiError extends Error {
  constructor(public code: string, public status: number, message: string, public retryAfter?: number) { super(message); }
}

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=15552000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

export function secure(response: Response, api = false): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  const devNonce = import.meta.env.DEV ? import.meta.env.CPL_DEV_CSP_NONCE : undefined;
  if (!api && typeof devNonce === 'string' && /^[A-Za-z0-9+/]{32}$/.test(devNonce)) {
    headers.set('Content-Security-Policy', SECURITY_HEADERS['Content-Security-Policy']
      .replace("script-src 'self'", `script-src 'self' 'nonce-${devNonce}'`)
      .replace("style-src 'self'", `style-src 'self' 'nonce-${devNonce}'`));
  }
  if (api) {
    headers.set('Cache-Control', 'no-store, private, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('Vary', 'Origin');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return secure(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders } }), true);
}

export function errorResponse(error: unknown, requestId: string): Response {
  const known = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 500, 'The request could not be completed. Your text is still available. Please try again later.');
  return json({ error: { code: known.code, message: known.message, requestId } }, known.status, known.retryAfter ? { 'Retry-After': String(known.retryAfter) } : {});
}

/** The deadline settles even if a remote operation ignores cancellation. Never retries. */
export async function withDeadline<T>(operation: Promise<T>, timeoutMs: number, error: ApiError, cancel?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(error);
      try { cancel?.(); } catch { /* Cancellation is best effort; the deadline remains authoritative. */ }
    }, timeoutMs);
  });
  try { return await Promise.race([operation, timeout]); } finally { clearTimeout(timer); }
}

/** Reads the stream under a byte cap even when Content-Length is absent or false. */
export async function readBoundedText(message: Request | Response, maxBytes: number, timeoutMs?: number): Promise<string> {
  const declared = message.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new ApiError('BODY_TOO_LARGE', 413, 'This request is too large. Please shorten the text.');
  }
  if (!message.body) return '';
  const reader = message.body.getReader();
  // Never await cancellation: an uncooperative stream must not extend the deadline.
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const consume = async () => {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          cancel();
          throw new ApiError('BODY_TOO_LARGE', 413, 'This request is too large. Please shorten the text.');
        }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
  };
  if (timeoutMs !== undefined) {
    await withDeadline(consume(), timeoutMs, new ApiError('BODY_TIMEOUT', 408, 'Receiving the request took too long. Your text is still in the editor; please try again.'), cancel);
  } else await consume();
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(combined); } catch {
    throw new ApiError('INVALID_INPUT', 400, 'Please submit valid text.');
  }
}
