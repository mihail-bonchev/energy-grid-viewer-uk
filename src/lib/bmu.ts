// ─── BESS unit reference data (shared by elexon.ts, sites.ts, /api/units) ────

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

export interface BessUnit {
  id: string;          // nationalGridBmUnit, e.g. "PILLB-1" (no E_/T_ prefix)
  elexonId: string;    // elexonBmUnit, e.g. "E_PILLB-1"
  name: string;        // human-readable site name
  rawName: string;     // bmUnitName as published
  operator: string;
  region: string;      // gspGroupName
  bmUnitType: string;
  capacityMW: number;
  fpnFlag: boolean;
}

// Fuel types that are definitely not battery storage. BESS units are published
// with fuelType "OTHER" or null, so anything else is excluded outright.
const NON_BESS_FUELS = new Set(["WIND", "CCGT", "OCGT", "NUCLEAR", "COAL", "BIOMASS", "NPSHYD", "PS", "OIL"]);

// National Grid IDs for batteries follow a "<site code>B-<n>" convention
// (PILLB-1 Pillswood, SANDB-1 Sheaf, KILSB-3 Kilmarnock South …).
const BESS_ID = /^[A-Z0-9]{3,5}B-\d+$/i;
const BESS_NAME = /batter|bess|storage/i;

// Note: bmUnitType "S" means *supplier* BMU (VPPs, aggregators, wind) — not storage.
export function isBessUnit(u: Record<string, unknown>): boolean {
  const type = String(u.bmUnitType ?? "");
  const fuel = String(u.fuelType ?? "");
  if (type === "I" || fuel.startsWith("INT") || NON_BESS_FUELS.has(fuel)) return false;
  return BESS_NAME.test(String(u.bmUnitName ?? "")) || BESS_ID.test(String(u.nationalGridBmUnit ?? ""));
}

// Physical site ID: strip the trailing "-N" unit number ("KILSB-3" → "KILSB").
export function siteIdOf(bmuId: string): string {
  return bmuId.replace(/-\d+$/, "");
}

// Names for sites whose published bmUnitName is just a code. Each is
// evidenced by the unit's lead party name in the Elexon reference data.
export const SITE_NAMES: Record<string, string> = {
  BLHLB: "Blackhillock",
  KILSB: "Kilmarnock South",
  THURB: "Thurrock",
  COALB: "Coalburn",
  PINFB: "Capenhurst (Zenobe)",
  HOLMB: "Holmston",
};

// Human-readable site name: curated name, else cleaned bmUnitName, else the site ID.
export function siteDisplayName(siteId: string, bmUnitName: string | null | undefined): string {
  if (SITE_NAMES[siteId]) return SITE_NAMES[siteId];
  const raw = String(bmUnitName ?? "").trim();
  // Codes like "T_BLHLB-1", "2__GCMRO001", "V__HFEEL002" carry no name
  if (!raw || /^(T_|E_|2__|V__|C__)/.test(raw)) return siteId;
  return raw
    .replace(/\s+(BMU-?|Unit\s*)?\d+$/i, "")   // "Ferrybridge BESS BMU-1"
    .replace(/\s\d\s/, " ")                       // "Jamesfield 1 Battery Storage"
    .replace(/_/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Module-level cache: the reference endpoint is ~2.2MB — too close to the
// Next.js fetch-cache 2MB limit — so we cache the filtered list ourselves.
let _cache: BessUnit[] | null = null;
let _cacheAt = 0;
const CACHE_TTL = 3_600_000; // 1 hour

export async function fetchBessUnits(): Promise<BessUnit[]> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;

  const res = await fetch(`${ELEXON_BASE}/reference/bmunits/all?format=json`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BMU reference ${res.status}`);
  const json = await res.json();
  const all: Record<string, unknown>[] = json?.data ?? json ?? [];

  const units: BessUnit[] = [];
  for (const u of all) {
    const id = String(u.nationalGridBmUnit ?? "");
    if (!id || !isBessUnit(u)) continue;
    const genCap = parseFloat(String(u.generationCapacity ?? "0")) || 0;
    const demCap = Math.abs(parseFloat(String(u.demandCapacity ?? "0")) || 0);
    units.push({
      id,
      elexonId: String(u.elexonBmUnit ?? ""),
      name: siteDisplayName(siteIdOf(id), u.bmUnitName as string | null),
      rawName: String(u.bmUnitName ?? id),
      operator: String(u.leadPartyName ?? "Unknown"),
      region: String(u.gspGroupName ?? "Unknown"),
      bmUnitType: String(u.bmUnitType ?? ""),
      capacityMW: Math.round(Math.max(genCap, demCap) * 10) / 10,
      fpnFlag: Boolean(u.fpnFlag),
    });
  }

  _cache = units;
  _cacheAt = Date.now();
  return units;
}

// ─── BOALF level reconstruction ──────────────────────────────────────────────

export interface BoalfRecord {
  timeFrom: string;
  timeTo: string;
  levelFrom: number;
  levelTo: number;
  acceptanceNumber: number;
}

// BM-instructed level at time `t` (ms). Each BOALF row is a linear segment over
// [timeFrom, timeTo); where acceptances overlap, the latest acceptance wins.
// Outside every segment there is no instruction in force → 0 MW.
export function boalfLevelAt(recs: BoalfRecord[], t: number): number {
  let best: BoalfRecord | null = null;
  let bestFrom = 0;
  for (const r of recs) {
    const from = Date.parse(r.timeFrom);
    const to = Date.parse(r.timeTo);
    if (!(from <= t && t < to)) continue;
    if (!best || r.acceptanceNumber > best.acceptanceNumber ||
        (r.acceptanceNumber === best.acceptanceNumber && from > bestFrom)) {
      best = r;
      bestFrom = from;
    }
  }
  if (!best) return 0;
  const to = Date.parse(best.timeTo);
  const frac = (t - bestFrom) / (to - bestFrom);
  return best.levelFrom + (best.levelTo - best.levelFrom) * frac;
}

// Fleet/site total per 5-min slot between startMs and endMs (inclusive).
export function boalfSeries(byBmu: Map<string, BoalfRecord[]>, startMs: number, endMs: number): Array<{ time: string; mw: number }> {
  const out: Array<{ time: string; mw: number }> = [];
  for (let t = startMs; t <= endMs; t += 5 * 60 * 1000) {
    let mw = 0;
    for (const recs of byBmu.values()) mw += boalfLevelAt(recs, t);
    out.push({ time: new Date(t).toISOString(), mw: Math.round(mw) });
  }
  return out;
}

type RawBoalf = Partial<BoalfRecord> & { nationalGridBmUnit?: string | null; bmUnit?: string | null };

// Normalise raw BOALF rows (nationalGridBmUnit vs bmUnit) and group by BMU,
// keeping only rows for which `keep(bmuId)` is true.
export function groupBoalf(rows: RawBoalf[], keep: (bmuId: string) => boolean): Map<string, BoalfRecord[]> {
  const byBmu = new Map<string, BoalfRecord[]>();
  for (const r of rows) {
    // bmUnit is the Elexon ID ("E_WHTBB-1"); strip its prefix to get the NG ID
    const id = r.nationalGridBmUnit ?? (r.bmUnit ?? "").replace(/^[TE]_/, "");
    if (!id || !keep(id) || !r.timeFrom || !r.timeTo) continue;
    if (!byBmu.has(id)) byBmu.set(id, []);
    byBmu.get(id)!.push({
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
      levelFrom: r.levelFrom ?? 0,
      levelTo: r.levelTo ?? r.levelFrom ?? 0,
      acceptanceNumber: r.acceptanceNumber ?? 0,
    });
  }
  return byBmu;
}
