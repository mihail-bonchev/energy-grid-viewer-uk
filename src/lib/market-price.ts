import { londonDateStr, londonDayBounds } from "./time";

export interface MarketPricePoint {
  time: string   // "HH:MM" London time (SP start)
  price: number  // £/MWh
}

export interface MarketPriceResponse {
  data: MarketPricePoint[]
  meta: { provider: string }
}

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";
// APXMIDP (EPEX) carries the traded volume; N2EXMIDP rows are published with zero volume.
const PROVIDER = "APXMIDP";

function toLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// Elexon Market Index Price per settlement period for today (London day).
export async function fetchMarketIndexPrice(): Promise<MarketPriceResponse> {
  const now = new Date();
  const [dayStart] = londonDayBounds(londonDateStr(now));

  const res = await fetch(
    `${ELEXON_BASE}/balancing/pricing/market-index?from=${new Date(dayStart).toISOString()}&to=${now.toISOString()}&dataProviders=${PROVIDER}&format=json`,
    { cache: "no-store", headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Market index ${res.status}`);
  const json = await res.json();

  const rows: Array<{ startTime: string; price: number; volume: number; dataProvider: string }> = json?.data ?? [];
  const data = rows
    .filter((r) => r.dataProvider === PROVIDER && r.volume > 0)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .map((r) => ({ time: toLocalTime(r.startTime), price: Math.round(r.price * 100) / 100 }));

  return { data, meta: { provider: PROVIDER } };
}
