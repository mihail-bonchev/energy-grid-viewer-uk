import { fetchBessUnits, fetchPhysicalLevels, physicalSeries, siteIdOf } from "./bmu";
import { londonDateStr, londonDayBounds } from "./time";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FuelInstRecord {
  startTime: string;
  settlementDate: string;
  settlementPeriod: number;
  ccgt: number;
  oil: number;
  coal: number;
  nuclear: number;
  wind: number;
  ps: number;       // pumped storage
  npshyd: number;   // non-pumped storage hydro
  ocgt: number;
  other: number;    // includes BESS at transmission level
  intfr: number;
  intirl: number;
  intned: number;
  intew: number;
  intnem: number;
  intifa2: number;
  battery?: number; // newer field when available
}

export interface StorageDataPoint {
  time: string;
  battery: number;  // MW — positive = discharging, negative = charging
  pumped: number;   // MW pumped hydro storage
  total: number;    // combined storage
  wind?: number;    // MW wind generation (FUELINST WIND field)
  solar?: number;   // MW solar generation (FUELINST SOLAR field)
}

export interface ApiResponse {
  data: StorageDataPoint[];
  meta: {
    source: "pn" | "boalf" | "fuelinst" | "mock";
    lastUpdated: string;
    count: number;
  };
}

// ─── Mock data generator ─────────────────────────────────────────────────────

export function generateMockData(hours = 24): StorageDataPoint[] {
  const now = new Date();
  const points: StorageDataPoint[] = [];
  const totalPoints = hours * 12; // 5-min intervals

  for (let i = totalPoints - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 5 * 60 * 1000);
    const hour = t.getHours() + t.getMinutes() / 60;
    const noise = () => (Math.random() - 0.5) * 200;

    // Realistic UK BESS pattern
    let battery: number;
    let pumped: number;

    if (hour >= 0 && hour < 3) {
      battery = -900 + noise();   // cheap overnight charging
      pumped = -400 + noise() * 0.5;
    } else if (hour >= 3 && hour < 6) {
      battery = -600 + noise();
      pumped = -200 + noise() * 0.5;
    } else if (hour >= 6 && hour < 9) {
      battery = 600 + noise();    // morning peak discharge
      pumped = 800 + noise();
    } else if (hour >= 9 && hour < 12) {
      battery = -300 + noise();   // charging as solar ramps up
      pumped = 100 + noise() * 0.5;
    } else if (hour >= 12 && hour < 15) {
      battery = -700 + noise();   // peak solar, heavy charging
      pumped = -300 + noise() * 0.5;
    } else if (hour >= 15 && hour < 17) {
      battery = 400 + noise();
      pumped = 600 + noise();
    } else if (hour >= 17 && hour < 21) {
      battery = 1400 + noise();   // evening peak — max discharge
      pumped = 1200 + noise();
    } else if (hour >= 21 && hour < 23) {
      battery = 200 + noise();
      pumped = 0 + noise() * 0.3;
    } else {
      battery = -500 + noise();
      pumped = -300 + noise() * 0.5;
    }

    // Solar: bell curve peaking ~13:00; zero at night
    let solar = 0;
    if (hour >= 6 && hour < 20) {
      solar = Math.round(8000 * Math.exp(-0.5 * Math.pow((hour - 13) / 3.5, 2)) + (Math.random() - 0.5) * 600);
      solar = Math.max(0, solar);
    }
    // Wind: variable base ~8 GW with slow sinusoidal drift
    const wind = Math.round(Math.max(500, 8000 + 3500 * Math.sin(hour * 0.4) + (Math.random() - 0.5) * 2000));

    const bRounded = Math.round(battery);
    const pRounded = Math.round(pumped);
    points.push({
      time: t.toISOString(),
      battery: bRounded,
      pumped: pRounded,
      total: bRounded + pRounded,
      wind,
      solar,
    });
  }
  return points;
}

// ─── Elexon API fetcher (server-side) ────────────────────────────────────────

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

// Long-format record as actually returned by the API
interface FuelInstLongRecord {
  dataset: string;
  publishTime: string;
  startTime: string;
  settlementDate: string;
  settlementPeriod: number;
  fuelType: string;
  generation: number;
}

export async function fetchElexonFuelInst(): Promise<StorageDataPoint[]> {
  const todayStr = londonDateStr();

  const url = `${ELEXON_BASE}/datasets/FUELINST?settlementDateFrom=${todayStr}&settlementDateTo=${todayStr}&format=json`;

  const res = await fetch(url, {
    next: { revalidate: 300 },
    headers: { Accept: "application/json" },
  });

  if (!res.ok) throw new Error(`Elexon API error: ${res.status} ${res.statusText}`);

  const json = await res.json();
  const records: FuelInstLongRecord[] = json?.data ?? [];

  if (!records.length) throw new Error("No records returned");

  // API returns long format: one row per (startTime, fuelType).
  // Group by startTime, then pick out BATTERY and PS fuel types.
  const byTime = new Map<string, Map<string, number>>();

  for (const r of records) {
    if (!byTime.has(r.startTime)) byTime.set(r.startTime, new Map());
    byTime.get(r.startTime)!.set(r.fuelType.toUpperCase(), r.generation ?? 0);
  }

  // Log available fuel types from the first timestamp (helps debugging)
  const firstEntry = byTime.values().next().value;
  if (firstEntry) {
    console.log("[Elexon] Available fuelTypes:", [...firstEntry.keys()].join(", "));
  }

  const points: StorageDataPoint[] = [];

  for (const [time, fuels] of byTime.entries()) {
    // FUELINST uses "OTHER" for BESS + misc (confirmed from live API fuelTypes)
    const battery = fuels.get("OTHER") ?? 0;

    // "PS" = pumped storage hydro (distinct from "NPSHYD" = non-pumped hydro)
    const pumped = fuels.get("PS") ?? 0;

    const wind = fuels.get("WIND") ?? 0;
    const solar = fuels.get("SOLAR") ?? 0;

    points.push({
      time,
      battery: Math.round(Number(battery)),
      pumped: Math.round(Number(pumped)),
      total: Math.round(Number(battery) + Number(pumped)),
      wind: Math.round(Number(wind)),
      solar: Math.round(Number(solar)),
    });
  }

  return points.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

// ─── Per-unit bidirectional time-series (PN with BOALF overrides) ────────────

export async function fetchBessBmuIds(): Promise<Set<string>> {
  return new Set((await fetchBessUnits()).map((u) => u.id));
}

// 5-min BESS series for a London day (defaults to today, up to now), optionally
// limited to one site. Physical estimate per unit = BOALF if in force, else PN.
async function fetchBessSeries(dateStr?: string, siteId?: string): Promise<{ points: StorageDataPoint[]; source: "pn" | "boalf" }> {
  const now = Date.now();
  const [startMs, dayEnd] = londonDayBounds(dateStr ?? londonDateStr(new Date(now)));
  const endMs = Math.min(now, dayEnd - 1);

  const ids = (await fetchBessUnits())
    .map((u) => u.id)
    .filter((id) => !siteId || siteIdOf(id) === siteId);
  if (!ids.length) return { points: [], source: "pn" };

  const { pn, boalf, source } = await fetchPhysicalLevels(startMs, endMs, ids);
  console.log(`[BESS] ${source.toUpperCase()}: PN ${pn.size} BMUs, BOALF ${boalf.size} BMUs`);

  const points = physicalSeries(pn, boalf, startMs, endMs)
    .map(({ time, mw }) => ({ time, battery: mw, pumped: 0, total: mw }));
  return { points, source };
}

// Fetch a single site's series for a London date. Site ID = BMU minus "-N".
export async function fetchSiteTimeSeries(dateStr: string, siteId: string): Promise<StorageDataPoint[]> {
  return (await fetchBessSeries(dateStr, siteId)).points;
}

// Fetch BESS data for a specific London date (YYYY-MM-DD).
export async function fetchStorageDataForDate(dateStr: string): Promise<StorageDataPoint[]> {
  try {
    return (await fetchBessSeries(dateStr)).points;
  } catch {
    return [];
  }
}

// Merge FUELINST pumped/wind/solar into BM-unit points. FUELINST lags BOALF by a
// few minutes, so each point takes the latest FUELINST row at or before its time
// (forward-fill) rather than dropping to 0 where no exact HH:MM match exists.
export function mergeFuelInst(bmPoints: StorageDataPoint[], fuelInst: StorageDataPoint[]): StorageDataPoint[] {
  const sorted = [...fuelInst].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  let i = -1;
  return bmPoints.map((p) => {
    const t = Date.parse(p.time);
    while (i + 1 < sorted.length && Date.parse(sorted[i + 1].time) <= t) i++;
    const f = i >= 0 ? sorted[i] : null;
    const pumped = f?.pumped ?? 0;
    return { time: p.time, battery: p.battery, pumped, total: p.battery + pumped, wind: f?.wind ?? 0, solar: f?.solar ?? 0 };
  });
}

// Priority: PN with BOALF overrides → BOALF only → FUELINST aggregate (no BESS charging).
// FUELINST also supplies pumped hydro and wind, so it is fetched in parallel; if it
// fails the BESS series is still returned with pumped/wind = 0.
export async function fetchStorageData(): Promise<{ data: StorageDataPoint[]; source: ApiResponse["meta"]["source"] }> {
  const [bess, fuelInst] = await Promise.allSettled([fetchBessSeries(), fetchElexonFuelInst()]);

  if (bess.status === "fulfilled" && bess.value.points.length) {
    if (fuelInst.status === "rejected") console.error("[Elexon] FUELINST failed:", fuelInst.reason);
    const fuel = fuelInst.status === "fulfilled" ? fuelInst.value : [];
    return { data: mergeFuelInst(bess.value.points, fuel), source: bess.value.source };
  }

  if (bess.status === "rejected") console.error("[Elexon] PN and BOALF failed, falling back to FUELINST:", bess.reason);
  if (fuelInst.status === "fulfilled") return { data: fuelInst.value, source: "fuelinst" };
  throw fuelInst.reason;
}

// ─── Formatting utils ─────────────────────────────────────────────────────────

export function fmtMW(mw: number | null | undefined): string {
  if (mw === null || mw === undefined) return "—";
  const abs = Math.abs(mw);
  if (abs >= 1000) return `${(mw / 1000).toFixed(2)} GW`;
  return `${Math.round(mw)} MW`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getStatus(mw: number): {
  label: string;
  color: string;
  icon: string;
} {
  if (mw > 50) return { label: "DISCHARGING", color: "#00ffb3", icon: "▲" };
  if (mw < -50) return { label: "CHARGING", color: "#60a5fa", icon: "▼" };
  return { label: "IDLE", color: "rgba(255,255,255,0.4)", icon: "●" };
}
