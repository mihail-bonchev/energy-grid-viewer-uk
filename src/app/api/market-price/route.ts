import { NextResponse } from "next/server";
import { fetchMarketIndexPrice } from "@/lib/market-price";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchMarketIndexPrice();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
