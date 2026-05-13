import { NextResponse } from "next/server";
import { fetchAgilePrices } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchAgilePrices();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
