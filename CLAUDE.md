# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run production server
npm run lint     # ESLint check (no --fix flag configured)
```

No test framework is configured — linting is the only automated check.

## Architecture

**What it is**: Real-time monitoring dashboard for UK grid-scale Battery Energy Storage Systems (BESS), sourcing data from the public Elexon Insights API (no API key needed).

**Stack**: Next.js 15.5.x (App Router, TypeScript), React 19, Recharts for all charts, react-simple-maps for the site map. No UI library — all styling is inline CSS with CSS variables defined in `globals.css`.

### Data Flow

```
Browser → /api/elexon         → PN → BOALF → FUELINST  (priority fallback chain)
Browser → /api/elexon/history → BOALF for a specific past date
Browser → /api/units          → data.elexon.co.uk/bmrs/api/v1/reference/bmunits/all
Browser → /api/sites          → BOALF per-unit live leaderboard
Browser → /api/prices         → Octopus Agile half-hourly p/kWh (Region A)
Browser → /api/carbon         → api.carbonintensity.org.uk half-hourly gCO₂/kWh
```

The proxy routes solve CORS. `/api/elexon` falls back to mock data (`meta.source = "mock"`) if all Elexon sources fail.

### Rendering Strategy

- **`src/app/page.tsx`** — server component; calls `fetchStorageData()` at request time so the page arrives fully rendered
- **`src/components/Dashboard.tsx`** — client component (`"use client"`); owns tab state, 5-minute auto-refresh, and all interactive state. Four tabs: Live Overview, Live Sites, Fleet Directory, Site Map
- **`src/components/SitesTab.tsx`** — client component; per-site live leaderboard (~69 sites, ~79 BMUs) ranked by |currentMW|, pulls from `/api/sites`
- **`src/components/UnitsTab.tsx`** — client component; fleet directory with search/sort/filter, pulls from `/api/units`
- **`src/components/UKMap.tsx`** — client component; loaded via `dynamic(..., { ssr: false })` because `react-simple-maps` uses `d3-geo` (ESM-only, breaks SSR)

### API Routes

| Route | Purpose |
|---|---|
| `GET /api/elexon` | Main data endpoint — returns `StorageDataPoint[]` via PN→BOALF→FUELINST fallback |
| `GET /api/elexon/history?date=YYYY-MM-DD` | Historical BESS data for a specific past date via BOALF; 1-hour cache |
| `GET /api/units` | Fleet directory — ~300 storage BMUs from Elexon reference API, module-level cached |
| `GET /api/sites` | Per-site live leaderboard — BOALF aggregated by physical site |
| `GET /api/prices` | Octopus Agile half-hourly prices (p/kWh inc. VAT, Region A) |
| `GET /api/carbon` | Grid carbon intensity half-hourly actuals + forecast (gCO₂eq/kWh) |
| `GET /api/elexon/debug` | Raw Elexon response inspector |
| `GET /api/elexon/probe` | Tests endpoint variants (dev only) |

## Data Sources — Priority Chain

`fetchStorageData()` in `src/lib/elexon.ts` tries sources in this order:

1. **PN (Physical Notifications)** — operator-submitted plans per settlement period. Captures both merchant and BM-dispatched operation, so BESS charging (negative MW) is visible. ~30-min resolution.
2. **BOALF (Bid-Offer Acceptance Level Final)** — System Operator dispatch acceptances only. Near-real-time but only shows BM-instructed charge/discharge; merchant charging is invisible.
3. **FUELINST** — aggregate fleet-level 5-min outturn. Bidirectional for pumped hydro (`PS` field) but BESS (`OTHER` field) is always ≥ 0 — charging not visible.

`pumped` (hydro) always comes from FUELINST `PS` regardless of which BESS source is used, then merged by matching HH:MM timestamps.

## Key Data Facts (hard-won from API probing)

- **FUELINST is long format** — one row per `(startTime, fuelType)`, not wide. `fetchElexonFuelInst()` pivots these.
- **BESS = `fuelType: "OTHER"`** — bundled with misc generators; never goes negative in FUELINST
- **PS = pumped hydro** — genuinely bidirectional in FUELINST; negative when pumping
- **PN/BOALF field names vary** — some Elexon endpoints return `nationalGridBmUnit`, others only `bmUnit`. `fetchBessTimeSeries()` normalises both: `r.nationalGridBmUnit ?? r.bmUnit`
- **BMU reference endpoint returns 2.7MB** — exceeds Next.js fetch cache 2MB limit. Both `fetchBessBmuIds()` (in `elexon.ts`) and `/api/units` use module-level in-memory caches with 1-hour TTL instead of `next: { revalidate }`
- **BOALF/PN responses** also skip the fetch cache (`cache: "no-store"`) to avoid the same issue
- **~300 storage BMUs** in reference data, identified by `bmUnitType: "S"` or `fuelType: "OTHER"` with capacity > 0.1 MW
- **PN dataset (`/datasets/PN`) returns 404** as of 2026-05-13 — `fetchStorageData()` falls through immediately to BOALF. The fallback chain is still correct; BOALF is now the effective primary source.
- **`fetchBessTimeSeries(dataset, dateStr?)`** accepts an optional `dateStr` (YYYY-MM-DD). When omitted it defaults to today; when provided it fetches the full day (00:00–23:59Z) and caches the result for 1 hour. Used by `/api/elexon/history`.
- **Yesterday overlay** in Dashboard merges historical points into today's chart by matching HH:MM substrings (same technique as the pumped-hydro merge). Renders as a dashed white `<Line>` over the `<AreaChart>`.

## Site Map (`src/components/UKMap.tsx`)

- Uses `react-simple-maps` with Natural Earth 50m world TopoJSON (fetched from jsDelivr CDN at runtime)
- Site coordinates in `src/lib/bess-sites.ts`: exact lat/lng for ~28 known major sites keyed by BMU prefix (e.g. `"E_MINETY"`, `"E_PILGR"`), GSP group centroids as fallback for ~270 others
- Bubble area ∝ capacity MW; BMUs from the same physical site are deduplicated by stripping the trailing `-N` unit number
- Two colour modes: by capacity (all green) and by operator (distinct colours)
- **Must be loaded with `dynamic(..., { ssr: false })`** — d3-geo is ESM-only and crashes the Next.js server renderer if imported directly

## Styling Conventions

CSS custom properties defined in `src/app/globals.css`:

```
--bg, --bg-card, --bg-card-hover
--border, --border-accent
--text, --text-dim, --text-mid
--accent: #00ffb3        (green — discharging)
--charge: #60a5fa        (blue — charging)
--font-mono: JetBrains Mono
--font-sans: Space Grotesk
--radius: 12px, --radius-lg: 16px
```

Components use inline `style` objects rather than CSS modules or Tailwind.

## Shipped Enhancements

These were not in the original build but have since been added:

- **Octopus Agile price overlay** (`/api/prices`) — half-hourly p/kWh, colour-coded green→red bars. Toggle in main chart header.
- **Carbon intensity overlay** (`/api/carbon`) — half-hourly gCO₂eq/kWh, colour-coded by index. Toggle in main chart header.
- **Live Sites tab** (`/api/sites`, `SitesTab`) — per-site leaderboard ranked by |currentMW|, toggle active-only vs all, sortable.
- **Yesterday overlay** (`/api/elexon/history`, Dashboard) — dashed reference line on the main chart showing the same metric from the previous day. Fetched lazily on first toggle.

## Possible Enhancements

- **Balancing Mechanism prices** — Elexon publishes accepted bid/offer prices per BMU per settlement period. Overlay the dispatch price to explain *why* the fleet moved.
- **Settlement period P&L estimate** — combine MW output with Agile prices to show estimated revenue per half-hour (MW × p/kWh). Rough but compelling.
- **Wind/solar generation overlay** — add FUELINST `WIND`/`SOLAR` fields to the main chart; visually shows storage arbitrage (charge when renewables are high, discharge when low).
- **System Price (SSP/SBP)** — Elexon imbalance price per settlement period; much spikier than Agile and the real driver of BM dispatch. Free from Elexon, no key.
- **Grid frequency overlay** — National Grid ESO publishes live 50 Hz ± deviation; shows FFR/DC service response in real time.
- **Improve map coordinates** — most non-KNOWN_BESS sites fall back to GSP region centroid; adding exact coordinates to `src/lib/bess-sites.ts` improves accuracy.
- **Per-site historic view** — legacy BMRS API (free key from elexon.co.uk; endpoint: `api.bmreports.com/BMRS/PHYBMDATA/v1`)

## Production Deployment

All routes are dynamic (`force-dynamic`) so the app cannot be statically exported — it needs a Node.js runtime.

### Option 1 — Vercel (recommended, ~free for this usage)

The repo is already Vercel-ready. `/api/*` routes run as Serverless Functions.

```bash
npm i -g vercel
vercel        # follow prompts, auto-detects Next.js
```

**Cost**: Free tier (Hobby) covers this project comfortably — 100GB bandwidth/month, 100k function invocations/day, no always-on server. Upgrade to Pro ($20/month) only if you need custom domains on multiple projects, team access, or analytics.

**Gotcha**: Vercel Serverless Functions have no persistent memory between invocations, so the module-level BMU cache (`_bessBmuCache`) resets on every cold start. The cache still works within a warm instance but won't survive across deploys or cold starts. Acceptable for this use case — it just means one extra 2.7MB Elexon fetch on cold start.

### Option 2 — Fly.io (persistent memory cache, ~$3–5/month)

Runs the app as a persistent Node.js process, so the module-level BMU cache stays warm indefinitely.

```bash
npm i -g flyctl
fly launch    # auto-detects Next.js, creates fly.toml
fly deploy
```

**Cost**: Single `shared-cpu-1x` VM with 256MB RAM ~$3/month. The BMU cache fits easily (filtered Set is <100KB). Add a `fly.toml` with `[http_service] internal_port = 3000`.

### Option 3 — Railway (~$5/month, simplest Git-push deploy)

Connect the GitHub repo, set `npm run build` as build command and `npm start` as start command. Auto-deploys on push.

**Cost**: Starter plan $5/month for a 512MB RAM container. Persistent process = warm cache. Good choice if you want zero devops friction.

### Option 4 — Self-hosted VPS (cheapest at scale, most work)

Any provider (Hetzner CX11 ~€4/month, DigitalOcean $6/month) running Node.js 20+. Use PM2 to keep the process alive.

```bash
npm run build && pm2 start npm --name bess -- start
```

**Cost**: €4–6/month. Module-level cache persists indefinitely. Requires you to manage SSL (use Caddy or nginx + Let's Encrypt), upgrades, and monitoring.

### Summary

| Option | Cost/month | Cache survives cold start? | Effort |
|---|---|---|---|
| Vercel Hobby | Free | No | Minimal |
| Fly.io | ~$3 | Yes | Low |
| Railway | ~$5 | Yes | Minimal |
| VPS (Hetzner/DO) | ~$4–6 | Yes | Medium |

For a personal/demo project, **Vercel Hobby** is the obvious starting point. If the cold-start cache miss becomes noticeable (adds ~1s on first load after inactivity), move to **Fly.io**.
