import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const todayStr = new Date().toISOString().split("T")[0];
  const url = `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELINST?settlementDateFrom=${todayStr}&settlementDateTo=${todayStr}&format=json`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const json = await res.json();
    const records: Array<{ fuelType: string; generation: number; startTime: string }> =
      json?.data ?? [];

    // Distinct fuel types with their latest generation value
    const fuelMap = new Map<string, number>();
    for (const r of records) {
      fuelMap.set(r.fuelType, r.generation);
    }

    const fuelTypes = Object.fromEntries(
      [...fuelMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );

    return NextResponse.json({
      recordCount: records.length,
      firstRecordKeys: records[0] ? Object.keys(records[0]) : [],
      distinctFuelTypes: fuelTypes,
      sampleRecord: records[0],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
