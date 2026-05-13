const ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1";

// Verified human-readable names for known site prefixes
const SITE_NAMES: Record<string, string> = {
  "E_MINETY": "Minety",
  "E_PILGR":  "Pillswood",
  "E_STAPL":  "Staple Cross",
  "E_PYLNW":  "Pylle",
  "E_COWES":  "Cowes",
  "E_BAGE1":  "Baglan Bay",
  "E_GOWGE":  "Gowge",
  "T_BTUFW":  "Burbo Bank",
  "E_GLSNB":  "Glassenbury",
  "E_COTPS":  "Cottam PS",
  "E_BLYTH":  "Blyth",
  "E_DODDG":  "Doddington",
  "E_HOLBW":  "Holes Bay",
  "E_WHILB":  "Whitelee",
  "E_CLAYT":  "Claybrooke",
  "E_CHAPB":  "Chapel",
  "E_DOLLB":  "Dalquhandy",
  "E_BERKB":  "Berkshire",
  "E_NTAWB":  "Nant y Moch",
  "E_WOLVB":  "Wolverhampton",
  "E_HAWNB":  "Hawthorn Pit",
  "E_NEVNB":  "Nevendon",
  "E_THURB":  "Thurcroft",
  "T_HUMR":   "Humber",
  "T_GANW":   "Gordonbush",
};

export interface SiteData {
  id: string;        // BMU prefix e.g. "E_MINETY"
  name: string;
  operator: string;
  region: string;
  currentMW: number; // sum of current PN levels across all BMUs at site
  capacityMW: number;
  unitCount: number;
  bmUnits: string[];
}

export interface SitesResponse {
  sites: SiteData[];
  meta: { lastUpdated: string; reportingUnits: number; source: string };
}

// ─── BMU metadata cache ───────────────────────────────────────────────────────

type BmuMeta = { name: string; operator: string; region: string; capacityMW: number };
let _metaCache: Map<string, BmuMeta> | null = null;
let _metaCacheAt = 0;
const META_TTL = 3_600_000;

async function fetchBmuMeta(): Promise<Map<string, BmuMeta>> {
  if (_metaCache && Date.now() - _metaCacheAt < META_TTL) return _metaCache;

  const res = await fetch(`${ELEXON_BASE}/reference/bmunits/all?format=json`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BMU ref ${res.status}`);
  const json = await res.json();
  const all: Record<string, unknown>[] = json?.data ?? json ?? [];

  const meta = new Map<string, BmuMeta>();
  for (const u of all) {
    const id = String(u.nationalGridBmUnit ?? "");
    if (!id) continue;
    const type = String(u.bmUnitType ?? "");
    const fuel = String(u.fuelType ?? "");
    const genCap = parseFloat(String(u.generationCapacity ?? "0"));
    const demCap = Math.abs(parseFloat(String(u.demandCapacity ?? "0")));
    if (type !== "S" && !(fuel === "OTHER" && (genCap > 0.1 || demCap > 0.1))) continue;
    meta.set(id, {
      name: String(u.bmUnitName ?? id),
      operator: String(u.leadPartyName ?? "Unknown"),
      region: String(u.gspGroupName ?? "Unknown"),
      capacityMW: Math.round(Math.max(genCap, demCap) * 10) / 10,
    });
  }

  _metaCache = meta;
  _metaCacheAt = Date.now();
  return meta;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchSitesLive(): Promise<SitesResponse> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const [boalfRes, meta] = await Promise.all([
    fetch(`${ELEXON_BASE}/datasets/BOALF?from=${todayStr}T00:00Z&to=${now.toISOString()}&format=json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }),
    fetchBmuMeta(),
  ]);

  if (!boalfRes.ok) throw new Error(`BOALF ${boalfRes.status}`);
  const boalfJson = await boalfRes.json();

  type RawRecord = { nationalGridBmUnit?: string; bmUnit?: string; levelFrom: number; timeFrom: string };
  const pnRecords: RawRecord[] = boalfJson?.data ?? [];

  // Normalise and filter to storage BMUs only
  type NormRec = { bmuId: string; levelFrom: number; timeFrom: string };
  const records: NormRec[] = pnRecords
    .map((r) => ({
      bmuId: r.nationalGridBmUnit ?? r.bmUnit ?? "",
      levelFrom: r.levelFrom ?? 0,
      timeFrom: r.timeFrom ?? "",
    }))
    .filter((r) => r.bmuId && meta.has(r.bmuId));

  // Group by BMU and find the current level (latest timeFrom <= now)
  const byBmu = new Map<string, NormRec[]>();
  for (const r of records) {
    if (!byBmu.has(r.bmuId)) byBmu.set(r.bmuId, []);
    byBmu.get(r.bmuId)!.push(r);
  }

  const currentByBmu = new Map<string, number>();
  for (const [bmuId, recs] of byBmu) {
    recs.sort((a, b) => a.timeFrom.localeCompare(b.timeFrom));
    let level = 0;
    for (const r of recs) {
      if (new Date(r.timeFrom) <= now) level = r.levelFrom;
      else break;
    }
    currentByBmu.set(bmuId, level);
  }

  // Group BMUs by physical site (strip trailing -N unit number)
  type SiteAccum = {
    currentMW: number; capacityMW: number; bmUnits: string[];
    operator: string; region: string; name: string;
  };
  const bySite = new Map<string, SiteAccum>();

  for (const [bmuId, currentMW] of currentByBmu) {
    const siteId = bmuId.replace(/-\d+$/, "");
    const bmuData = meta.get(bmuId)!;
    if (!bySite.has(siteId)) {
      bySite.set(siteId, {
        currentMW: 0,
        capacityMW: 0,
        bmUnits: [],
        operator: bmuData.operator,
        region: bmuData.region,
        name: SITE_NAMES[siteId] ?? bmuData.name.replace(/_/g, " ").replace(/\s+\d+$/, ""),
      });
    }
    const site = bySite.get(siteId)!;
    site.currentMW += currentMW;
    site.capacityMW += bmuData.capacityMW;
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
    meta: { lastUpdated: now.toISOString(), reportingUnits: currentByBmu.size, source: "boalf" },
  };
}
