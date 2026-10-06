import { fetchBessUnits, fetchPhysicalLevels, physicalLevelAt, boalfActiveAt, siteIdOf } from "./bmu";
import { londonDateStr, londonDayBounds } from "./time";

export interface SiteData {
  id: string;        // site ID (BMU minus "-N"), e.g. "KILSB"
  name: string;
  operator: string;
  region: string;
  currentMW: number; // physical estimate now (BOALF if in force, else PN), summed over BMUs
  capacityMW: number;
  unitCount: number;
  bmUnits: string[];
  bmInstructed: boolean; // a System Operator acceptance is in force now for ≥1 unit
}

export interface SitesResponse {
  sites: SiteData[];
  meta: { lastUpdated: string; reportingUnits: number; source: string };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchSitesLive(): Promise<SitesResponse> {
  const now = new Date();
  const [dayStart] = londonDayBounds(londonDateStr(now));

  const units = await fetchBessUnits();
  const meta = new Map(units.map((u) => [u.id, u]));
  const { pn, boalf, source } = await fetchPhysicalLevels(dayStart, now.getTime(), units.map((u) => u.id));
  const reporting = new Set([...pn.keys(), ...boalf.keys()]);

  // Group BMUs by physical site; current level = BOALF if in force, else PN, else 0
  type SiteAccum = {
    currentMW: number; capacityMW: number; bmUnits: string[];
    operator: string; region: string; name: string; bmInstructed: boolean;
  };
  const bySite = new Map<string, SiteAccum>();

  for (const bmuId of reporting) {
    const siteId = siteIdOf(bmuId);
    const unit = meta.get(bmuId)!;
    if (!bySite.has(siteId)) {
      bySite.set(siteId, {
        currentMW: 0,
        capacityMW: 0,
        bmUnits: [],
        operator: unit.operator,
        region: unit.region,
        name: unit.name,
        bmInstructed: false,
      });
    }
    const site = bySite.get(siteId)!;
    site.currentMW += physicalLevelAt(pn.get(bmuId), boalf.get(bmuId), now.getTime());
    if (boalfActiveAt(boalf.get(bmuId), now.getTime())) site.bmInstructed = true;
    site.capacityMW += unit.capacityMW;
    site.bmUnits.push(bmuId);
  }

  const sites: SiteData[] = Array.from(bySite.entries())
    .map(([id, s]) => ({
      id,
      name: s.name,
      operator: s.operator,
      region: s.region,
      currentMW: Math.round(s.currentMW),
      capacityMW: Math.round(s.capacityMW),
      unitCount: s.bmUnits.length,
      bmUnits: s.bmUnits.sort(),
      bmInstructed: s.bmInstructed,
    }))
    .sort((a, b) => Math.abs(b.currentMW) - Math.abs(a.currentMW) || b.capacityMW - a.capacityMW);

  return {
    sites,
    meta: { lastUpdated: now.toISOString(), reportingUnits: reporting.size, source: source === "pn" ? "pn+boalf" : "boalf" },
  };
}
