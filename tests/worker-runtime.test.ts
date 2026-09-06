import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';

let script: string;
const runtimes: Miniflare[] = [];
beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `export { IntakeQuota } from './src/worker/quota';
        export default { fetch(request, env) {
          return env.INTAKE_QUOTA.get(env.INTAKE_QUOTA.idFromName('global-intake-quota-v1')).fetch(request);
        } };`,
      resolveDir: path.resolve('.'), sourcefile: 'quota-runtime-harness.ts', loader: 'ts',
    },
    bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:workers'], target: 'es2022',
  });
  script = bundle.outputFiles[0].text;
}, 30_000);
afterAll(async () => { await Promise.all(runtimes.map((mf) => mf.dispose())); }, 30_000);

function runtime(bindings: Record<string, string> = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script, compatibilityDate: '2026-09-05',
    durableObjects: { INTAKE_QUOTA: { className: 'IntakeQuota', useSQLite: true } },
    bindings: { GLOBAL_DAILY_REQUEST_CAP: '3', CLIENT_REQUESTS_PER_HOUR: '10', MAX_CONCURRENT_REQUESTS: '3', ...bindings },
  }));
  runtimes.push(mf); return mf;
}
function reserve(mf: Miniflare, id = crypto.randomUUID(), client = 'a') {
  return mf.dispatchFetch('https://quota.internal/reserve', { method: 'POST', body: JSON.stringify({ requestId: id, clientHashes: [client.repeat(64), 'f'.repeat(64)] }) });
}
function release(mf: Miniflare, id: string) {
  return mf.dispatchFetch('https://quota.internal/release', { method: 'POST', body: JSON.stringify({ requestId: id }) });
}

describe('actual Workers runtime and SQLite authoritative allowance', () => {
  it('atomically admits only the global cap under concurrent requests', async () => {
    const mf = runtime();
    const responses = await Promise.all(Array.from({ length: 18 }, () => reserve(mf)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(3);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(15);
    const blocked = await responses.find((response) => response.status === 429)!.json();
    expect(blocked).toMatchObject({ code: 'DAILY_LIMIT' });
  }, 30_000);
  it('deduplicates an overlapping request ID before a second reservation', async () => {
    const mf = runtime(); const id = crypto.randomUUID();
    const responses = await Promise.all(Array.from({ length: 8 }, () => reserve(mf, id)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(7);
    await release(mf, id);
    const duplicate = await reserve(mf, id);
    expect(duplicate.status).toBe(409);
  }, 30_000);
  it('bounds simultaneous leases and releases them without refunding daily usage', async () => {
    const mf = runtime({ MAX_CONCURRENT_REQUESTS: '1', GLOBAL_DAILY_REQUEST_CAP: '2' });
    const first = crypto.randomUUID(); const second = crypto.randomUUID();
    expect((await reserve(mf, first)).status).toBe(200);
    expect(await (await reserve(mf, second)).json()).toMatchObject({ code: 'BUSY' });
    await release(mf, first);
    expect((await reserve(mf, second)).status).toBe(200);
    await release(mf, second);
    expect(await (await reserve(mf)).json()).toMatchObject({ code: 'DAILY_LIMIT' });
  }, 30_000);
  it('enforces a rolling per-client allowance while another client remains independent', async () => {
    const mf = runtime({ CLIENT_REQUESTS_PER_HOUR: '1' });
    const id = crypto.randomUUID(); expect((await reserve(mf, id, 'a')).status).toBe(200); await release(mf, id);
    expect(await (await reserve(mf, crypto.randomUUID(), 'a')).json()).toMatchObject({ code: 'CLIENT_LIMIT' });
    expect((await reserve(mf, crypto.randomUUID(), 'b')).status).toBe(200);
  }, 30_000);
  it('rejects malformed metadata instead of storing raw client details', async () => {
    const mf = runtime();
    const response = await mf.dispatchFetch('https://quota.internal/reserve', { method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), clientHashes: ['192.0.2.10', 'source content'] }) });
    expect(response.status).toBe(400);
    const health = await mf.dispatchFetch('https://quota.internal/health', { method: 'POST' });
    expect(health.status).toBe(200);
  }, 30_000);
});
