import { fetchBessBmuIds } from "./elexon";
import { londonDateStr, londonDayBounds } from "./time";

export interface BmPricePoint {
  time: string      // "HH:MM" London time (SP start)
  avgOffer: number  // fleet avg *submitted* discharge offer price £/MWh (pairId=1, excl ≥9000 sentinels)
  avgBid: number    // fleet avg *submitted* charge bid price £/MWh (pairId=-1, excl |bid|≥5000 sentinels)
  unitCount: number // BESS units contributing to the average
}

export interface BmPricesResponse {
  data: BmPricePoint[]
}

interface BodRecord {
  timeFrom: string
  pairId: number
  offer: number
  bid: number
  nationalGridBmUnit: string | null
}

let _cache: BmPricesResponse | null = null;
let _cacheAt = 0;
const CACHE_TTL = 1_800_000; // 30 min — aligns with SP boundary

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

function toLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// /datasets/BOD caps the window at 1 hour; the /stream variant accepts a whole
// day when filtered by unit, so one request covers every BESS BMU (~5MB).
async function fetchBodRecords(ids: Set<string>, fromMs: number, toMs: number): Promise<BodRecord[]> {
  const unitParams = [...ids].map((id) => `bmUnit=${encodeURIComponent(id)}`).join("&");
  const res = await fetch(
    `${ELEXON_BASE}/datasets/BOD/stream?from=${new Date(fromMs).toISOString()}&to=${new Date(toMs).toISOString()}&${unitParams}`,
    { cache: "no-store", headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`BOD ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : json?.data ?? [];
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

// Per SP: fleet-average offer (pairId 1, excl. ≥9000 sentinels) and bid
// (pairId -1, excl. |bid| ≥5000), one entry per (BMU, pairId), sorted by time.
export function aggregateBod(records: BodRecord[], bessBmus: Set<string>): BmPricePoint[] {
  const bySp = new Map<string, { offers: number[]; bids: number[]; seen: Set<string> }>();

  for (const r of records) {
    if (!r.nationalGridBmUnit || !bessBmus.has(r.nationalGridBmUnit)) continue;
    if (!bySp.has(r.timeFrom)) bySp.set(r.timeFrom, { offers: [], bids: [], seen: new Set() });
    const sp = bySp.get(r.timeFrom)!;

    const dedupeKey = `${r.nationalGridBmUnit}|${r.pairId}`;
    if (sp.seen.has(dedupeKey)) continue;
    sp.seen.add(dedupeKey);

    if (r.pairId === 1 && r.offer < 9000) sp.offers.push(r.offer);
    if (r.pairId === -1 && Math.abs(r.bid) < 5000) sp.bids.push(r.bid);
  }

  return [...bySp.entries()]
    .filter(([, sp]) => sp.offers.length || sp.bids.length)
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([timeFrom, { offers, bids }]) => ({
      time: toLocalTime(timeFrom),
      avgOffer: mean(offers),
      avgBid: mean(bids),
      unitCount: Math.max(offers.length, bids.length),
    }));
}

export async function fetchBmPrices(): Promise<BmPricesResponse> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;

  const bessBmus = await fetchBessBmuIds();
  const now = Date.now();
  const [dayStart] = londonDayBounds(londonDateStr(new Date(now)));

  let records: BodRecord[];
  try {
    records = await fetchBodRecords(bessBmus, dayStart, now);
  } catch (err) {
    console.error("[BM prices] BOD fetch failed:", err);
    return { data: [] }; // not cached — retry on next request
  }

  _cache = { data: aggregateBod(records, bessBmus) };
  _cacheAt = Date.now();
  return _cache;
}
