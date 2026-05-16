import { NextResponse } from "next/server";
import { fetchBmPrices } from "@/lib/bm-prices";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchBmPrices();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
