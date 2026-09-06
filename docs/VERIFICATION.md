# Verification record

## Verified public release — 2026-09-06

- Application: https://cpl-job-intake-cleaner.astarrett.workers.dev
- Public repository: https://github.com/AaronStarrett/cpl-job-intake-cleaner — visibility PUBLIC, production branch main.
- First successfully deployed source: `9d5d3ec8b15ac74e2c9e3b96754940dae404d3f6`.
- Native Git-triggered Workers Build: `66e63a54-1e31-4ba2-8bbb-f38b5f6f7174`, completed successfully. GitHub's matching Workers Builds check also reports success.
- Initial Worker version: `7026b2a7-1058-400a-a50d-03e07f05fdf4`.
- Mode: example mode. No visitor account, provider credential, or paid AI call required.

## Checks actually executed

- Clean `npm ci` using Node24.19.0 and the lockfile passed, with zero reported dependency vulnerabilities at installation time.
- ESLint, TypeScript and production Vite/Worker build passed locally and within the successful native deployment gate.
- 132/132 deterministic tests passed locally and in Cloudflare: 86 domain tests, 41 API/provider tests and five real workerd/SQLite tests. These cover evidence/schema validation, unsupported provider output, relative dates, conflicts, contacts, follow-ups, edits, review/fixture invalidation, CSV injection, quota concurrency/duplicates, protection failures and bounded deadlines. Provider calls are mocked.
- 20/20 desktop/mobile Playwright tests passed locally and in Cloudflare before Wrangler deployment. They cover the sample-to-export/reset path, all six examples without AI requests, hostile text, draft overwrite protection, keyboard/reduced motion, responsive layout, automated accessibility checks, deep refresh, API JSON routing, memory isolation, print, clipboard and mocked uncertain-submission retry identity.
- The same 20/20 tests passed against the actual workers.dev deployment in fresh anonymous browser contexts. The retry-identity test deliberately mocks provider/protection responses; it is not live-provider evidence.
- Anonymous `/api/config` returned 200 JSON with `liveEnabled:false`, no secret values and `Cache-Control: no-store, max-age=0, private`. Unknown API routes return 404 JSON; the browser suite also verified assets, direct SPA routes, security headers and real example exports.
- An actual public-app screenshot was captured using the fictional electrical fixture. Public portfolio and contact destinations resolve to the existing CPL Pages site.
- Staged/current/history public-source scans and human file review passed before publication. No real customer records, credentials or unrelated private source were included.

## Deployment gate and limits

Native Builds watches main; non-production branch deployment and preview URLs are disabled. The production policy verifies native build context, branch, source commit and unchanged tracked files. The complete verification sequence runs before Wrangler in the same deployment command. The build token was created after explicit owner approval of its displayed scope. No account upgrade, new domain, DNS change or GitHub Actions workflow was introduced.

Initial failed builds exposed missing Chromium OS dependencies and package indexes. They stopped before deployment. A bounded rootless browser setup resolved those environment requirements; the successful Git-triggered release above establishes actual execution of the gate.

## Live AI status

Implemented but **not live-verified**. `ENABLE_LIVE_AI=false`. No dedicated provider key, Turnstile setup or live budget is supplied. No paid smoke test has been run. All six prepared examples operate without AI calls. Production live enablement requires the separately approved prerequisites documented in DEPLOYMENT.md. Automated checks do not establish live AI quality, customer adoption, business results or owner acceptance.
