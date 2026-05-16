import { computePnl } from "@/lib/pnl";
import type { PnlPoint } from "@/lib/pnl";

// Helpers ─────────────────────────────────────────────────────────────────────

const pt = (time: string, mw: number) => ({ time, mw });
const pr = (time: string, price: number) => ({ time, price });

/** Six 5-min points at a fixed MW — fills one 30-min bucket starting at `startHHMM` */
function sixPoints(startHHMM: string, mw: number) {
  const [h, m] = startHHMM.split(":").map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const minute = m + i * 5;
    return pt(`${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, mw);
  });
}

// ─── empty / edge cases ───────────────────────────────────────────────────────

describe("computePnl — empty / edge", () => {
  it("returns [] when both inputs are empty", () => {
    expect(computePnl([], [])).toEqual([]);
  });

  it("returns [] when bessPoints is empty", () => {
    expect(computePnl([], [pr("09:00", 20)])).toEqual([]);
  });

  it("returns [] when prices is empty", () => {
    expect(computePnl([pt("09:00", 1000)], [])).toEqual([]);
  });

  it("returns [] when no price slot matches a BESS bucket", () => {
    const data = sixPoints("09:00", 1000);
    const prices = [pr("10:00", 20)]; // different slot
    expect(computePnl(data, prices)).toEqual([]);
  });
});

// ─── bucketing ────────────────────────────────────────────────────────────────

describe("computePnl — 30-min bucketing", () => {
  it("buckets 09:00–09:25 into the 09:00 slot", () => {
    const result = computePnl(sixPoints("09:00", 1000), [pr("09:00", 10)]);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe("09:00");
  });

  it("buckets 09:30–09:55 into the 09:30 slot", () => {
    const result = computePnl(sixPoints("09:30", 500), [pr("09:30", 10)]);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe("09:30");
  });

  it("produces two separate slots when points span 09:00 and 09:30", () => {
    const data = [...sixPoints("09:00", 1000), ...sixPoints("09:30", 500)];
    const prices = [pr("09:00", 10), pr("09:30", 20)];
    const result = computePnl(data, prices);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ time: "09:00", avgMW: 1000 });
    expect(result[1]).toMatchObject({ time: "09:30", avgMW: 500 });
  });

  it("averages MW across all points in a bucket", () => {
    // First 3 points at 1000, next 3 at 500 → average 750
    const data = [
      pt("09:00", 1000), pt("09:05", 1000), pt("09:10", 1000),
      pt("09:15", 500),  pt("09:20", 500),  pt("09:25", 500),
    ];
    const [r] = computePnl(data, [pr("09:00", 10)]);
    expect(r.avgMW).toBe(750);
  });

  it("handles a single point in a bucket (no division error)", () => {
    const result = computePnl([pt("09:00", 800)], [pr("09:00", 20)]);
    expect(result).toHaveLength(1);
    expect(result[0].avgMW).toBe(800);
  });
});

// ─── P&L arithmetic ───────────────────────────────────────────────────────────

describe("computePnl — P&L calculation", () => {
  // Formula: pnl (£k) = avgMW × price / 200  (rounded to 1dp)

  it("discharging 1000 MW at 30 p/kWh → +£150k", () => {
    // 1000 MW × 0.5h × (30 p/kWh × 10 £/MWh) / 1000 = 1000×0.5×300/1000 = 150
    const [r] = computePnl(sixPoints("09:00", 1000), [pr("09:00", 30)]);
    expect(r.pnl).toBe(150);
  });

  it("charging 500 MW at 20 p/kWh → -£50k", () => {
    // -500 × 0.5 × 200 / 1000 = -50
    const [r] = computePnl(sixPoints("09:00", -500), [pr("09:00", 20)]);
    expect(r.pnl).toBe(-50);
  });

  it("zero MW at any price → £0k P&L", () => {
    const [r] = computePnl(sixPoints("09:00", 0), [pr("09:00", 100)]);
    expect(r.pnl).toBe(0);
  });

  it("negative price (surplus) while discharging → negative P&L", () => {
    // Fleet discharged 1000 MW but price was -5 p/kWh (had to pay to export)
    const [r] = computePnl(sixPoints("09:00", 1000), [pr("09:00", -5)]);
    expect(r.pnl).toBe(-25); // 1000 × -5 / 200 = -25
  });

  it("negative price while charging → positive P&L (paid to absorb)", () => {
    // Charging at -10 p/kWh: grid pays you to consume
    const [r] = computePnl(sixPoints("09:00", -1000), [pr("09:00", -10)]);
    expect(r.pnl).toBe(50); // -1000 × -10 / 200 = 50
  });

  it("result includes the price used for the calculation", () => {
    const [r] = computePnl(sixPoints("12:30", 2000), [pr("12:30", 45)]);
    expect(r.price).toBe(45);
  });

  it("rounds pnl to 1 decimal place", () => {
    // 100 MW × 3 p/kWh / 200 = 1.5 exactly
    const [r] = computePnl(sixPoints("09:00", 100), [pr("09:00", 3)]);
    expect(r.pnl).toBe(1.5);
  });

  it("large fleet discharge produces correct large P&L", () => {
    // 4000 MW × 60 p/kWh: 4000 × 60 / 200 = 1200 k£
    const [r] = computePnl(sixPoints("18:00", 4000), [pr("18:00", 60)]);
    expect(r.pnl).toBe(1200);
  });
});

// ─── ordering & passthrough ───────────────────────────────────────────────────

describe("computePnl — ordering and data passthrough", () => {
  it("output order follows the prices array order", () => {
    const data = [
      ...sixPoints("06:00", 500),
      ...sixPoints("18:00", 2000),
    ];
    const prices = [pr("18:00", 50), pr("06:00", 10)]; // reverse order
    const result = computePnl(data, prices);
    expect(result[0].time).toBe("18:00");
    expect(result[1].time).toBe("06:00");
  });

  it("skips price slots that have no matching BESS data", () => {
    const data = sixPoints("09:00", 1000);
    const prices = [pr("09:00", 20), pr("10:00", 30), pr("11:00", 40)];
    const result = computePnl(data, prices);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe("09:00");
  });

  it("correctly handles a full day (48 slots)", () => {
    const data: Array<{ time: string; mw: number }> = [];
    const prices: Array<{ time: string; price: number }> = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const slot = `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`;
        prices.push(pr(slot, 20));
        for (let i = 0; i < 6; i++) {
          const minute = m + i * 5;
          data.push(pt(`${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, 1000));
        }
      }
    }
    const result = computePnl(data, prices);
    expect(result).toHaveLength(48);
    result.forEach((r) => expect(r.pnl).toBe(100)); // 1000 × 20 / 200
  });
});
