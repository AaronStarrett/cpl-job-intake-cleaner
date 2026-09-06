# Architecture

The browser loads static React assets and safe configuration from the same Worker. Disconnected sessions start with explicitly fictional prefilled samples. Settings accepts a visitor-provided OpenAI key in a password field, explains the data flow/API charges, and connects it only for this tab. Connection clears sample source/results and starts an empty real workspace. Syntax validation makes no provider call. The key, source, original extraction, corrected card, draft and acknowledgment stay in memory. Disconnect/reload clears the key; New request clears work with discard protection. The independent portfolio story adapts the electrical scenario into a scripted, clearly fictional walkthrough without calling this Worker or OpenAI.

A live submission passes through origin/content type/body limits and typed metadata validation, Turnstile siteverify (hostname and action), and authoritative quota reservation before one OpenAI Responses request. The provider receives untrusted source data with fixed extraction instructions, a strict JSON schema, bounded output/duration and `store: false`; it receives no tools. The server independently checks schema and literal evidence, then returns a non-cacheable draft. There is no fallback that pretends canned output analyzed arbitrary text.

The live POST carries the visitor key separately from source text. After validation and protection checks, the Worker uses that request's key for OpenAI authorization; it is never passed into prompt content, quota metadata, response bodies or logs. There is no server provider-key fallback. An unavailable protection configuration prevents submission. Enabling configuration is not live verification: two separately authorized novel synthetic requests must reach the actual provider and show changed output matching changed input before claiming live-tested. The owner requested all implementation except supplying the key, so current paid smoke status remains NOT RUN.

A singleton `IntakeQuota` SQLite Durable Object stores expiring reservation IDs, keyed daily-rotating client hashes, request timestamps/counters and concurrency leases. All reservations use one authoritative transaction. No raw IP, source text, model result or follow-up is persisted. Reserved attempts are charged conservatively even when the provider fails; completion releases the concurrency lease without refunding the daily allowance. Dedup prevents replay of an ID from producing another paid call during its TTL. Output is never shared or cached between visitors.

Pure modules in `src/shared` own schema/evidence validation, completeness/conflict rules, follow-ups, exports and editing state. The UI recalculates after edits. The provider cannot mark output human-entered or reviewed. Relative timing remains original wording; unsupported exact dates are unresolved. Distinct jobs/properties produce a split-and-review warning.

The default four required checks are name, usable phone OR email, service-address specificity and useful work description. Address syntax is a documented intake heuristic, not geocoding or verification. Optional timing/trade questions do not become required gates. Unresolved conflicts prevent an all-clear state, and sufficient information still requires human review.

Cloudflare Vite builds both the Worker and static assets. `run_worker_first: true` applies API handling and headers before the SPA fallback. Unknown `/api/*` routes are JSON errors. Content responses are `no-store`; Workers observability is off in the checked-in configuration. Infrastructure/provider operational retention can still apply.

## Official references reviewed

- [Cloudflare Vite integration](https://developers.cloudflare.com/workers/vite-plugin/)
- [React SPA with a Worker API](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
