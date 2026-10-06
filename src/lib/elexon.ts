import { fetchBessUnits, groupBoalf, boalfSeries, siteIdOf } from "./bmu";
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

// ─── Per-unit bidirectional time-series (shared by PN and BOALF) ─────────────

export async function fetchBessBmuIds(): Promise<Set<string>> {
  return new Set((await fetchBessUnits()).map((u) => u.id));
}

// Shared builder: fetches `dataset` (PN or BOALF) for a London day (defaults to today),
// filters to BESS BMUs, and produces a 5-min fleet-level time series.
async function fetchBessTimeSeries(dataset: "PN" | "BOALF", dateStr?: string): Promise<StorageDataPoint[]> {
  const now = new Date();
  const targetDate = dateStr ?? londonDateStr(now);
  const [dayStart, dayEnd] = londonDayBounds(targetDate);
  const startMs = dayStart;
  const endMs = Math.min(now.getTime(), dayEnd - 1);
  const from = new Date(startMs).toISOString();
  const to = new Date(endMs).toISOString();

  const [bessBmus, res] = await Promise.all([
    fetchBessBmuIds(),
    fetch(`${ELEXON_BASE}/datasets/${dataset}?from=${from}&to=${to}&format=json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }),
  ]);

  if (!res.ok) throw new Error(`${dataset} ${res.status}`);

  const json = await res.json();
  const byBmu = groupBoalf(json?.data ?? [], (id) => bessBmus.has(id));

  if (!byBmu.size) throw new Error(`No ${dataset} records for BESS units`);

  console.log(`[${dataset}] ${[...byBmu.values()].reduce((n, r) => n + r.length, 0)} records across ${byBmu.size} BESS BMUs`);

  return boalfSeries(byBmu, startMs, endMs).map(({ time, mw }) => ({ time, battery: mw, pumped: 0, total: mw }));
}

// Fetch a single site's BOALF time series for a given date. Filters by site ID (BMU minus "-N").
export async function fetchSiteTimeSeries(dateStr: string, siteId: string): Promise<StorageDataPoint[]> {
  const [startMs, dayEnd] = londonDayBounds(dateStr);
  const endMs = Math.min(Date.now(), dayEnd - 1);
  const from = new Date(startMs).toISOString();
  const to   = new Date(endMs).toISOString();

  const res = await fetch(`${ELEXON_BASE}/datasets/BOALF?from=${from}&to=${to}&format=json`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BOALF ${res.status}`);

  const json = await res.json();
  const byBmu = groupBoalf(json?.data ?? [], (id) => siteIdOf(id) === siteId);
  if (!byBmu.size) return [];

  return boalfSeries(byBmu, startMs, endMs).map(({ time, mw }) => ({ time, battery: mw, pumped: 0, total: mw }));
}

// Fetch BESS data for a specific London date (YYYY-MM-DD). Uses BOALF only.
export async function fetchStorageDataForDate(dateStr: string): Promise<StorageDataPoint[]> {
  try {
    return await fetchBessTimeSeries("BOALF", dateStr);
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

// Priority: PN (operator plans, best charging signal) → BOALF (SO dispatch) → FUELINST (aggregate, no BESS charging)
export async function fetchStorageData(): Promise<{ data: StorageDataPoint[]; source: ApiResponse["meta"]["source"] }> {
  let fuelInstPoints: StorageDataPoint[] | null = null;

  // Try PN first — captures both merchant and BM-dispatched operator intentions
  try {
    const [pnPoints, fuelInst] = await Promise.all([
      fetchBessTimeSeries("PN"),
      fetchElexonFuelInst(),
    ]);
    fuelInstPoints = fuelInst;
    return { data: mergeFuelInst(pnPoints, fuelInst), source: "pn" };
  } catch (pnErr) {
    console.error("[Elexon] PN failed, trying BOALF:", pnErr);
  }

  // Fallback to BOALF — SO-dispatched instructions only
  try {
    const [boalfPoints, fuelInst] = await Promise.all([
      fetchBessTimeSeries("BOALF"),
      fuelInstPoints ? Promise.resolve(fuelInstPoints) : fetchElexonFuelInst(),
    ]);
    fuelInstPoints = fuelInst;
    return { data: mergeFuelInst(boalfPoints, fuelInst), source: "boalf" };
  } catch (boalfErr) {
    console.error("[Elexon] BOALF failed, falling back to FUELINST:", boalfErr);
  }

  // Final fallback — FUELINST aggregate (BESS charging invisible)
  const data = fuelInstPoints ?? (await fetchElexonFuelInst());
  return { data, source: "fuelinst" };
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
