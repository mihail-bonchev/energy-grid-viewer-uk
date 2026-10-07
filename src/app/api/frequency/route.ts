import { NextResponse } from "next/server";
import { fetchFrequency } from "@/lib/frequency";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchFrequency();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
