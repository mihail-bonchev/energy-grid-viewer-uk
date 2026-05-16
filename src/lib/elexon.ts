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
}

export interface ApiResponse {
  data: StorageDataPoint[];
  meta: {
    source: "boalf" | "fuelinst" | "mock";
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

    const bRounded = Math.round(battery);
    const pRounded = Math.round(pumped);
    points.push({
      time: t.toISOString(),
      battery: bRounded,
      pumped: pRounded,
      total: bRounded + pRounded,
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
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

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

    points.push({
      time,
      battery: Math.round(Number(battery)),
      pumped: Math.round(Number(pumped)),
      total: Math.round(Number(battery) + Number(pumped)),
    });
  }

  return points.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

// ─── Per-unit bidirectional time-series (shared by PN and BOALF) ─────────────

interface BmLevelRecord {
  nationalGridBmUnit?: string;
  bmUnit?: string;         // some endpoints use this instead
  levelFrom: number;
  timeFrom: string;
}

// Module-level cache: avoids re-fetching 2.7MB BMU list on every request.
// Next.js fetch cache rejects items over 2MB, so we cache the filtered Set ourselves.
let _bessBmuCache: Set<string> | null = null;
let _bessBmuCacheAt = 0;
const BMU_CACHE_TTL = 3_600_000; // 1 hour

export async function fetchBessBmuIds(): Promise<Set<string>> {
  if (_bessBmuCache && Date.now() - _bessBmuCacheAt < BMU_CACHE_TTL) {
    return _bessBmuCache;
  }
  const res = await fetch(`${ELEXON_BASE}/reference/bmunits/all?format=json`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BMU reference ${res.status}`);
  const json = await res.json();
  const all: Record<string, unknown>[] = json?.data ?? json ?? [];
  const ids = new Set<string>();
  for (const u of all) {
    const type = String(u.bmUnitType ?? "");
    const fuel = String(u.fuelType ?? "");
    const genCap = parseFloat(String(u.generationCapacity ?? "0"));
    const demCap = Math.abs(parseFloat(String(u.demandCapacity ?? "0")));
    if (type === "S" || (fuel === "OTHER" && (genCap > 0.1 || demCap > 0.1))) {
      const ngId = String(u.nationalGridBmUnit ?? "");
      if (ngId) ids.add(ngId);
    }
  }
  _bessBmuCache = ids;
  _bessBmuCacheAt = Date.now();
  return ids;
}

// Shared builder: fetches `dataset` (PN or BOALF) for a given date (defaults to today),
// filters to BESS BMUs, and produces a 5-min fleet-level time series.
async function fetchBessTimeSeries(dataset: "PN" | "BOALF", dateStr?: string): Promise<StorageDataPoint[]> {
  const now = new Date();
  const targetDate = dateStr ?? now.toISOString().split("T")[0];
  const isToday = targetDate === now.toISOString().split("T")[0];
  const from = `${targetDate}T00:00Z`;
  const to = isToday ? now.toISOString() : `${targetDate}T23:59:59Z`;

  const [bessBmus, res] = await Promise.all([
    fetchBessBmuIds(),
    fetch(`${ELEXON_BASE}/datasets/${dataset}?from=${from}&to=${to}&format=json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }),
  ]);

  if (!res.ok) throw new Error(`${dataset} ${res.status}`);

  const json = await res.json();
  const allRecords: BmLevelRecord[] = json?.data ?? [];

  // Normalise: some endpoints return nationalGridBmUnit, others only bmUnit
  type NormRecord = { bmuId: string; levelFrom: number; timeFrom: string };
  const records: NormRecord[] = allRecords
    .map((r) => ({ bmuId: r.nationalGridBmUnit ?? r.bmUnit ?? "", levelFrom: r.levelFrom, timeFrom: r.timeFrom }))
    .filter((r) => r.bmuId && bessBmus.has(r.bmuId));

  if (!records.length) throw new Error(`No ${dataset} records for BESS units`);

  console.log(`[${dataset}] ${records.length} records across ${new Set(records.map(r => r.bmuId)).size} BESS BMUs`);

  // Group by BMU, sort by timeFrom ascending
  const byBmu = new Map<string, NormRecord[]>();
  for (const r of records) {
    if (!byBmu.has(r.bmuId)) byBmu.set(r.bmuId, []);
    byBmu.get(r.bmuId)!.push(r);
  }
  for (const recs of byBmu.values()) {
    recs.sort((a, b) => new Date(a.timeFrom).getTime() - new Date(b.timeFrom).getTime());
  }

  // Build 5-min slots from midnight to end of target period
  const startMs = new Date(`${targetDate}T00:00:00Z`).getTime();
  const endMs = isToday ? now.getTime() : new Date(`${targetDate}T23:59:59Z`).getTime();
  const slots: number[] = [];
  for (let t = startMs; t <= endMs; t += 5 * 60 * 1000) slots.push(t);

  return slots.map((slotMs) => {
    let battery = 0;
    for (const recs of byBmu.values()) {
      let mw = 0;
      for (const r of recs) {
        if (new Date(r.timeFrom).getTime() <= slotMs) mw = r.levelFrom;
        else break;
      }
      battery += mw;
    }
    return {
      time: new Date(slotMs).toISOString(),
      battery: Math.round(battery),
      pumped: 0,
      total: Math.round(battery),
    };
  });
}

// Fetch BESS data for a specific historical date (YYYY-MM-DD). Uses BOALF only.
export async function fetchStorageDataForDate(dateStr: string): Promise<StorageDataPoint[]> {
  try {
    return await fetchBessTimeSeries("BOALF", dateStr);
  } catch {
    return [];
  }
}

// Priority: PN (operator plans, best charging signal) → BOALF (SO dispatch) → FUELINST (aggregate, no BESS charging)
export async function fetchStorageData(): Promise<{ data: StorageDataPoint[]; source: "boalf" | "fuelinst" | "mock" }> {
  let fuelInstPoints: StorageDataPoint[] | null = null;

  const mergeWithPumped = (bmPoints: StorageDataPoint[], fuelInst: StorageDataPoint[]) => {
    const pumpedByMinute = new Map<string, number>();
    for (const p of fuelInst) pumpedByMinute.set(p.time.substring(0, 16), p.pumped);
    return bmPoints.map((p: StorageDataPoint) => {
      const pumped = pumpedByMinute.get(p.time.substring(0, 16)) ?? 0;
      return { time: p.time, battery: p.battery, pumped, total: p.battery + pumped };
    });
  };

  // Try PN first — captures both merchant and BM-dispatched operator intentions
  try {
    const [pnPoints, fuelInst] = await Promise.all([
      fetchBessTimeSeries("PN"),
      fetchElexonFuelInst(),
    ]);
    fuelInstPoints = fuelInst;
    return { data: mergeWithPumped(pnPoints, fuelInst), source: "boalf" };
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
    return { data: mergeWithPumped(boalfPoints, fuelInst), source: "boalf" };
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
