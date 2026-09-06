# CPL application engineering rules

This repository is the standalone Job Intake Cleaner application. Preserve the separate CPL portfolio's Cloudflare Pages hosting. Never enter or modify unrelated CPL/BEA repositories or publish private source, customer data, internal research, keys, tokens or local credentials.

## Deployment standard

Permanent CPL standard: the portfolio demonstrates; the application performs. Public GitHub source leads to a standalone Cloudflare-hosted product, with a separate fictional walkthrough and product link in the portfolio. The owner's latest approved connection model is visitor-provided OpenAI keys: without a key, show clearly fictional prefilled samples and prepared results; connecting a key in Settings starts an empty real intake workspace. This replaces the earlier no-visitor-key and empty-disconnected-root requirements. Never use a prepared-response fallback after a live error or silently mix sample data into real work.

Use a Cloudflare Worker with static assets and same-origin API, a workers.dev origin, encrypted protection secrets, and the existing native Git-connected Workers Builds pipeline. The visitor's API key stays only in tab memory and the transient HTTPS request path; the Worker forwards it only to OpenAI. Never persist it, log it, include it in URLs/exports, or use a CPL/other project's key as a fallback. Connecting checks syntax only; show verification only after successful extraction. Explain the data path and charges to the visitor's API account before connection. Disconnect/reload clears the key. Do not buy domains, change DNS, upgrade plans or purchase credits. Preview builds receive no production protection secrets. Missing safeguards fail closed. A configured endpoint or mocked response is not live verification; publish exact implemented/deployed/live-tested status. The owner requested all implementation except supplying an OpenAI key, so paid smoke remains NOT RUN until separately authorized with a key.

## Scope and truthfulness

One pasted text at a time. No uploads, inbox/CRM integrations, sending, booking, dispatch, customer history, accounts, bulk intake, diagnosis or pricing. Users may process ordinary job text they are authorized to use; discourage unnecessary sensitive details and explain external AI processing. Never use old results after source edits. Record edits invalidate review; preserve manual follow-up wording until explicit regeneration or confirmed New request. Never represent classifications, completeness checks or acknowledgment as confidence, verification, signing or approval of the work.

## Required gates

Run `npm run lint`, `npm run typecheck`, `npm test`, `node scripts/security-check.mjs --staged`, and `git diff --cached --check` before committing. The pre-commit hook enforces these. Run the full `npm run verify` before a push/release; pre-push enforces it. Deploy with `npm run deploy` or the documented native Builds gate; never publish after a failing validation or bypass hooks to make a release. Review all staged files and history for public safety before the initial push. Use the lockfile and Node24.19.0.

All ordinary tests must be deterministic and incur no provider charges. Test workerd/SQLite concurrency, hostile inputs, API failures, evidence/date/conflict rules, CSV injection, review/source invalidation, real UI edits and exports, mobile, keyboard, and deep links. Live smoke tests require separately approved, synthetic, bounded execution and must be labeled live-verified only after success.

No raw messages, records or API keys in storage, URLs, logs or analytics. No bundled/VITE secrets, persistent browser keys, raw-IP quota storage or additional provider retries. Reserve authoritative allowance before paid calls. Fail closed on missing safeguards, timeouts and quota failure. Display human-review limits and preserve original extraction separately from corrections.

Portfolio integration uses the existing job-intake-cleaner entry after anonymous origin/repository visibility checks. Re-read its latest maintenance guide/schema and shared actions, preserve concurrent unrelated work, add the specific fictional walkthrough and a cleared screenshot, and use its existing Pages pipeline. The card and detail page offer separate Watch walkthrough and Open Job Intake Cleaner destinations; code is secondary. No paid calls during walkthrough playback. Never publish placeholder URLs or a ready claim before live verification. Do not modify Job Report Builder.
