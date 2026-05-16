# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run production server
npm run lint     # ESLint check (no --fix flag configured)

# Tests
npm test                  # Unit + behaviour tests (Jest, ~5s)
npm run test:unit         # Pure function tests only
npm run test:behaviour    # Fetch-mocked lib tests only
npm run test:coverage     # Jest with coverage report
npm run test:e2e          # Playwright E2E against https://grid.xelantis.com
npm run test:e2e:ui       # Playwright interactive UI mode
npm run test:e2e:prod     # Explicitly target production URL
BASE_URL=http://localhost:3000 npm run test:e2e  # E2E against local dev server
```

## Testing

Three layers:

| Layer | Tool | Location | What it covers |
|---|---|---|---|
| Unit | Jest + ts-jest | `tests/unit/` | Pure functions: `fmtMW`, `fmtTime`, `getStatus`, `generateMockData` |
| Behaviour | Jest + ts-jest | `tests/behaviour/` | Lib functions with `global.fetch` mocked: carbon, prices, sites, storage data fetching |
| E2E | Playwright | `tests/e2e/` | Full browser flows: page load, overlay toggles, tab navigation |

**Behaviour test note — mock call order matters.** In `fetchSitesLive`, `Promise.all([fetch(BOALF), fetchBmuMeta()])` means BOALF is mock call #1 and BMU ref is call #2. In `fetchBessTimeSeries`, `Promise.all([fetchBessBmuIds(), fetch(BOALF)])` means BMU ref is call #1 and BOALF is call #2. Always match mock order to the source.

**`jest.isolateModules`** is used in every behaviour test `beforeEach` to reset module-level caches (`_bessBmuCache`, `_metaCache`) between tests.

**Playwright targets production by default** (`https://grid.xelantis.com`). Set `BASE_URL` to override.

**Per-issue test expectations:** For every new feature or fix — (1) unit tests for any new pure functions in `tests/unit/`; (2) behaviour tests for any new fetch-dependent lib functions in `tests/behaviour/`; (3) E2E tests in `tests/e2e/` for new UI flows (toggle buttons, tab navigation). Run `npm test` before marking an issue done.

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
- **BM bid/offer prices overlay** (`/api/bm-prices`, `src/lib/bm-prices.ts`) — fleet-average accepted bid/offer prices per SP from Elexon BOD dataset. Offer (amber) = discharge price £/MWh; Bid (blue) = charge price. Toggle in main chart header.
- **Settlement period P&L estimate** (`src/lib/pnl.ts`) — estimated gross revenue per SP: `avgMW × Agile_price / 200` (£k). Bar chart with running daily total. Toggle in main chart header.
- **Wind & solar overlay** (`StorageDataPoint.wind/solar`) — FUELINST WIND and SOLAR fields threaded through the data pipeline. Teal (wind) and yellow (solar) lines in a separate panel. Toggle in main chart header.

## Possible Enhancements

- **System Price (SSP/SBP)** — Elexon imbalance price per settlement period; much spikier than Agile and the real driver of BM dispatch. Free from Elexon, no key.
- **Grid frequency overlay** — National Grid ESO publishes live 50 Hz ± deviation; shows FFR/DC service response in real time.
- **Improve map coordinates** — most non-KNOWN_BESS sites fall back to GSP region centroid; adding exact coordinates to `src/lib/bess-sites.ts` improves accuracy.
- **Per-site historic view** — legacy BMRS API (free key from elexon.co.uk; endpoint: `api.bmreports.com/BMRS/PHYBMDATA/v1`)

## Production Deployment

Deployed on **Railway** (~$5/month). Git-push auto-deploys; persistent Node.js process keeps the module-level BMU cache warm. All routes are `force-dynamic` — the app requires a Node.js runtime (cannot be statically exported).
