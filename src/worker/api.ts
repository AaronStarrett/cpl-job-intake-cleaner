import { z } from 'zod';
import { SOURCE_LABELS, TRADE_HINTS } from '../shared/schema';
import { isApiKeyFormat } from '../shared/connection';
import { type Env, allowedOrigins, liveReadiness, publicConfig, readLimits } from './config';
import { ApiError, errorResponse, json, readBoundedText, withDeadline } from './http';
import { extractWithOpenAI, type FetchLike, verifyTurnstile } from './provider';

const submissionSchema = z.object({
  apiKey: z.string().max(512).refine(isApiKeyFormat),
  sourceText: z.string().min(1).max(8_000).refine((text) => text.trim().length > 0),
  sourceLabel: z.enum(SOURCE_LABELS),
  tradeHint: z.enum(TRADE_HINTS),
  turnstileToken: z.string().min(1).max(2_048),
  requestId: z.string().uuid().refine((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
}).strict();

export const API_DEADLINES = { body: 5_000, quotaHealth: 3_000, quotaReserve: 4_000, quotaRelease: 1_000 } as const;

/** Covers both the internal fetch and its bounded JSON body. No retry after uncertainty. */
async function quotaRequest(stub: DurableObjectStub, path: '/health' | '/reserve' | '/release', body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const failure = new ApiError('QUOTA_TIMEOUT', 503, 'Usage protection took too long to respond. No new AI request was started. Your text has been retained; please try again later.');
  const operation = (async () => {
    const response = await stub.fetch(`https://quota.internal${path}`, { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw failure;
    }
    const result = JSON.parse(await readBoundedText(response, 4_096)) as { code?: string; retryAfter?: number; ok?: boolean };
    return { response, result };
  })();
  return withDeadline(operation, timeoutMs, failure, () => controller.abort());
}

/** Daily keyed hashes; only these hashes reach persistent quota storage. */
export async function clientHashes(ip: string, secret: string, now = Date.now()): Promise<[string, string]> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const day = Math.floor(now / 86_400_000);
  const hash = async (epoch: number) => {
    const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`cpl-intake-v1\n${epoch}\n${ip}`));
    return Array.from(new Uint8Array(signed), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  return [await hash(day), await hash(day - 1)];
}

function quotaStub(env: Env): DurableObjectStub {
  if (!env.INTAKE_QUOTA) throw new ApiError('QUOTA_UNAVAILABLE', 503, 'Usage protection is unavailable. Your text has been retained; please try again later.');
  return env.INTAKE_QUOTA.get(env.INTAKE_QUOTA.idFromName('global-intake-quota-v1'));
}

async function reserve(stub: DurableObjectStub, requestId: string, hashes: [string, string]): Promise<void> {
  try {
    const { response, result } = await quotaRequest(stub, '/reserve', { requestId, clientHashes: hashes }, API_DEADLINES.quotaReserve);
    if (response.ok && result.code === 'RESERVED') return;
    if (response.status === 409 && result.code === 'DUPLICATE_REQUEST') throw new ApiError('DUPLICATE_REQUEST', 409, 'This submission was already processed or is still running. No second AI request was made.');
    if (response.status === 429 && ['DAILY_LIMIT', 'CLIENT_LIMIT', 'BUSY'].includes(result.code ?? '')) {
      const messages: Record<string, string> = {
        DAILY_LIMIT: 'Today’s processing allowance has been used. Your text has been retained. Please try again after the daily limit resets.',
        CLIENT_LIMIT: 'You have reached the processing limit for now. Your text has been retained. Please try again later.',
        BUSY: 'Live extraction is busy. Please wait a moment before trying again.',
      };
      throw new ApiError(result.code!, 429, messages[result.code!], Number.isInteger(result.retryAfter) && result.retryAfter! > 0 ? Math.min(result.retryAfter!, 86_400) : 60);
    }
  } catch (error) { if (error instanceof ApiError) throw error; }
  throw new ApiError('QUOTA_UNAVAILABLE', 503, 'Usage protection is unavailable. Your text has been retained; please try again later.');
}

export async function handleApi(request: Request, env: Env, fetcher: FetchLike = fetch): Promise<Response> {
  let requestId = crypto.randomUUID() as string;
  try {
    const url = new URL(request.url);
    if (url.pathname === '/api/config') {
      if (request.method !== 'GET') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for this endpoint.', requestId } }, 405, { Allow: 'GET' });
      const config = publicConfig(env, url.origin);
      if (config.liveEnabled) {
        try {
          const { response, result } = await quotaRequest(quotaStub(env), '/health', {}, API_DEADLINES.quotaHealth);
          if (!response.ok || result.ok !== true) throw new Error('QUOTA_UNAVAILABLE');
        } catch {
          config.liveEnabled = false;
          config.turnstileSiteKey = null;
          config.unavailableReason = 'Usage protection is unavailable. Your text stays in the editor. Please try again later.';
        }
      }
      return json(config);
    }
    if (url.pathname !== '/api/analyze') return json({ error: { code: 'NOT_FOUND', message: 'This API route does not exist.', requestId } }, 404);
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for this endpoint.', requestId } }, 405, { Allow: 'POST' });
    const ready = liveReadiness(env, url.origin);
    if (!ready.enabled) throw new ApiError('LIVE_DISABLED', 503, ready.reason!);
    const origin = request.headers.get('Origin');
    if (origin !== url.origin || !allowedOrigins(env).includes(origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      throw new ApiError('ORIGIN_REJECTED', 403, 'Please use live extraction from this application’s own page.');
    }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '')) {
      throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 415, 'Please submit the request as JSON text.');
    }
    if (request.headers.has('Content-Encoding')) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 415, 'Compressed request bodies are not supported.');
    const limits = readLimits(env);
    let raw: unknown;
    try { raw = JSON.parse(await readBoundedText(request, limits.maxBodyBytes, API_DEADLINES.body)); } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('INVALID_INPUT', 400, 'The request could not be read. Please check the text and selections.');
    }
    const parsed = submissionSchema.safeParse(raw);
    if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === 'apiKey')) throw new ApiError('INVALID_API_KEY', 400, 'Connect a valid-format OpenAI API key in Settings before organizing a request.');
    if (!parsed.success || parsed.data.sourceText.length > limits.maxInputChars) throw new ApiError('INVALID_INPUT', 400, 'Please provide up to 8,000 characters and valid request selections.');
    const input = parsed.data;
    requestId = input.requestId.toLowerCase();
    // Cloudflare overwrites this header at its edge. Local live use fails closed without it.
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || ip.length > 64 || !/^[0-9a-f:.]+$/i.test(ip)) throw new ApiError('CLIENT_UNAVAILABLE', 503, 'Usage protection could not identify this connection. Your text has been retained. Please try again later.');
    await verifyTurnstile(input.turnstileToken, env, fetcher);
    const hashes = await clientHashes(ip, env.QUOTA_HASH_SECRET!);
    const stub = quotaStub(env);
    // This successful durable reservation is mandatory before the only paid fetch.
    await reserve(stub, requestId, hashes);
    try {
      const record = await extractWithOpenAI(input, env, limits, fetcher);
      return json({ record, requestId, mode: 'live' });
    } finally {
      // Failure is conservative: the short concurrency lease expires; allowance is never refunded.
      try { await quotaRequest(stub, '/release', { requestId }, API_DEADLINES.quotaRelease); } catch { /* No content or error logging. */ }
    }
  } catch (error) { return errorResponse(error, requestId); }
}
