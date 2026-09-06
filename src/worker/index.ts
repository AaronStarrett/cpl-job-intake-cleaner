import { handleApi } from './api';
import type { Env } from './config';
import { secure } from './http';
export { IntakeQuota } from './quota';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/')) return handleApi(request, env);
    if (!env.ASSETS) return secure(new Response('Application assets unavailable.', { status: 503 }));
    return secure(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
