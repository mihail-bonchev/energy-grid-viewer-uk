// ─── BESS unit reference data (shared by elexon.ts, sites.ts, /api/units) ────

import { GSP_NAMES } from "./bess-sites";

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

export interface BessUnit {
  id: string;          // nationalGridBmUnit, e.g. "PILLB-1" (no E_/T_ prefix)
  elexonId: string;    // elexonBmUnit, e.g. "E_PILLB-1"
  name: string;        // human-readable site name
  rawName: string;     // bmUnitName as published
  operator: string;
  region: string;      // canonical GSP group name, or "Transmission" if none
  gspGroupId: string | null;
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

function parseCapacity(value: unknown): number {
  return Math.abs(parseFloat(String(value ?? "0")) || 0);
}

// Canonical region name from the GSP group code; transmission units have none.
function regionOf(gspGroupId: string | null, gspGroupName: unknown): string {
  if (!gspGroupId) return "Transmission";
  return GSP_NAMES[gspGroupId] ?? String(gspGroupName ?? gspGroupId);
}

// Map one reference-data record to a BessUnit (caller has checked isBessUnit).
export function toBessUnit(u: Record<string, unknown>): BessUnit {
  const id = String(u.nationalGridBmUnit);
  const gsp = u.gspGroupId ? String(u.gspGroupId) : null;
  const capacity = Math.max(parseCapacity(u.generationCapacity), parseCapacity(u.demandCapacity));
  return {
    id,
    elexonId: String(u.elexonBmUnit ?? ""),
    name: siteDisplayName(siteIdOf(id), u.bmUnitName as string | null),
    rawName: String(u.bmUnitName ?? id),
    operator: String(u.leadPartyName ?? "Unknown"),
    region: regionOf(gsp, u.gspGroupName),
    gspGroupId: gsp,
    bmUnitType: String(u.bmUnitType ?? ""),
    capacityMW: Math.round(capacity * 10) / 10,
    fpnFlag: Boolean(u.fpnFlag),
  };
}

export async function fetchBessUnits(): Promise<BessUnit[]> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;

  const res = await fetch(`${ELEXON_BASE}/reference/bmunits/all?format=json`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BMU reference ${res.status}`);
  const json = await res.json();
  const all: Record<string, unknown>[] = json?.data ?? json ?? [];

  const units = all.filter((u) => u.nationalGridBmUnit && isBessUnit(u)).map(toBessUnit);
  _cache = units;
  _cacheAt = Date.now();
  return units;
}

// ─── PN / BOALF level reconstruction ─────────────────────────────────────────
// Both datasets are piecewise-linear MW levels per BMU:
//   PN    — the operator's final physical notification (merchant trading included)
//   BOALF — System Operator acceptances; levels are absolute MW, so while one is
//           in force it *replaces* the PN for that unit.
// Physical estimate per BMU = BOALF level if an acceptance is in force, else PN, else 0.

export interface BoalfRecord {
  timeFrom: string;
  timeTo: string;
  levelFrom: number;
  levelTo: number;
  acceptanceNumber: number; // 0 for PN rows
}

// Numeric form of a row — timestamps parsed once, not per slot.
interface Segment { from: number; to: number; levelFrom: number; levelTo: number; acc: number }

function toSegments(recs: BoalfRecord[]): Segment[] {
  return recs
    .map((r) => ({
      from: Date.parse(r.timeFrom),
      to: Date.parse(r.timeTo),
      levelFrom: r.levelFrom,
      levelTo: r.levelTo,
      acc: r.acceptanceNumber,
    }))
    .sort((a, b) => a.from - b.from);
}

// Among segments covering `t`, the latest acceptance wins (ties → later start);
// interpolate linearly along it. No covering segment → null.
function levelFromCandidates(cands: Iterable<Segment>, t: number): number | null {
  let best: Segment | null = null;
  for (const s of cands) {
    if (!(s.from <= t && t < s.to)) continue;
    if (!best || s.acc > best.acc || (s.acc === best.acc && s.from > best.from)) best = s;
  }
  if (!best) return null;
  return best.levelFrom + (best.levelTo - best.levelFrom) * ((t - best.from) / (best.to - best.from));
}

// Walks one BMU's sorted segments forward in time, keeping only those in force.
// `at(t)` must be called with non-decreasing t.
function sweeper(recs: BoalfRecord[] | undefined) {
  const segs = recs ? toSegments(recs) : [];
  let next = 0;
  let active: Segment[] = [];
  return (t: number): number | null => {
    while (next < segs.length && segs[next].from <= t) active.push(segs[next++]);
    active = active.filter((seg) => seg.to > t);
    return levelFromCandidates(active, t);
  };
}

// BM-instructed level at time `t` (ms). Each BOALF row is a linear segment over
// [timeFrom, timeTo); where acceptances overlap, the latest acceptance wins.
// Outside every segment there is no instruction in force → 0 MW.
export function boalfLevelAt(recs: BoalfRecord[], t: number): number {
  return levelFromCandidates(toSegments(recs), t) ?? 0;
}

// True if a BOALF acceptance is in force at `t` (even one instructing 0 MW).
export function boalfActiveAt(recs: BoalfRecord[] | undefined, t: number): boolean {
  return !!recs && levelFromCandidates(toSegments(recs), t) !== null;
}

// Physical estimate for one BMU at `t`: BOALF if in force, else PN, else 0.
export function physicalLevelAt(pn: BoalfRecord[] | undefined, boalf: BoalfRecord[] | undefined, t: number): number {
  return (boalf && levelFromCandidates(toSegments(boalf), t)) ??
    (pn && levelFromCandidates(toSegments(pn), t)) ?? 0;
}

// Fleet/site total of the physical estimate per 5-min slot in [startMs, endMs].
export function physicalSeries(
  pnByBmu: Map<string, BoalfRecord[]>,
  boalfByBmu: Map<string, BoalfRecord[]>,
  startMs: number,
  endMs: number,
): Array<{ time: string; mw: number }> {
  const ids = new Set([...pnByBmu.keys(), ...boalfByBmu.keys()]);
  const units = [...ids].map((id) => ({ pn: sweeper(pnByBmu.get(id)), boa: sweeper(boalfByBmu.get(id)) }));
  const out: Array<{ time: string; mw: number }> = [];
  for (let t = startMs; t <= endMs; t += 5 * 60 * 1000) {
    let mw = 0;
    for (const u of units) {
      // Advance both sweeps every slot so neither falls behind
      const boa = u.boa(t);
      const pn = u.pn(t);
      mw += boa ?? pn ?? 0;
    }
    out.push({ time: new Date(t).toISOString(), mw: Math.round(mw) });
  }
  return out;
}

// BOALF-only series (BM-instructed level, 0 outside acceptances).
export function boalfSeries(byBmu: Map<string, BoalfRecord[]>, startMs: number, endMs: number): Array<{ time: string; mw: number }> {
  return physicalSeries(new Map(), byBmu, startMs, endMs);
}

type RawBoalf = Partial<BoalfRecord> & { nationalGridBmUnit?: string | null; bmUnit?: string | null };

// Normalise raw PN/BOALF rows (nationalGridBmUnit vs bmUnit) and group by BMU,
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

// ─── PN / BOALF fetching ─────────────────────────────────────────────────────

// /stream variants accept long windows when filtered by unit and return a bare
// array. Filtering to BESS units keeps responses to ~2MB (PN) and ~3.5MB (BOALF).
async function fetchLevelRows(dataset: "PN" | "BOALF", fromMs: number, toMs: number, ids: string[]): Promise<Map<string, BoalfRecord[]>> {
  const unitParams = ids.map((id) => `bmUnit=${encodeURIComponent(id)}`).join("&");
  const res = await fetch(
    `${ELEXON_BASE}/datasets/${dataset}/stream?from=${new Date(fromMs).toISOString()}&to=${new Date(toMs).toISOString()}&${unitParams}`,
    { cache: "no-store", headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`${dataset} ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : json?.data ?? [];
  const wanted = new Set(ids);
  return groupBoalf(rows, (id) => wanted.has(id));
}

export interface PhysicalLevels {
  pn: Map<string, BoalfRecord[]>;
  boalf: Map<string, BoalfRecord[]>;
  source: "pn" | "boalf"; // "pn" = PN with BOALF overrides; "boalf" = BOALF only
}

// Fetch PN and BOALF for `ids` over [fromMs, toMs]. Either dataset may fail on
// its own; throws only if neither yields any records.
export async function fetchPhysicalLevels(fromMs: number, toMs: number, ids: string[]): Promise<PhysicalLevels> {
  const [pn, boalf] = await Promise.allSettled([
    fetchLevelRows("PN", fromMs, toMs, ids),
    fetchLevelRows("BOALF", fromMs, toMs, ids),
  ]);
  if (pn.status === "rejected") console.error("[Elexon] PN failed:", pn.reason);
  if (boalf.status === "rejected") console.error("[Elexon] BOALF failed:", boalf.reason);

  const pnMap = pn.status === "fulfilled" ? pn.value : new Map<string, BoalfRecord[]>();
  const boalfMap = boalf.status === "fulfilled" ? boalf.value : new Map<string, BoalfRecord[]>();
  if (!pnMap.size && !boalfMap.size) {
    const reason = pn.status === "rejected" ? pn.reason : boalf.status === "rejected" ? boalf.reason : null;
    throw reason ?? new Error("No PN or BOALF records for BESS units");
  }
  return { pn: pnMap, boalf: boalfMap, source: pnMap.size ? "pn" : "boalf" };
}
