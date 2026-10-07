import { londonDateStr, londonDayBounds } from "./time";

export interface FrequencyPoint {
  time: string // ISO measurement time (15-second resolution)
  hz: number
}

export interface FrequencyStats {
  current: FrequencyPoint | null
  min: FrequencyPoint | null
  max: FrequencyPoint | null
  pctOutside: number // % of today's readings outside the ±0.2 Hz operational limits (1 dp)
  outside: number    // count of those readings
  readings: number
}

export interface FrequencyResponse {
  data: FrequencyPoint[]  // last hour only, for the chart
  stats: FrequencyStats   // over the whole London day so far
}

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

export const NOMINAL_HZ = 50;
export const OPERATIONAL_LIMIT_HZ = 0.2; // NESO keeps frequency within 49.8–50.2 Hz in normal operation
export const LOW_LIMIT_HZ = NOMINAL_HZ - OPERATIONAL_LIMIT_HZ;  // 49.8
export const HIGH_LIMIT_HZ = NOMINAL_HZ + OPERATIONAL_LIMIT_HZ; // 50.2
const CHART_WINDOW_MS = 3_600_000;

// Current, lowest and highest reading, and share of readings outside the operational limits.
export function summariseFrequency(points: FrequencyPoint[]): FrequencyStats {
  if (!points.length) return { current: null, min: null, max: null, pctOutside: 0, outside: 0, readings: 0 };
  let min = points[0];
  let max = points[0];
  let outside = 0;
  for (const p of points) {
    if (p.hz < min.hz) min = p;
    if (p.hz > max.hz) max = p;
    // Compare to the limits directly: |49.8 − 50| is 0.2000000000000028 in floating point
    if (p.hz < LOW_LIMIT_HZ || p.hz > HIGH_LIMIT_HZ) outside++;
  }
  return {
    current: points[points.length - 1],
    min,
    max,
    pctOutside: Math.round((outside / points.length) * 1000) / 10,
    outside,
    readings: points.length,
  };
}

// Today's frequency (London day, up to now): stats over the whole day, chart
// data for the last hour. Elexon publishes ~90 s behind real time. Without
// from/to the endpoint returns *yesterday*, so the window is always explicit.
export async function fetchFrequency(): Promise<FrequencyResponse> {
  const now = Date.now();
  const [dayStart] = londonDayBounds(londonDateStr(new Date(now)));

  const res = await fetch(
    `${ELEXON_BASE}/system/frequency?from=${new Date(dayStart).toISOString()}&to=${new Date(now).toISOString()}&format=json`,
    { cache: "no-store", headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Frequency ${res.status}`);
  const json = await res.json();

  const rows: Array<{ measurementTime: string; frequency: number }> = json?.data ?? [];
  const points = rows
    .map((r) => ({ time: r.measurementTime, hz: r.frequency }))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

  const latest = points.length ? Date.parse(points[points.length - 1].time) : now;
  return {
    data: points.filter((p) => Date.parse(p.time) > latest - CHART_WINDOW_MS),
    stats: summariseFrequency(points),
  };
}
