import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { randomBytes } from 'node:crypto';

export default defineConfig(({ command }) => {
  // Vite adds this nonce to its React preamble and injected development styles.
  // It is absent from production builds; the Worker uses it only in DEV mode.
  const devNonce = command === 'serve' ? Array.from(randomBytes(16), byte => byte.toString(16).padStart(2, '0')).join('') : '';
  return {
    plugins: [react(), cloudflare()],
    html: devNonce ? { cspNonce: devNonce } : undefined,
    define: { 'import.meta.env.CPL_DEV_CSP_NONCE': JSON.stringify(devNonce) },
  };
});
