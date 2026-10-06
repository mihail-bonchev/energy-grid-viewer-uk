export interface PnlPoint {
  time: string   // "HH:MM" (30-min bucket start, London time)
  pnl: number    // £k — positive = revenue (discharging), negative = cost (charging)
  avgMW: number  // average MW for the 30-min period
  price: number  // wholesale Market Index Price £/MWh used for calculation
}

/**
 * Computes estimated P&L per 30-min settlement period.
 *
 * Formula: P&L (£k) = avgMW × 0.5h × price (£/MWh) / 1000
 *                   = avgMW × price / 2000
 *
 * Prices are the Elexon Market Index Price (wholesale day-ahead/within-day),
 * not a retail tariff — that is what a battery actually trades at.
 *
 * Both inputs use "HH:MM" London-local time. The caller is responsible for
 * converting BESS ISO timestamps to London HH:MM before calling this.
 */
export function computePnl(
  bessPoints: Array<{ time: string; mw: number }>,
  prices: Array<{ time: string; price: number }>,
): PnlPoint[] {
  if (!bessPoints.length || !prices.length) return [];

  // Bucket BESS points into 30-min slots: "HH:00" or "HH:30"
  const buckets = new Map<string, number[]>();
  for (const { time, mw } of bessPoints) {
    const [h, m] = time.split(":").map(Number);
    const bucket = `${String(h).padStart(2, "0")}:${m < 30 ? "00" : "30"}`;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(mw);
  }

  const result: PnlPoint[] = [];
  for (const { time, price } of prices) {
    const mwVals = buckets.get(time);
    if (!mwVals?.length) continue;
    const avgMW = mwVals.reduce((a, b) => a + b, 0) / mwVals.length;
    // Round to 1 decimal place in £k
    const pnl = Math.round((avgMW * price) / 2000 * 10) / 10;
    result.push({ time, pnl, avgMW: Math.round(avgMW), price });
  }
  return result;
}
