import { NextRequest, NextResponse } from "next/server";
import { fetchStorageDataForDate, fetchSiteTimeSeries } from "@/lib/elexon";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date — expected YYYY-MM-DD" }, { status: 400 });
  }

  const site = req.nextUrl.searchParams.get("site");
  if (site && !/^[A-Z0-9_]{2,12}$/i.test(site)) {
    return NextResponse.json({ error: "Invalid site ID" }, { status: 400 });
  }

  const data = site
    ? await fetchSiteTimeSeries(date, site)
    : await fetchStorageDataForDate(date);

  return NextResponse.json({ data }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" },
  });
}
