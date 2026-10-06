import { fetchBessUnits, groupBoalf, boalfLevelAt, siteIdOf } from "./bmu";
import { londonDateStr, londonDayBounds } from "./time";

const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

export interface SiteData {
  id: string;        // site ID (BMU minus "-N"), e.g. "KILSB"
  name: string;
  operator: string;
  region: string;
  currentMW: number; // sum of BOALF levels in force now across all BMUs at site
  capacityMW: number;
  unitCount: number;
  bmUnits: string[];
}

export interface SitesResponse {
  sites: SiteData[];
  meta: { lastUpdated: string; reportingUnits: number; source: string };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchSitesLive(): Promise<SitesResponse> {
  const now = new Date();
  const [dayStart] = londonDayBounds(londonDateStr(now));

  const [boalfRes, units] = await Promise.all([
    fetch(`${ELEXON_BASE}/datasets/BOALF?from=${new Date(dayStart).toISOString()}&to=${now.toISOString()}&format=json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }),
    fetchBessUnits(),
  ]);

  if (!boalfRes.ok) throw new Error(`BOALF ${boalfRes.status}`);
  const boalfJson = await boalfRes.json();

  const meta = new Map(units.map((u) => [u.id, u]));
  const byBmu = groupBoalf(boalfJson?.data ?? [], (id) => meta.has(id));

  // Group BMUs by physical site; current level = instruction in force right now (0 if none)
  type SiteAccum = {
    currentMW: number; capacityMW: number; bmUnits: string[];
    operator: string; region: string; name: string;
  };
  const bySite = new Map<string, SiteAccum>();

  for (const [bmuId, recs] of byBmu) {
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
      });
    }
    const site = bySite.get(siteId)!;
    site.currentMW += boalfLevelAt(recs, now.getTime());
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
    }))
    .sort((a, b) => Math.abs(b.currentMW) - Math.abs(a.currentMW) || b.capacityMW - a.capacityMW);

  return {
    sites,
    meta: { lastUpdated: now.toISOString(), reportingUnits: byBmu.size, source: "boalf" },
  };
}
