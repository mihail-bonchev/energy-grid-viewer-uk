import { londonDateStr } from "./time";

export interface SystemPricePoint {
  time: string   // "HH:MM" London time (SP start)
  price: number  // System Sell Price £/MWh (single imbalance price — SSP = SBP almost always)
  sbp: number    // System Buy Price £/MWh
  niv: number    // Net Imbalance Volume MWh — positive = system short, negative = long
}

export interface SystemPricesResponse {
  data: SystemPricePoint[]
  meta: { settlementDate: string }
}

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

function toLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// Elexon imbalance (system) prices for today's settlement date. Each SP is
// published ~20 min after it ends; these are initial values that later
// settlement runs may revise.
export async function fetchSystemPrices(): Promise<SystemPricesResponse> {
  const settlementDate = londonDateStr();

  const res = await fetch(
    `${ELEXON_BASE}/balancing/settlement/system-prices/${settlementDate}?format=json`,
    { cache: "no-store", headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`System prices ${res.status}`);
  const json = await res.json();

  const rows: Array<{
    startTime: string;
    settlementPeriod: number;
    systemSellPrice: number;
    systemBuyPrice: number;
    netImbalanceVolume: number;
  }> = json?.data ?? [];

  const data = [...rows]
    .sort((a, b) => a.settlementPeriod - b.settlementPeriod)
    .map((r) => ({
      time: toLocalTime(r.startTime),
      price: Math.round(r.systemSellPrice * 100) / 100,
      sbp: Math.round(r.systemBuyPrice * 100) / 100,
      niv: Math.round(r.netImbalanceVolume),
    }));

  return { data, meta: { settlementDate } };
}
