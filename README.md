# Job Intake Cleaner · Cyber Pirate Labs

Turn messy messages into organized job requests. A standalone React/TypeScript app served with its same-origin API by one Cloudflare Worker.

## Product and walkthrough

The portfolio demonstrates; the application performs. Without a connected key, explore clearly fictional prefilled samples and prepared results. Connect your own OpenAI API key in **Settings** to start an empty real workspace: paste an authorized customer message or phone notes, choose **Organize request**, review and correct the evidence-backed card, prepare a follow-up, and export copy, CSV, JSON or print. No visitor account or walkthrough is required. New request confirms before discarding work. Source edits invalidate extraction; card edits invalidate review; manually edited follow-up wording remains protected.

The real OpenAI Responses adapter, strict schema/evidence checks, Turnstile verification and authoritative SQLite Durable Object quotas are implemented. Keys stay only in tab memory and the transient HTTPS path through the CPL Worker to OpenAI. Organizing a live request charges the connected API account; a coding subscription does not provide API credits. Connect performs a syntax check, not a paid validation call. Disconnect/reload clears the key. There is no shared CPL provider key or credential fallback.

**Actual provider extraction is NOT LIVE-VERIFIED:** the owner requested all implementation except supplying an OpenAI key. Deterministic tests use synthetic mocks and incur no paid calls. Missing protection settings disable live submission, and provider failures preserve input without canned fallback. See the current [verification record](docs/VERIFICATION.md) for deployed protection and browser evidence.

The separate [portfolio walkthrough](https://cpl-portfolio.pages.dev/projects/job-intake-cleaner/#walkthrough) illustrates six specific stages with fictional electrical-request data. It is scripted, independent of the hosted app, and makes no provider calls. The app's disconnected sample experience also makes no provider calls and labels its exports as fictional.

## Local development

Use Node **24.19.0** (recorded in `.node-version` and `.nvmrc`).

```sh
npm ci
npm run dev
```

`dev` runs the Cloudflare Vite integration and workerd, not a standalone Node API server. Use `npm run build` then `npm run preview` to test the deployable Worker and assets at http://127.0.0.1:4173.

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:browser
npm run verify
npm run deploy
```

`verify` gates lint, types, deterministic unit/Workers tests, production build, desktop/mobile Playwright, and public-source checks in sequence. `deploy` cannot reach Wrangler if those checks fail. `npm ci` installs local Git hooks when a Git checkout exists. Do not bypass hooks for publication.

## Links and handoff

- [Open Job Intake Cleaner](https://cpl-job-intake-cleaner.astarrett.workers.dev/) — public workspace, no account; processing availability is reported in the app.
- [Public source](https://github.com/AaronStarrett/cpl-job-intake-cleaner)
- [CPL portfolio](https://cpl-portfolio.pages.dev)
- [Contact CPL](https://cpl-portfolio.pages.dev/#contact)
- See [verification record](docs/VERIFICATION.md) for actual public repository, deployment, commit and checks; no proposed URL counts as deployment evidence.

Read [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), [privacy and limits](docs/PRIVACY-AND-LIMITS.md), [CSV format](docs/EXPORTS.md), and [Paul's walkthrough](docs/SALES-DEMO.md).
