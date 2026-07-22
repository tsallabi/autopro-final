# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` / `npm start` — Runs `tsx server.ts`. This single process boots Express + Socket.IO **and** mounts Vite in middleware mode, so the API, WebSocket, and React frontend are all served together. There is no separate `vite dev` step.
- `npm run build` — `vite build --emptyOutDir` (production frontend bundle into `dist/`). `sourcemap: false` is intentional to avoid OOM on Railway free tier — do not re-enable.
- `npm run lint` — `tsc --noEmit` (type-check only; there is no ESLint).
- `npm run test:e2e` — Playwright (`tests/e2e_auction_flow.spec.ts`). Run a single test with `npx playwright test tests/e2e_auction_flow.spec.ts -g "<name>"`.
- `npm run test:seed` — Seeds stress-test data into `auction.db` via `tests/seed_stress_data.ts`.
- `npm run test:stress` — `tests/stress_bidding_sockets.ts`, drives many concurrent socket clients against a running dev server.
- `npm run seed:simulation` — `scripts/full_simulation_seeder.ts`, populates a full demo dataset.

Note the Vite proxy in `vite.config.ts` points at `localhost:3005`, but in normal `npm run dev` Vite is embedded inside `server.ts` (middleware mode) so the proxy block only matters if you ever run `vite` standalone.

## Architecture

This is a **single-process full-stack TypeScript app**: one `server.ts` file (~5800 lines) is the entire backend, and `src/` is a React 19 + React Router 7 SPA served by that same process.

### Backend (`server.ts`)
- **Express** REST API under `/api/*`, **Socket.IO** for live auction bidding/timers, **Vite middleware** for SSR-less dev serving of `src/`.
- **Database:** `better-sqlite3` against `auction.db` (WAL mode, 5s busy timeout). The DB file lives at the repo root and is checked into git alongside `auction.db-shm` / `auction.db-wal`. Migrations are ad-hoc `.cjs` / `.js` scripts at the repo root (`migrate_cars*.js`, `migrate_settings.js`, `seed_market_estimates.cjs`, etc.) — there is no migration framework.
- **Live auctions:** in-memory `auctionTimers` map holds per-auction countdown state; Socket.IO broadcasts ticks and bid events. This state is lost on restart by design.
- **Auth:** JWT (`JWT_SECRET` env, falls back to a hardcoded dev secret) + bcryptjs. Google/Facebook OAuth via `google-auth-library` and `react-facebook-login`.
- **Email:** unified `sendEmail()` helper prefers **Resend** (`RESEND_API_KEY`) and falls back to **SMTP** via nodemailer (`mail.privateemail.com` for `info@autopro.ac`). **Production uses SMTP ONLY (owner's explicit decision, 2026-07-16): no `RESEND_API_KEY` is set on the server — do not tell the owner to configure Resend.** The Resend-first code path stays for compatibility, but the site now runs on a VPS (`/var/www/autopro/app`, deployed via `scripts/safe-deploy.sh`) where outbound SMTP works — the old "Render blocks SMTP" constraint no longer applies. Mass campaigns go through the pooled rate-limited `campaignTransporter` (~1 msg/2.5s) with results persisted in `campaign_runs`. Email health = `"smtp": true` in `/api/health` providers. **Campaign hygiene (added after Namecheap blocked outbound sending, ticket NC-VGW-7157, 2026-07-21):** every campaign email carries a signed `/api/unsubscribe` link + RFC 8058 One-Click headers; recipients are filtered against `email_suppression` (unsubscribes, hard bounces, full mailboxes — seeded from Namecheap's bounce report), typo/test domains, and a 72h per-address frequency cap (`campaign_last_sent`, override with `CAMPAIGN_MIN_HOURS`). Marketing can be routed through a separate bulk-ESP SMTP relay via `CAMPAIGN_SMTP_HOST/PORT/USER/PASS/FROM` without touching transactional email — per Namecheap's AUP, bulk marketing should NOT go through Private Email.
- **Payments:** Stripe (`STRIPE_SECRET_KEY`) for deposits, plus a manual bank-transfer flow with admin approval. Both clients are optional and guarded by env presence.
- **Uploads:** `multer` writing to `uploads/` (served statically).
- **Scrapers:** `puppeteer` + stealth plugin and `cheerio` for car-listing imports (see `add-scraper.cjs`, `import_cars.cjs`).

### Frontend (`src/`)
- **React 19** + **React Router 7** SPA, entry `src/main.tsx` → `src/App.tsx`. Pages live in `src/pages/`, shared UI in `src/components/`, admin-only UI in `src/components/admin/`.
- **Tailwind v4** via `@tailwindcss/vite` (no `tailwind.config.js` — config is in CSS).
- **i18n:** `react-i18next` with detector; locale files in `src/locales/`. The platform is bilingual (English / Arabic — Libyan market).
- **State/data:** no Redux/Zustand; data flows via React context (`src/context/`) and direct `fetch` to `/api/*`. Live bidding subscribes via `socket.io-client`.
- **Path alias:** `@/` resolves to the repo root (see `vite.config.ts`), so imports like `@/src/...` are valid.

### Domain
AutoPro is a **car auction platform targeting the Libyan market**. Core entities: cars, auctions (live + scheduled), bids, users (buyer / seller / admin), deposits/wallet, KYC, branches, and a market-prices dataset (~227 cars). Admin dashboard (`src/pages/AdminDashboard.tsx` + `src/components/admin/`) covers CRM, seller management, accounting, security, deposit approvals, and market-price editing.

### Repo hygiene notes
- The repo root is cluttered with one-off scripts (`fix-a11y*.cjs`, `test-*.cjs`, `check_db*.ts`, `*_backup.tsx`, large `.txt` / `.md` snapshots). Treat these as historical artifacts — don't extend them; prefer adding new code under `src/`, `scripts/`, or `tests/`.
- Several pages have `*_backup.tsx` siblings (`Home_backup.tsx`, `LandingPage_backup.tsx`, `Navbar_backup.tsx`). These are not wired into the router; don't edit them when changing the live versions.
- `auction.db` is committed. Schema changes must be reflected by editing the DB (via a migration script) **and** by updating `server.ts` `CREATE TABLE IF NOT EXISTS` blocks so fresh checkouts still work.
