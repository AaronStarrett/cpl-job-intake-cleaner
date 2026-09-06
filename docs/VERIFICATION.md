# Verification record

## Pre-publication local verification (2026-09-06)

- Separate application checkout initialized on `main`; no unrelated repository modified.
- Required Node24.19.0 used. Clean `npm ci` from lockfile passed, with zero reported dependency vulnerabilities at install time.
- Domain tests: 86/86 passed (schema, evidence, dates, contacts, conflicts, follow-ups, corrections, fixture invalidation and exports).
- Worker tests: 46/46 passed, including actual workerd SQLite concurrency and duplicate reservations, server input/protection failures, provider refusal/truncation/malformed output, and body/quota/provider deadlines. Provider calls in tests are synthetic mocks.
- ESLint and TypeScript checks passed. Full release hooks additionally rerun the required checks before publication.
- Desktop/mobile browser tests: 20/20 passed in the initial push gate. They cover sample/edit/checklist/follow-up/download/reset, all fixtures without AI calls, hostile source text, keyboard, reduced motion, accessibility, deep routes, API JSON errors, separate visitor state, printing, clipboard outputs and mocked uncertain-request retry identity.
- Public-source scanner and explicit staged-file/history review passed before the initial push.

## Publication status at this commit

Public repository verified: https://github.com/AaronStarrett/cpl-job-intake-cleaner (PUBLIC, main). Initial source commit: `da6e711206e65aeea41ba7cfb65149ca22e7c96c`.

Native Workers Builds is connected to main. Its initial setup builds stopped before deployment: the privileged browser dependency installer was unavailable; the next attempt passed all 132 unit/Worker tests and the production build, then could not launch Chromium because the build image lacked an accessibility library. The browser dependency wrapper now prepares missing libraries inside the build workspace without root. A successful deployment and actual Git-triggered build remain to be recorded from their results. Portfolio publication awaits verified anonymous app access.

## Live AI status

Implemented but **not live-verified**. `ENABLE_LIVE_AI=false`. No dedicated provider key, Turnstile setup or live budget is supplied. No paid smoke test has been run. All six prepared examples operate without AI calls. Production live enablement requires the separately approved prerequisites documented in DEPLOYMENT.md.
