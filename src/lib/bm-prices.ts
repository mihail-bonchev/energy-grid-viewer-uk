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

export async function fetchBmPrices(): Promise<BmPricesResponse> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;

  const bessBmus = await fetchBessBmuIds();
  const now = new Date();
  const [dayStart] = londonDayBounds(londonDateStr(now));

  // /datasets/BOD caps the window at 1 hour; the /stream variant accepts a whole
  // day when filtered by unit, so one request covers every BESS BMU (~5MB).
  const unitParams = [...bessBmus].map((id) => `bmUnit=${encodeURIComponent(id)}`).join("&");
  let records: BodRecord[] = [];
  try {
    const res = await fetch(
      `${ELEXON_BASE}/datasets/BOD/stream?from=${new Date(dayStart).toISOString()}&to=${now.toISOString()}&${unitParams}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`BOD ${res.status}`);
    const json = await res.json();
    records = Array.isArray(json) ? json : json?.data ?? [];
  } catch (err) {
    console.error("[BM prices] BOD fetch failed:", err);
    return { data: [] }; // not cached — retry on next request
  }

  // Aggregate per SP: fleet-avg offer (pairId=1) and bid (pairId=-1), deduplicated per BMU
  const spMap = new Map<string, { offers: number[]; bids: number[]; seen: Set<string> }>();

  for (const r of records) {
    if (!r.nationalGridBmUnit || !bessBmus.has(r.nationalGridBmUnit)) continue;

    const key = r.timeFrom;
    if (!spMap.has(key)) spMap.set(key, { offers: [], bids: [], seen: new Set() });
    const sp = spMap.get(key)!;

    // Deduplicate: one price entry per (bmu, pairId) per SP
    const dedupeKey = `${r.nationalGridBmUnit}|${r.pairId}`;
    if (sp.seen.has(dedupeKey)) continue;
    sp.seen.add(dedupeKey);

    if (r.pairId === 1 && r.offer < 9000) sp.offers.push(r.offer);
    if (r.pairId === -1 && Math.abs(r.bid) < 5000) sp.bids.push(r.bid);
  }

  const data: BmPricePoint[] = [];
  const spTimes = [...spMap.keys()].sort((a, b) => Date.parse(a) - Date.parse(b));
  for (const timeFrom of spTimes) {
    const { offers, bids } = spMap.get(timeFrom)!;
    if (!offers.length && !bids.length) continue;
    const unitCount = Math.max(offers.length, bids.length);
    data.push({
      time: toLocalTime(timeFrom),
      avgOffer: offers.length
        ? Math.round(offers.reduce((a, b) => a + b, 0) / offers.length)
        : 0,
      avgBid: bids.length
        ? Math.round(bids.reduce((a, b) => a + b, 0) / bids.length)
        : 0,
      unitCount,
    });
  }


  _cache = { data };
  _cacheAt = Date.now();
  return _cache;
}
