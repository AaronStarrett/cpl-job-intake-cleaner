import { DurableObject } from 'cloudflare:workers';
import { type Env, readLimits } from './config';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A single SQLite object for all regions. It never receives a message or job record. */
export class IntakeQuota extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        request_id TEXT PRIMARY KEY, client_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL, lease_until INTEGER NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reservations_client ON reservations(client_hash, created_at);
      CREATE INDEX IF NOT EXISTS reservations_expiry ON reservations(expires_at);
      CREATE TABLE IF NOT EXISTS daily_totals (day TEXT PRIMARY KEY, used INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/reserve', '/release', '/health'].includes(path)) return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    if (path === '/health') {
      this.ctx.storage.sql.exec('SELECT 1');
      return Response.json({ ok: true });
    }
    const body = await request.json() as { requestId?: unknown; clientHashes?: unknown };
    if (typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 });
    if (path === '/release') {
      // Keep the request id and quota charge, releasing only the concurrency lease.
      this.ctx.storage.sql.exec('UPDATE reservations SET lease_until = 0 WHERE request_id = ?', body.requestId);
      return Response.json({ ok: true });
    }
    if (!Array.isArray(body.clientHashes) || body.clientHashes.length !== 2 || !body.clientHashes.every((h) => typeof h === 'string' && HASH_PATTERN.test(h))) {
      return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 });
    }
    const requestId = body.requestId;
    const hashes = body.clientHashes as string[];
    const limits = readLimits(this.env);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const dayEnd = Date.parse(`${day}T00:00:00Z`) + DAY;
    const result = this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      sql.exec('DELETE FROM reservations WHERE expires_at <= ?', now);
      sql.exec('DELETE FROM daily_totals WHERE expires_at <= ?', now);
      if (sql.exec('SELECT request_id FROM reservations WHERE request_id = ?', requestId).toArray().length) return { status: 409, code: 'DUPLICATE_REQUEST', retryAfter: 0 };
      const daily = sql.exec<{ used: number }>('SELECT used FROM daily_totals WHERE day = ?', day).toArray()[0]?.used ?? 0;
      if (daily >= limits.globalDailyCap) return { status: 429, code: 'DAILY_LIMIT', retryAfter: Math.ceil((dayEnd - now) / 1000) };
      const client = sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM reservations WHERE client_hash IN (?, ?) AND created_at > ?', hashes[0], hashes[1], now - HOUR).one().count;
      if (client >= limits.clientRequestsPerHour) return { status: 429, code: 'CLIENT_LIMIT', retryAfter: 3600 };
      const active = sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM reservations WHERE lease_until > ?', now).one().count;
      if (active >= limits.maxConcurrent) return { status: 429, code: 'BUSY', retryAfter: 30 };
      sql.exec('INSERT INTO reservations (request_id, client_hash, created_at, lease_until, expires_at) VALUES (?, ?, ?, ?, ?)', requestId, hashes[0], now, now + limits.timeoutMs + 5_000, now + DAY);
      sql.exec('INSERT INTO daily_totals (day, used, expires_at) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET used = used + 1', day, dayEnd + DAY);
      return { status: 200, code: 'RESERVED', retryAfter: 0 };
    });
    // Alarm cleanup limits active metadata retention even if no later visitor arrives.
    if (result.status === 200 && await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(now + HOUR);
    return Response.json(result, { status: result.status });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM reservations WHERE expires_at <= ?', now);
      this.ctx.storage.sql.exec('DELETE FROM daily_totals WHERE expires_at <= ?', now);
    });
    const remaining = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM reservations').one().count + this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM daily_totals').one().count;
    if (remaining > 0) await this.ctx.storage.setAlarm(now + HOUR);
  }
}
