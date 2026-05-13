import { NextResponse } from "next/server";
import { fetchSitesLive } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchSitesLive();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
