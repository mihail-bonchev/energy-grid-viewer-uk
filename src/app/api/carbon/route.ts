import { NextResponse } from "next/server";
import { fetchCarbonIntensity } from "@/lib/carbon";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchCarbonIntensity();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
