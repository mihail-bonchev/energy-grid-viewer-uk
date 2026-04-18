import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = "https://data.elexon.co.uk/bmrs/api/v1";
  const today = new Date().toISOString().split("T")[0];
  // Current settlement period (each SP = 30 min, 48 per day)
  const now = new Date();
  const sp = Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes()) / 30) + 1;
  const results: Record<string, unknown> = {};

  const attempts = [
    // The opinionated physical endpoint from the docs page
    `${base}/balancing/physical?settlementDate=${today}&settlementPeriod=${sp}&bmUnit=E_MINETY-1`,
    // PHYBMDATA stream (legacy but sometimes still works)  
    `${base}/datasets/PHYBMDATA?settlementDateFrom=${today}&settlementDateTo=${today}&nationalGridBmUnit=E_MINETY-1&format=json`,
    // FPN specific endpoint
    `${base}/balancing/physical/all?settlementDate=${today}&settlementPeriod=${sp}`,
    // Try without BMU filter to see if any records come back
    `${base}/balancing/physical?settlementDate=${today}&settlementPeriod=${sp}`,
    // MEL - max export limits (always submitted, good proxy for capacity)
    `${base}/datasets/MELS?settlementDateFrom=${today}&settlementDateTo=${today}&nationalGridBmUnit=E_MINETY-1&format=json`,
    // BOD - Bid Offer Data for storage units
    `${base}/datasets/BOD?settlementDateFrom=${today}&settlementDateTo=${today}&nationalGridBmUnit=E_MINETY-1&format=json`,
  ];

  for (let i = 0; i < attempts.length; i++) {
    const url = attempts[i];
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      const text = await r.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
      const records = (parsed as Record<string,unknown>)?.data ?? parsed;
      const count = Array.isArray(records) ? records.length : typeof records;
      results[`attempt_${i + 1}`] = {
        url, status: r.status, recordCount: count,
        keys: Array.isArray(records) && records[0] ? Object.keys(records[0] as object) : [],
        sample: Array.isArray(records) ? (records as unknown[]).slice(0, 2) : records,
      };
    } catch (e) { results[`attempt_${i + 1}_err`] = { url, error: String(e) }; }
  }

  results.meta = { today, currentSP: sp, time: now.toISOString() };
  return NextResponse.json(results);
}
