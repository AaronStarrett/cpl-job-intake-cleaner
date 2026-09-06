# Deployment

The portfolio demonstrates; the application performs. Keep the existing public origin https://cpl-job-intake-cleaner.astarrett.workers.dev, Worker name, GitHub repository and native Git connection. See VERIFICATION.md for actual commits, builds, protection readiness and live-provider evidence.

## Runtime and release gates

Use Node24.19.0 and the committed npm lockfile. Cloudflare Vite1.54.4 and Wrangler4.129.0 package Miniflare5.20260903.0-alpha with workerd1.20260903.1; the test harness pins that same runtime. Preserve the SQLite Durable Object binding INTAKE_QUOTA, exported class IntakeQuota and migration v1. No new database, domain or plan is needed.

Native Workers Builds uses AaronStarrett/cpl-job-intake-cleaner, main, root /, NODE_VERSION=24.19.0 and CPL_DEPLOY_TARGET=production:
- Build: `node scripts/builds-policy.mjs`
- Deploy: `node scripts/cloudflare-build.mjs`
- Non-production branch deployment remains disabled; previews receive no production protection secrets.

The policy validates native context, main branch, matching checked-out commit and clean tracked files. The existing bounded rootless Chromium setup uses authenticated build-local Ubuntu package indexes and reviewed library mappings, then runs the complete lint/type/unit/SQLite/build/browser/public-source gate before Wrangler. Do not bypass failures, hooks or browser checks. Do not add another GitHub Actions workflow.

Local release uses `npm ci`, `npx playwright install chromium`, and `npm run deploy`. The pre-commit hook checks lint/types/tests/staged scan; pre-push runs full verify. Native Builds rejects E2E_BASE_URL so the gate tests its current local build. Separate anonymous browser verification can target the deployed origin using E2E_BASE_URL.

## Visitor key and protection setup

Disconnected sessions show clearly fictional prefilled samples. Settings connects a visitor key for the current tab and clears sample work before real input. Connection validates syntax without a paid call; account/model access is tested by actual extraction. No CPL provider key or fallback is used.

1. Keep the reviewed model gpt-6-astra explicit in OPENAI_MODEL. Do not silently substitute a model. Visitors need API project access and a suitable allowance; a coding subscription does not supply API credits.
2. Configure a managed Turnstile widget for cpl-job-intake-cleaner.astarrett.workers.dev without pre-clearance. The app supplies action intake-analyze. Commit the public TURNSTILE_SITE_KEY, exact TURNSTILE_EXPECTED_HOSTNAME and ALLOWED_ORIGINS=https://cpl-job-intake-cleaner.astarrett.workers.dev so Git deployment preserves them.
3. Set TURNSTILE_SECRET_KEY and a random QUOTA_HASH_SECRET of at least 32 characters through encrypted Worker runtime secrets or wrangler secret put. Never publish the values. Build tokens and runtime secrets are separate. Do not set a shared OPENAI_API_KEY; each request supplies the visitor's key separately from prompt content. It never enters quota metadata, storage, logs or returned records.
4. Confirm INTAKE_QUOTA / IntakeQuota and limits: 5/client/hour, 50 reserved attempts/day, 2 concurrent, 8,000 input characters, 40,000 body bytes including credential, 6,000 output tokens, 25 seconds. Failed reserved provider calls consume allowance; existing hard upper bounds remain enforced.
5. ENABLE_LIVE_AI=true enables the protected visitor-key path. /api/config reports safeguards readiness, not key validity or live-provider verification. Missing safeguards fail closed.

## Separate live verification

The owner requested all implementation except supplying the OpenAI key. No key or paid execution is inferred. Actual provider smoke is NOT RUN until a key owner authorizes two bounded synthetic requests. A mock response, connection form, healthy quota object or Turnstile alone is not live verification.

Enter the authorized key privately in app Settings. Submit a novel fictional request absent from the fixture list; check actual generated evidence, edits, follow-up and exports. Submit a second request with different contact/work/timing and verify corresponding output changes. Check limits without exposing keys or raw provider errors. Disconnect afterward. Screenshots use only synthetic job content and never keys. Record failures honestly; never replace them with samples or claim success.

## Public verification and rollback

Check anonymous root, assets, deep-link refresh, config/no-store, unknown API JSON404, fictional samples without paid calls, Settings/key clearing, edits/drafts/exports/New request, desktop/mobile/keyboard/reduced motion, and Help. Deterministic browser tests use nonfunctional synthetic keys and mocked provider results. Record the real Git-triggered branch/commit/build/deployment separately from app behavior. Verify the portfolio's distinct Watch walkthrough and Open Job Intake Cleaner links after its Pages build succeeds.

Rollback through the existing Worker version history; disable the live path if safeguards are uncertain. Code rollback does not erase Durable Object migrations. Revert portfolio changes through normal commits and its existing Pages pipeline, never force-push or migrate hosting.

Request caps bound API exposure but do not guarantee hosting or provider charges. No plan upgrades or credit purchases without authorization.
