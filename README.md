# GB Grid Battery Storage Dashboard

Real-time monitoring of UK grid-scale Battery Energy Storage Systems (BESS).  
Data sourced from the **Elexon Insights API** — no API key required.

## What it shows

- Live charge/discharge state of the GB transmission-level BESS fleet
- Net output in MW (positive = discharging to grid, negative = charging from grid)
- Today's full output history at 5-minute resolution
- Hourly average breakdown showing the typical daily rhythm
- Pumped hydro storage as a separate view
- Auto-refreshes every 5 minutes

## Architecture

```
Browser  →  Next.js /api/elexon  →  data.elexon.co.uk (FUELINST)
```

The **proxy API route** (`src/app/api/elexon/route.ts`) solves the CORS problem —
all requests to Elexon happen server-side. If Elexon is unreachable, the server
returns realistic simulated data so the UI always works.

The **page** (`src/app/page.tsx`) is a server component that fetches initial data
at request time, so the dashboard renders fully on first load with no client-side
loading state.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data source

- **API**: [Elexon Insights Solution](https://developer.data.elexon.co.uk/)
- **Dataset**: `FUELINST` — Instantaneous generation outturn by fuel type
- **Endpoint**: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELINST`
- **Key**: None required
- **Update frequency**: Every 5 minutes
- **Coverage**: Transmission-connected assets only (embedded distribution-level batteries not included)

### Fields used

| Field   | Meaning                                      |
|---------|----------------------------------------------|
| `battery` / `other` | BESS output (MW) — positive = discharging |
| `ps`    | Pumped storage hydro (MW)                    |
| `time`  | UTC timestamp of measurement                 |

### Caveats

- Embedded (distribution-level) batteries are **not** visible — they show up as reduced demand
- The `battery` field is a newer addition; older records use `other` which may include non-BESS assets
- Data is the **instantaneous** reading, not a settled half-hourly figure

## Deployment

Works on any Node.js host. For Vercel:

```bash
npm i -g vercel
vercel
```

The `/api/elexon` route will run as a Vercel Serverless Function, keeping
all Elexon requests server-side.

## Extending

Want to add individual BESS units? Try:
- `GET /reference/bmunits/all` — list all BM units (filter by `fuelType: BATTERY`)
- `GET /datasets/PN` — Physical Notifications per unit (shows individual charge/discharge plans)
- `GET /datasets/BOAL` — Bid Offer Acceptance Level (actual BM actions per unit)
