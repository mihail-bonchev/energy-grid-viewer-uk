import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Module-level cache: BMU reference is 2.7MB — too large for Next.js fetch cache (2MB limit).
let _cache: object | null = null;
let _cacheAt = 0;
const CACHE_TTL = 3_600_000;

// Known large transmission-connected BESS with verified capacities
const KNOWN_BESS: Record<string, { mw: number; mwh: number; site: string }> = {
  "E_MINETY-1": { mw: 350, mwh: 700,  site: "Minety" },
  "E_MINETY-2": { mw: 350, mwh: 700,  site: "Minety" },
  "E_PILGR-1":  { mw: 196, mwh: 392,  site: "Pillswood" },
  "E_STAPL-1":  { mw: 99,  mwh: 198,  site: "Staple" },
  "E_PYLNW-1":  { mw: 100, mwh: 200,  site: "Pylle" },
  "E_BAGE1-1":  { mw: 100, mwh: 100,  site: "Baged" },
  "E_COWES-1":  { mw: 98,  mwh: 196,  site: "Cowes" },
  "E_GOWGE-1":  { mw: 50,  mwh: 50,   site: "Gowge" },
  "T_BTUFW-1":  { mw: 50,  mwh: 50,   site: "Burbo" },
};

type BmuRecord = Record<string, string | number | boolean | null>;

export async function GET() {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) {
    return NextResponse.json(_cache);
  }

  const base = "https://data.elexon.co.uk/bmrs/api/v1";

  try {
    const res = await fetch(`${base}/reference/bmunits/all?format=json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`BMU reference ${res.status}`);

    const json = await res.json();
    const all: BmuRecord[] = json?.data ?? json ?? [];

    // Storage: type "S" = aggregated/virtual storage, OR fuelType OTHER with capacity
    const storageUnits = all.filter((u) => {
      const type = String(u.bmUnitType ?? "");
      const fuel = String(u.fuelType ?? "");
      const genCap = parseFloat(String(u.generationCapacity ?? "0"));
      const demCap = Math.abs(parseFloat(String(u.demandCapacity ?? "0")));
      return type === "S" || (fuel === "OTHER" && (genCap > 0.1 || demCap > 0.1));
    });

    const units = storageUnits.map((u) => {
      const ngId = String(u.nationalGridBmUnit ?? "");
      const known = KNOWN_BESS[ngId];
      const genCap = parseFloat(String(u.generationCapacity ?? "0"));
      const demCap = Math.abs(parseFloat(String(u.demandCapacity ?? "0")));
      const mw = known?.mw ?? Math.max(genCap, demCap);

      return {
        id: ngId,
        elexonId: String(u.elexonBmUnit ?? ""),
        name: known?.site ?? String(u.bmUnitName ?? ngId),
        rawName: String(u.bmUnitName ?? ngId),
        operator: String(u.leadPartyName ?? "Unknown"),
        region: String(u.gspGroupName ?? "Unknown"),
        bmUnitType: String(u.bmUnitType ?? ""),
        capacityMW: Math.round(mw * 10) / 10,
        energyMWh: known?.mwh ?? null,
        fpnFlag: Boolean(u.fpnFlag),
      };
    });

    // Sort by capacity desc
    units.sort((a, b) => b.capacityMW - a.capacityMW);

    // Region summary
    const byRegion: Record<string, { count: number; capacityMW: number }> = {};
    for (const u of units) {
      if (!byRegion[u.region]) byRegion[u.region] = { count: 0, capacityMW: 0 };
      byRegion[u.region].count++;
      byRegion[u.region].capacityMW += u.capacityMW;
    }

    // Operator summary (top 10)
    const byOperator: Record<string, { count: number; capacityMW: number }> = {};
    for (const u of units) {
      if (!byOperator[u.operator]) byOperator[u.operator] = { count: 0, capacityMW: 0 };
      byOperator[u.operator].count++;
      byOperator[u.operator].capacityMW += u.capacityMW;
    }
    const topOperators = Object.entries(byOperator)
      .sort((a, b) => b[1].capacityMW - a[1].capacityMW)
      .slice(0, 10)
      .map(([name, v]) => ({ name, ...v, capacityMW: Math.round(v.capacityMW) }));

    const payload = {
      units,
      byRegion: Object.entries(byRegion)
        .sort((a, b) => b[1].capacityMW - a[1].capacityMW)
        .map(([region, v]) => ({ region, ...v, capacityMW: Math.round(v.capacityMW) })),
      topOperators,
      meta: {
        total: units.length,
        totalCapacityMW: Math.round(units.reduce((s, u) => s + u.capacityMW, 0)),
        lastUpdated: new Date().toISOString(),
      },
    };
    _cache = payload;
    _cacheAt = Date.now();
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
