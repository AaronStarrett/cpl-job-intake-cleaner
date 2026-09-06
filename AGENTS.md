# CPL application engineering rules

This repository is the standalone Job Intake Cleaner application. Preserve the separate CPL portfolio's Cloudflare Pages hosting. Never enter or modify unrelated CPL/BEA repositories or publish private source, customer data, internal research, keys, tokens or local credentials.

## Deployment standard

The application is a public portfolio demonstration with public source. Visitors need no account. Use a Cloudflare Worker with static assets and same-origin API, a workers.dev origin, server-side secrets, safe fictional examples, and a native Git-connected Workers Builds pipeline. Do not buy domains, change DNS, upgrade plans, enable new billable workflows or live paid processing without explicit authorization. Examples remain functional if live AI is disabled or fails closed. Preview builds are sample-only and receive no production paid secrets.

## Scope and truthfulness

One pasted text at a time. No uploads, inbox/CRM integrations, sending, booking, dispatch, customer history, accounts, bulk intake, diagnosis or pricing. Preserve the distinction between prepared examples and real extraction. Never use old fixture results after source edits. Never represent classifications, completeness checks or acknowledgment as confidence, verification, signing or approval of the work.

## Required gates

Run `npm run lint`, `npm run typecheck`, `npm test`, `node scripts/security-check.mjs --staged`, and `git diff --cached --check` before committing. The pre-commit hook enforces these. Run the full `npm run verify` before a push/release; pre-push enforces it. Deploy with `npm run deploy` or the documented native Builds gate; never publish after a failing validation or bypass hooks to make a release. Review all staged files and history for public safety before the initial push. Use the lockfile and Node24.19.0.

All ordinary tests must be deterministic and incur no provider charges. Test workerd/SQLite concurrency, hostile inputs, API failures, evidence/date/conflict rules, CSV injection, review/source invalidation, real UI edits and exports, mobile, keyboard, and deep links. Live smoke tests require separately approved, synthetic, bounded execution and must be labeled live-verified only after success.

No raw messages or records in storage, URLs, logs or analytics. No browser keys, VITE secrets, raw-IP quota storage or additional provider retries. Reserve authoritative allowance before paid calls. Fail closed on missing safeguards, timeouts and quota failure. Display human-review limits and preserve original extraction separately from corrections.

Portfolio integration happens only after anonymous deployment and repository visibility are verified. Re-read its latest maintenance guide/schema, make one focused entry using the validator, add an actual fictional screenshot, and use its existing Pages pipeline. Never publish placeholder URLs.
