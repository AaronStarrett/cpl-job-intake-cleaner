# Verification record

## Current implementation and local verification — 2026-09-06

The current source implements a fictional sample workspace when no key is connected and a bring-your-own-key extraction workflow through Settings. The visitor's key stays in tab memory and is sent transiently through the same-origin Worker to OpenAI only when organizing a request. There is no environment-key or shared-key fallback, saved key, or saved job history. Connecting a key checks format only; a successful extraction establishes that key's access for that request.

The complete local `npm run verify` gate passed for this implementation:

- ESLint and TypeScript checks: **PASS**.
- 146 deterministic unit, Worker API/provider, and real workerd/SQLite runtime tests: **PASS**. Provider calls are mocked; these tests do not incur paid AI calls.
- 30 desktop/mobile Playwright tests: **PASS**. Coverage includes sample/live separation, transient key connection, current edits and exports, source invalidation, failure handling, request deduplication, keyboard/reduced-motion behavior, and responsive accessibility checks. Live extraction responses are mocked where used.
- Production Vite/Worker build and public-source scan: **PASS**.

These results establish local implementation and deterministic behavior. They do not establish a paid provider request, extraction quality on unseen real customer data, or deployment of this revision.

## Protection configuration and prepublication snapshot

A Managed Turnstile widget has been configured in Cloudflare for the exact hostname `cpl-job-intake-cleaner.astarrett.workers.dev`. Encrypted `TURNSTILE_SECRET_KEY` and `QUOTA_HASH_SECRET` secrets have been configured through the Cloudflare dashboard. The source configuration now includes the corresponding public site key, expected hostname, origin allowlist, `ENABLE_LIVE_AI=true`, and the explicitly selected `gpt-6-astra` model. Secret values are not stored in this repository.

At this prepublication verification snapshot, the new Git deployment was **NOT YET VERIFIED**. Dashboard configuration and a local passing gate do not prove that the latest source is serving at the public URL. The release handoff must record the successful native build, deployed source revision, and fresh anonymous application/configuration checks after deployment completes.

- Application destination: https://cpl-job-intake-cleaner.astarrett.workers.dev
- Public source: https://github.com/AaronStarrett/cpl-job-intake-cleaner

Native Builds watches main; non-production branch deployment and preview URLs remain disabled. The production policy verifies native build context, branch, source commit, and unchanged tracked files. The full verification sequence runs before Wrangler in the deployment command. The bounded rootless browser setup supports Chromium checks in that environment.

## Paid live-provider verification

**NOT RUN.** No visitor OpenAI API key was supplied for verification, and no paid smoke test has been performed. The extraction adapter, protection configuration, and mocked tests are implemented evidence, not proof of a successful live provider response. The fictional samples and portfolio walkthrough make no provider calls. Visitor API usage, when requested with a valid connected key, belongs to that visitor's OpenAI API account.

## Historical deployment baseline

The earlier example-mode release was verified on 2026-09-06 at source `9d5d3ec8b15ac74e2c9e3b96754940dae404d3f6`, with native Git-triggered Workers Build `66e63a54-1e31-4ba2-8bbb-f38b5f6f7174` succeeding. That baseline passed 132 deterministic tests and 20 desktop/mobile browser tests; its public configuration reported live processing disabled. Those observations describe the earlier release only and do not verify the current bring-your-own-key deployment.
