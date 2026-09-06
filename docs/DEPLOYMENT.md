# Deployment

## Current evidence

See `VERIFICATION.md` for the actual repository, running address, commit, successful checks and whether native Git deployment was observed. A local upload alone never proves auto-deployment.

## Runtime and build

Node24.19.0 and the committed npm lockfile are required. Current stable Cloudflare Vite1.54.4 and Wrangler4.129.0 both package Miniflare5.20260903.0-alpha internally with workerd1.20260903.1. The test harness pins that same engine to avoid mismatched local/deploy runtimes. This internal version label is a Cloudflare dependency choice; the application's public Vite integration and Wrangler releases are stable. Tests run the actual Workers runtime, including SQLite Durable Object concurrency.

The single Worker name must be `cpl-job-intake-cleaner`. Wrangler defines `INTAKE_QUOTA`, exported class `IntakeQuota`, and migration `v1` with `new_sqlite_classes`. No D1, R2, paid database, VPS or account-plan change is needed. Assets pass through the Worker before SPA fallback so `/api/*` always receives JSON API handling and security headers.

## Native Cloudflare Workers Builds

Use the account's existing GitHub connection and the public `AaronStarrett/cpl-job-intake-cleaner` repository. Production branch: `main`. Root: `/`. Node version: `24.19.0`.

- Build command: `npx playwright install --with-deps chromium`
- Deploy command: `npm run deploy:builds`
- Non-production branches: disable auto-deployment initially. If separately enabled, use sample-only configuration and never inject production secrets into untrusted pull-request builds.

Set the production build variable `CPL_DEPLOY_TARGET=production`. The deploy script verifies that native Workers Builds reports `WORKERS_CI=1`, branch `main`, and a commit matching clean checked-out source. These commands are sequential stages of the same native build. A failed typecheck, lint, unit/SQLite test, production build, Playwright test or source scan fails the build, preventing the deploy stage. Do not configure separately running tests as the only deployment gate. Set no GitHub Actions workflow for this project. No billable GitHub Actions are added.

Local release: `npm ci`, `npx playwright install chromium`, then `npm run deploy`. The script gates Wrangler behind full verification. `npm run deploy:builds` is an alternate single-command validation-and-deploy gate after Chromium installation.

## Initial example deployment

Leave `ENABLE_LIVE_AI=false` and all secret values absent. Use the dashboard-reported workers.dev origin, verify anonymously before recording it, then set `PUBLIC_APP_URL` to that verified address. Existing portfolio and contact URLs are public-safe variables. Never put a speculative URL in the portfolio registry.

## Optional live enablement, separately approved

1. Obtain explicit cost authorization and a dedicated provider key. Never harvest keys from unrelated applications.
2. Review the server model allowlist. The initial allowlist contains `gpt-6-astra`, verified in the current official OpenAI Structured Outputs documentation. There is deliberately no default model and no silent fallback. Model availability for this account is unverified until a bounded synthetic call succeeds.
3. Configure a Turnstile widget for the exact production hostname and action `intake-analyze`. Add its public key, exact hostname and exact HTTPS origin to the nonsecret configuration.
4. Set `OPENAI_API_KEY`, `TURNSTILE_SECRET_KEY`, and a random `QUOTA_HASH_SECRET` of at least32 characters using `wrangler secret put` or the Worker's encrypted secrets UI. Never put them in Wrangler vars, VITE variables, the browser, screenshots, source or build logs. Build-time credentials and Worker runtime secrets are separate.
5. Confirm the SQLite binding and the configured limits. Defaults: 5/client/hour, 50 reserved requests/day, 2 concurrent, 8000 input characters, 40000 HTTP body bytes, 6000 output tokens, 25seconds. Failed reserved provider calls consume allowance. Changes to these upper bounds require code review.
6. Set `OPENAI_MODEL` explicitly and `ENABLE_LIVE_AI=true`, run exactly one authorized synthetic smoke through real Turnstile and the browser, verify newly generated output, no secret exposure and quota accounting. If anything fails, return the flag to false. Do not claim live-verified from mocked tests.

## Verification and rollback

Check anonymous `/`, assets, a direct SPA path and refresh, `/api/config`, unknown `/api/*`404JSON, all six examples, edits/checks/drafts/downloads/reset, phone/mobile and back-to-portfolio navigation. Confirm no account wall. Record a real Git-triggered build's branch, commit, build result and deployment. Then verify the portfolio's external link in both directions after its separate Pages pipeline succeeds.

Rollback through Cloudflare Workers deployment/version history to the last verified version, with live AI disabled if safeguards are uncertain. Durable Object migration changes need separate review: rolling back code does not erase SQLite migration history. Rollback the portfolio independently with a normal revert commit through its existing Pages pipeline; do not force-push or migrate hosting.

Provider input/output tokens, Worker requests/CPU, Durable Object operations/storage, Turnstile availability and build minutes are cost/availability drivers. Request caps limit paid-model exposure, not the entire hosting bill. Do not upgrade plans or purchase credits without authorization.
