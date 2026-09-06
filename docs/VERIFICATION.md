# Verification record

## Pre-publication local verification (2026-09-06)

- Separate application checkout initialized on `main`; no unrelated repository modified.
- Required Node24.19.0 used. Clean `npm ci` from lockfile passed, with zero reported dependency vulnerabilities at install time.
- Domain tests: 86/86 passed (schema, evidence, dates, contacts, conflicts, follow-ups, corrections, fixture invalidation and exports).
- Worker tests: 46/46 passed, including actual workerd SQLite concurrency and duplicate reservations, server input/protection failures, provider refusal/truncation/malformed output, and body/quota/provider deadlines. Provider calls in tests are synthetic mocks.
- ESLint and TypeScript checks passed. Full release hooks additionally rerun the required checks before publication.
- Desktop/mobile browser tests cover sample/edit/checklist/follow-up/download/reset, all fixtures without AI calls, hostile source text, keyboard, reduced motion, contrast, deep routes, API JSON errors, separate visitor state, printing and clipboard outputs. Final release results are recorded after the push gate.
- Public-source scanner passed; explicit staged-file and history review required before the initial push.

## Publication status at this commit

Public repository creation, Cloudflare upload, native Git-triggered build and portfolio integration have not yet been verified. The publication record will be updated only from actual results.

## Live AI status

Implemented but **not live-verified**. `ENABLE_LIVE_AI=false`. No dedicated provider key, Turnstile setup or live budget is supplied. No paid smoke test has been run. All six prepared examples operate without AI calls. Production live enablement requires the separately approved prerequisites documented in DEPLOYMENT.md.
