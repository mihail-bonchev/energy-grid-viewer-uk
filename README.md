# GB Grid Battery Storage Dashboard

Real-time monitoring of GB grid-scale Battery Energy Storage Systems (BESS).
All data comes from free public APIs. No API keys are needed.

Live at [grid.xelantis.com](https://grid.xelantis.com).

## What it shows

- **Live Overview**: BM-instructed BESS output for today (London day) at 5-minute resolution, plus pumped hydro from FUELINST. Optional overlays:
  - Agile price
  - Carbon intensity
  - BM bid/offer prices
  - Estimated P&L at the wholesale Market Index Price
  - Wind
  - Yesterday's curve for comparison
- **Live Sites**: per-site leaderboard of the instruction in force right now, with a per-site history modal
- **Fleet Directory**: about 155 BESS units (about 7.5 GW) from the Elexon unit reference data
- **Site Map**: sites with town-level coordinates, or a regional centroid where the location is unknown

Positive MW means discharging; negative means charging. The page auto-refreshes every 5 minutes.

## Architecture

```
Browser → /api/elexon          → Elexon BOALF + FUELINST (main series)
Browser → /api/elexon/history  → Elexon BOALF for a past date, optionally one site
Browser → /api/sites           → Elexon BOALF, aggregated per site
Browser → /api/units           → Elexon /reference/bmunits/all
Browser → /api/bm-prices       → Elexon BOD/stream (submitted bid/offer prices)
Browser → /api/market-price    → Elexon market index (APXMIDP)
Browser → /api/prices          → Octopus Agile (Region A)
Browser → /api/carbon          → api.carbonintensity.org.uk
```

The proxy routes avoid CORS problems: every upstream request is made server-side. `/api` is kept as an alias of `/api/elexon` so existing links still work. If Elexon is unreachable, `/api/elexon` returns clearly flagged simulated data.

`src/app/page.tsx` is a server component that fetches the initial data at request time, so the first render is complete.

## Data notes

- **BOALF shows only what the System Operator instructs** (Balancing Mechanism dispatch), not merchant trading. Each row is a linear segment over `[timeFrom, timeTo)`. When acceptances overlap, the latest one wins. Outside any segment the instructed level is 0.
- **BESS identification:** a unit counts as a battery if its name contains battery/BESS/storage, or if its National Grid ID matches the `<site>B-<n>` pattern (`PILLB-1`, `KILSB-3`). `bmUnitType: "S"` means *supplier* unit, not storage.
- **All "today" windows use the London day.** Settlement days start at 23:00Z during BST.
- **FUELINST** provides pumped hydro (`PS`) and wind. It has no solar field, and its `OTHER` category never shows battery charging.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit + behaviour tests
npm run lint
```

## Deployment

Deployed on Railway as a long-running Node.js process (Dockerfile, `output: "standalone"`), which keeps the in-memory unit cache warm. Every route is dynamic, so the app can't be exported as a static site.
