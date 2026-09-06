export const TURNSTILE_ACTION = 'intake-analyze';
// Verified against official Structured Outputs documentation on 2026-09-05.
// No fallback: a model change requires review and a bounded synthetic live check.
export const SUPPORTED_MODELS = ['gpt-6-astra'] as const;

export interface Env {
  ASSETS?: Fetcher;
  INTAKE_QUOTA?: DurableObjectNamespace;
  ENABLE_LIVE_AI?: string;
  OPENAI_MODEL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  ALLOWED_ORIGINS?: string;
  QUOTA_HASH_SECRET?: string;
  MAX_INPUT_CHARS?: string;
  MAX_BODY_BYTES?: string;
  MAX_OUTPUT_TOKENS?: string;
  REQUEST_TIMEOUT_MS?: string;
  CLIENT_REQUESTS_PER_HOUR?: string;
  GLOBAL_DAILY_REQUEST_CAP?: string;
  MAX_CONCURRENT_REQUESTS?: string;
  PUBLIC_APP_URL?: string;
  PORTFOLIO_URL?: string;
  CONTACT_URL?: string;
}

export interface Limits {
  maxInputChars: number;
  maxBodyBytes: number;
  maxOutputTokens: number;
  timeoutMs: number;
  clientRequestsPerHour: number;
  globalDailyCap: number;
  maxConcurrent: number;
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error('INVALID_CONFIG');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('INVALID_CONFIG');
  return n;
}

export function readLimits(env: Env): Limits {
  return {
    maxInputChars: integer(env.MAX_INPUT_CHARS, 8_000, 100, 8_000),
    maxBodyBytes: integer(env.MAX_BODY_BYTES, 40_000, 1_024, 40_000),
    maxOutputTokens: integer(env.MAX_OUTPUT_TOKENS, 6_000, 1_000, 6_000),
    timeoutMs: integer(env.REQUEST_TIMEOUT_MS, 25_000, 1_000, 25_000),
    clientRequestsPerHour: integer(env.CLIENT_REQUESTS_PER_HOUR, 5, 1, 10),
    globalDailyCap: integer(env.GLOBAL_DAILY_REQUEST_CAP, 50, 1, 100),
    maxConcurrent: integer(env.MAX_CONCURRENT_REQUESTS, 2, 1, 3),
  };
}

export function safePublicUrl(value: string | undefined, fallback = ''): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (!['https:', 'mailto:'].includes(url.protocol) || url.username || url.password) return fallback;
    return url.href;
  } catch { return fallback; }
}

export function allowedOrigins(env: Env): string[] {
  if (!env.ALLOWED_ORIGINS) return [];
  return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter((s) => {
    try { const u = new URL(s); return u.protocol === 'https:' && u.origin === s; } catch { return false; }
  });
}

export function liveReadiness(env: Env, origin: string): { enabled: boolean; reason: string | null } {
  const unavailable = (reason: string) => ({ enabled: false, reason });
  if (env.ENABLE_LIVE_AI !== 'true') return unavailable('Request processing is not available yet. You can enter your message, but it cannot be organized until the service is configured.');
  try { readLimits(env); } catch { return unavailable('Request processing is temporarily unavailable. Your text stays in the editor. Please try again later.'); }
  if (!SUPPORTED_MODELS.includes(env.OPENAI_MODEL as typeof SUPPORTED_MODELS[number])) {
    return unavailable('Request processing is awaiting its approved provider configuration. Your text stays in the editor.');
  }
  const hostname = new URL(origin).hostname;
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY || env.TURNSTILE_EXPECTED_HOSTNAME !== hostname || !allowedOrigins(env).includes(origin) || !env.QUOTA_HASH_SECRET || env.QUOTA_HASH_SECRET.length < 32 || !env.INTAKE_QUOTA) {
    return unavailable('Request processing is unavailable because its protection is not configured for this address. Your text stays in the editor.');
  }
  return { enabled: true, reason: null };
}

export function publicConfig(env: Env, origin: string) {
  const ready = liveReadiness(env, origin);
  let maxInputChars = 8_000;
  try { maxInputChars = readLimits(env).maxInputChars; } catch { /* Keep the editor usable while processing fails closed. */ }
  return {
    keyMode: 'bring-your-own' as const,
    liveEnabled: ready.enabled,
    unavailableReason: ready.reason,
    turnstileSiteKey: ready.enabled ? env.TURNSTILE_SITE_KEY : null,
    turnstileAction: TURNSTILE_ACTION,
    maxInputChars,
    publicAppUrl: safePublicUrl(env.PUBLIC_APP_URL),
    portfolioUrl: safePublicUrl(env.PORTFOLIO_URL, 'https://cpl-portfolio.pages.dev/'),
    contactUrl: safePublicUrl(env.CONTACT_URL),
  };
}
