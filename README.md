# Job Intake Cleaner · Cyber Pirate Labs

Turn messy messages into organized job requests. A standalone React/TypeScript app served with its same-origin API by one Cloudflare Worker.

## What works

Six explicitly fictional, prepared examples; an editable evidence-backed intake card; deterministic missing-information and conflict checks; editable follow-up drafts; copy, CSV, JSON, and clean browser printing. No visitor account is needed. Examples make no provider calls. Editing source text invalidates the prepared result. Editing the card invalidates the review acknowledgment.

The real OpenAI Responses adapter, Turnstile verification, and authoritative SQLite Durable Object quotas are implemented. Live AI is disabled by default. A dedicated approved key, model, anti-abuse configuration, and budget are required before a bounded live verification. No live extraction is claimed until that test succeeds.

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

- [Public source](https://github.com/AaronStarrett/cpl-job-intake-cleaner)
- [CPL portfolio](https://cpl-portfolio.pages.dev)
- [Contact CPL](https://cpl-portfolio.pages.dev/#contact)
- See [verification record](docs/VERIFICATION.md) for actual public repository, deployment, commit and checks; no proposed URL counts as deployment evidence.

Read [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), [privacy and limits](docs/PRIVACY-AND-LIMITS.md), [CSV format](docs/EXPORTS.md), and [Paul's demo](docs/SALES-DEMO.md).
