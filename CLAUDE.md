# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run production server
npm run lint     # ESLint (next/core-web-vitals + Sonar cognitive complexity ≤ 15)

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
| Unit | Jest + ts-jest | `tests/unit/` | Pure functions: formatting, BESS classification, PN/BOALF level maths, London-day helpers, P&L, BOD aggregation, Overview helpers (`src/components/overview/helpers.ts`) |
| Behaviour | Jest + ts-jest | `tests/behaviour/` | Lib functions with `global.fetch` mocked: carbon, prices, sites, storage data fetching |
| E2E | Playwright | `tests/e2e/` | Full browser flows: page load, overlay toggles, tab navigation |

**Behaviour test note — route mocks by URL, not call order.** PN, BOALF, FUELINST and the BMU reference are fetched partly in parallel, so call order is not a stable contract. Use `routeElexon(mockFetch, { bmu, pn, boalf, fuelinst })` and `seg()` from `tests/behaviour/elexon-mock.ts` (pass `"fail"` to simulate an HTTP error). `fetch-bm-prices` and the Octopus/carbon tests still use ordered mocks.

**`jest.isolateModules`** is used in every behaviour test `beforeEach` to reset module-level caches (the BESS unit cache in `bmu.ts`, `_cache` in `bm-prices.ts`) between tests.

**Playwright targets production by default** (`https://grid.xelantis.com`). Set `BASE_URL` to override.

**Per-issue test expectations:** For every new feature or fix — (1) unit tests for any new pure functions in `tests/unit/`; (2) behaviour tests for any new fetch-dependent lib functions in `tests/behaviour/`; (3) E2E tests in `tests/e2e/` for new UI flows (toggle buttons, tab navigation). Run `npm test` before marking an issue done.

## Architecture

**What it is**: Real-time monitoring dashboard for UK grid-scale Battery Energy Storage Systems (BESS), sourcing data from the public Elexon Insights API (no API key needed).

**Stack**: Next.js 15.5.x (App Router, TypeScript), React 19, Recharts for all charts, react-simple-maps for the site map. No UI library — all styling is inline CSS with CSS variables defined in `globals.css`.

### Data Flow

```
Browser → /api/elexon         → PN+BOALF → BOALF only → FUELINST  (fallback chain; /api is an alias)
Browser → /api/elexon/history → PN+BOALF for a past London date (optionally one site)
Browser → /api/units          → data.elexon.co.uk/bmrs/api/v1/reference/bmunits/all
Browser → /api/sites          → PN+BOALF per-site live leaderboard
Browser → /api/prices         → Octopus Agile half-hourly p/kWh (Region A)
Browser → /api/carbon         → api.carbonintensity.org.uk half-hourly gCO₂/kWh
Browser → /api/bm-prices      → Elexon BOD/stream, one request for the day filtered to BESS units
Browser → /api/market-price   → Elexon market index (APXMIDP) £/MWh — drives the P&L panel
Browser → /api/system-prices  → Elexon imbalance price (SSP/SBP) + NIV per SP for today's settlement date
Browser → /api/frequency      → Elexon system frequency (15 s): last hour for the chart + today's stats
```

The proxy routes solve CORS. `/api/elexon` falls back to mock data (`meta.source = "mock"`) if all Elexon sources fail.

### Rendering Strategy

- **`src/app/page.tsx`** — server component; calls `fetchStorageData()` at request time so the page arrives fully rendered
- **`src/components/Dashboard.tsx`** — client component (~120 lines); owns only the main data + 5-minute auto-refresh (`useStorageData`), the active tab, the selected view and the set of open overlays (kept here so they survive tab switches). Four tabs: Live Overview, Live Sites, Fleet Directory, Site Map
- **`src/components/overview/`** — the Live Overview tab, one file per piece:
  - `OverviewTab.tsx` composes hero, stat cards, `MainChart` (with view/overlay toggles; `OVERLAYS` lists the toggle buttons), overlay panels and `BottomRow`
  - One panel per overlay (`PricesPanel`, `CarbonPanel`, `BmPricesPanel`, `SystemPricePanel`, `PnlPanel`, `RenewablesPanel`). **Each panel fetches its own data** with `useOverlayData(url, enabled, refreshKey)`, refetching when `refreshKey` (the main data's `lastUpdated`) changes, so panels load when opened and refresh with the 5-minute cycle
  - `ui.tsx` — shared primitives (`Panel`, `TooltipBox`, `TooltipRow`, `Legend`, `ToggleButton`, `KeyValueList`, `AXIS_TICK`…); `helpers.ts` — pure, unit-tested logic (colours, hero caption, summaries, yesterday merge, P&L helpers)
  - **To add an overlay:** create a panel file using `Panel` + `useOverlayData`, add its key/label to `OVERLAYS` in `MainChart.tsx`, and render it in `OverviewTab.tsx`. Do not add state or fetchers to `Dashboard.tsx`
- **`src/components/SitesTab.tsx`** — client component; per-site live leaderboard (~105 sites, ~145 BMUs reporting PN on a typical day; "BM" tag = SO acceptance in force) ranked by |currentMW|, pulls from `/api/sites`
- **`src/components/UnitsTab.tsx`** — client component; fleet directory with search/sort/filter, pulls from `/api/units`
- **`src/components/UKMap.tsx`** — client component; loaded via `dynamic(..., { ssr: false })` because `react-simple-maps` uses `d3-geo` (ESM-only, breaks SSR)

### API Routes

| Route | Purpose |
|---|---|
| `GET /api/elexon` | Main data endpoint — returns `StorageDataPoint[]` via PN→BOALF→FUELINST fallback. `src/app/api/route.ts` re-exports it as `/api` for backward compatibility |
| `GET /api/elexon/history?date=YYYY-MM-DD` | Historical BESS data for a specific past date via BOALF; 1-hour cache |
| `GET /api/units` | Fleet directory — ~155 BESS BMUs (~7.5 GW) from Elexon reference API via `fetchBessUnits()` |
| `GET /api/sites` | Per-site live leaderboard — BOALF aggregated by physical site |
| `GET /api/prices` | Octopus Agile half-hourly prices (p/kWh inc. VAT, Region A) |
| `GET /api/carbon` | Grid carbon intensity half-hourly actuals + forecast (gCO₂eq/kWh) |
| `GET /api/market-price` | Elexon Market Index Price (APXMIDP) per SP, £/MWh |
| `GET /api/system-prices` | Elexon system (imbalance) price SSP/SBP and NIV per SP, today's London settlement date |
| `GET /api/frequency` | Grid frequency: last hour of 15-second readings plus today's current/min/max and % outside 49.8–50.2 Hz |
| `GET /api/elexon/debug` | FUELINST fuel-type inspector (404 in production) |
| `GET /api/elexon/probe` | Tests endpoint variants (404 in production) |

## Data Sources — Priority Chain

`fetchStorageData()` in `src/lib/elexon.ts` tries sources in this order:

1. **PN with BOALF overrides** (`fetchPhysicalLevels` + `physicalSeries` in `bmu.ts`) — per BMU, the BOALF level while an SO acceptance is in force (BOALF levels are absolute MW, so they *replace* PN), else the operator's Physical Notification, else 0. PN includes merchant trading, so fleet charging/discharging is visible (~±2–3 GW vs ~±0.7 GW from BOALF alone). PN and BOALF are fetched in parallel; either may fail on its own. `source: "pn"`.
2. **BOALF only** — if PN fails. SO-instructed levels only; merchant activity invisible. `source: "boalf"`.
3. **FUELINST** — aggregate fleet-level 5-min outturn. Bidirectional for pumped hydro (`PS` field) but BESS (`OTHER` field) is always ≥ 0 — charging not visible.

`pumped` (hydro) always comes from FUELINST `PS` regardless of which BESS source is used, then merged by `mergeFuelInst()`, which forward-fills the latest FUELINST row (FUELINST lags BOALF by a few minutes).

## Key Data Facts (hard-won from API probing)

- **FUELINST is long format** — one row per `(startTime, fuelType)`, not wide. `fetchElexonFuelInst()` pivots these.
- **BESS = `fuelType: "OTHER"`** — bundled with misc generators; never goes negative in FUELINST
- **PS = pumped hydro** — genuinely bidirectional in FUELINST; negative when pumping
- **PN/BOALF field names vary** — some Elexon endpoints return `nationalGridBmUnit`, others only `bmUnit`. `groupBoalf()` normalises both: `r.nationalGridBmUnit ?? r.bmUnit` (with the `E_`/`T_` prefix stripped)
- **BMU reference endpoint returns ~2.2MB** — over the Next.js fetch cache 2MB limit. `fetchBessUnits()` in `src/lib/bmu.ts` is the single module-level cache (1-hour TTL) shared by `elexon.ts`, `sites.ts` and `/api/units`.
- **BOALF/PN responses** also skip the fetch cache (`cache: "no-store"`) to avoid the same issue
- **BESS identification** (`isBessUnit()` in `bmu.ts`): bmUnitName matches /batter|bess|storage/i, or NG ID matches the `<site>B-<n>` battery convention (e.g. `PILLB-1`, `KILSB-3`); interconnectors and known generation fuel types excluded. ~155 units. **Do not use `bmUnitType: "S"`** — that means *supplier* BMU (VPPs, aggregators, wind). `fuelType: "OTHER"` alone is also wrong: it includes solar (Cleve Hill) and gas (Thurrock Power), and many real batteries have `fuelType: null`.
- **`nationalGridBmUnit` has no `E_`/`T_` prefix** (`WHTBB-1`); `elexonBmUnit`/`bmUnit` does (`E_WHTBB-1`). Site ID = NG ID minus trailing `-N`.
- **BOALF rows are linear segments over `[timeFrom, timeTo)`**, from `levelFrom` to `levelTo`; overlapping acceptances → highest `acceptanceNumber` wins; outside every segment the BM-instructed level is 0. Never hold a level past `timeTo` (`boalfLevelAt()` in `bmu.ts`).
- **FUELINST has no SOLAR fuel type** — `solar` is always 0 from that source.
- **Use the `/stream` variants for PN and BOALF**, filtered with repeated `bmUnit=` params for BESS units: one request per day, bare-array response (~2MB PN, ~3.5MB BOALF). Plain `/datasets/PN?from&to` returns 400 (it needs settlementDate+settlementPeriod).
- **"Today" is the London day** everywhere (`src/lib/time.ts`): settlement dates, Agile and carbon all start at 23:00Z during BST. Never use `toISOString().split("T")[0]` for a day boundary.
- **`/system/frequency` returns *yesterday* when called without `from`/`to`** — always pass an explicit window. 15-second readings, published ~90 s behind real time (~300 KB per day).
- **Floating point at limits:** `|49.8 − 50|` is `0.2000000000000028`. Compare readings to limit values directly or round to 3 dp (Elexon's precision) before comparing.
- **`/datasets/BOD` caps windows at 1 hour**; `/datasets/BOD/stream` takes a whole day when filtered with repeated `bmUnit=` params.
- **Performance:** BOALF series must parse timestamps once (`boalfSeries` sweeps pre-parsed segments). Re-parsing per 5-min slot took ~80 s for a full day.
- **`fetchBessSeries(dateStr?, siteId?)`** (in `elexon.ts`) builds every BESS series — today (up to now), a past London day, or one site — so the main chart, yesterday overlay and site history are all PN+BOALF and directly comparable.
- **Yesterday overlay** in Dashboard merges historical points into today's chart by matching HH:MM substrings (same technique as the pumped-hydro merge). Renders as a dashed white `<Line>` over the `<AreaChart>`.

## Site Map (`src/components/UKMap.tsx`)

- Uses `react-simple-maps` with Natural Earth 50m world TopoJSON (fetched from jsDelivr CDN at runtime)
- Site coordinates in `src/lib/bess-sites.ts`: town-level lat/lng for ~50 identified sites keyed by site ID (e.g. `"KILSB"`, `"PILLB"`), GSP group centroids (keyed by `gspGroupId`) as fallback. ~80 transmission units have no GSP group and no known coords — they are left off the map and counted in the header, not stacked at a fake point
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

Components use inline `style` objects rather than CSS modules or Tailwind. Reuse the primitives in `src/components/overview/ui.tsx` rather than copying card/tooltip/button styles.

**Cognitive complexity:** every function must be ≤ 15 (Sonar rule S3776, default threshold). **Enforced:** `.eslintrc.json` sets `sonarjs/cognitive-complexity` to `error` (eslint-plugin-sonarjs 0.25, the line that supports ESLint 8), so `npm run lint` and `next build` fail on a violation and Railway will not deploy it. Prefer lookup tables over long `if/else` chains (see `MOCK_PROFILE` in `elexon.ts`) and extract pure helpers.

## Shipped Enhancements

These were not in the original build but have since been added:

- **Octopus Agile price overlay** (`/api/prices`) — half-hourly p/kWh, colour-coded green→red bars. Toggle in main chart header.
- **Carbon intensity overlay** (`/api/carbon`) — half-hourly gCO₂eq/kWh, colour-coded by index. Toggle in main chart header.
- **Live Sites tab** (`/api/sites`, `SitesTab`) — per-site leaderboard ranked by |currentMW|, toggle active-only vs all, sortable. "BM" tag when a System Operator acceptance is in force (`bmInstructed`).
- **PN as primary source** — PN with BOALF overrides for every BESS series (main chart, yesterday, sites, site history). Merchant charging visible.
- **Yesterday overlay** (`/api/elexon/history`, Dashboard) — dashed reference line on the main chart showing the same metric from the previous day. Fetched lazily on first toggle.
- **BM bid/offer prices overlay** (`/api/bm-prices`, `src/lib/bm-prices.ts`) — fleet-average *submitted* (not accepted) bid/offer prices per SP from Elexon BOD/stream. Offer (amber) = discharge price £/MWh; Bid (blue) = charge price. Toggle in main chart header.
- **Settlement period P&L estimate** (`src/lib/pnl.ts`) — estimated gross revenue per SP: `avgMW × price / 2000` (£k). Basis switch in the panel: Market Index Price (`/api/market-price`, default) or System price (`/api/system-prices`). Bar chart with running daily total. Toggle in main chart header.
- **System price overlay** (`/api/system-prices`, `src/lib/system-prices.ts`, `src/components/overview/SystemPricePanel.tsx`) — SSP line (pink) with dashed Market Index Price for comparison, NIV bars on a right axis (red = system short, blue = long). Toggle "⚖️ System Price". Initial settlement values, published ~20 min after each SP.
- **Grid frequency overlay** (`/api/frequency`, `src/lib/frequency.ts`, `src/components/overview/FrequencyPanel.tsx`) — last hour at 15-s resolution with 50 Hz and ±0.2 Hz operational-limit lines; header stats over the whole day. Polls every minute while open (`useTicker`). Toggle "〰️ Frequency".
- **Wind & solar overlay** (`StorageDataPoint.wind/solar`) — FUELINST WIND and SOLAR fields threaded through the data pipeline. Teal (wind) and yellow (solar) lines in a separate panel. Toggle in main chart header.

## Possible Enhancements

- **Improve map coordinates** — ~80 transmission-connected BMUs have no GSP group; adding their sites to `SITE_COORDS` in `src/lib/bess-sites.ts` puts them on the map.
- **Per-site historic view** (`fetchSiteTimeSeries`, `/api/elexon/history?date=&site=`, `SiteHistoryModal`) — History button per site row in Live Sites tab; opens modal with date picker and per-site PN+BOALF charge/discharge chart. No API key needed.

## Production Deployment

Deployed on **Railway** (~$5/month). Git-push auto-deploys; persistent Node.js process keeps the module-level BMU cache warm. All routes are `force-dynamic` — the app requires a Node.js runtime (cannot be statically exported).
