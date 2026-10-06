import { NextResponse } from "next/server";
import { fetchSystemPrices } from "@/lib/system-prices";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchSystemPrices();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
