import { NextResponse } from "next/server";
import { fetchBessUnits } from "@/lib/bmu";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Capacities come straight from the Elexon reference data. MWh (duration)
    // is not published there, so energyMWh is null.
    const units = (await fetchBessUnits()).map((u) => ({ ...u, energyMWh: null as number | null }));

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
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
