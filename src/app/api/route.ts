import { NextResponse } from "next/server";
import { fetchStorageData, generateMockData } from "@/lib/elexon";
import type { ApiResponse } from "@/lib/elexon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { data, source } = await fetchStorageData();

    const response: ApiResponse = {
      data,
      meta: {
        source,
        lastUpdated: new Date().toISOString(),
        count: data.length,
      },
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    console.error("[/api/elexon] Falling back to mock data:", err);

    // Graceful fallback — never return an error to the client
    const data = generateMockData(24);

    const response: ApiResponse = {
      data,
      meta: {
        source: "mock" as const,
        lastUpdated: new Date().toISOString(),
        count: data.length,
      },
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
        "X-Data-Source": "mock-fallback",
      },
    });
  }
}
