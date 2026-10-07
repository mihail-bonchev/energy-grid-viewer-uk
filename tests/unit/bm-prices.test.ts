import { aggregateBod } from "@/lib/bm-prices";

const BESS = new Set(["A-1", "B-1"]);
const rec = (bmu: string, timeFrom: string, pairId: number, offer: number, bid: number) =>
  ({ nationalGridBmUnit: bmu, timeFrom, pairId, offer, bid });

describe("aggregateBod", () => {
  it("averages offers (pairId 1) and bids (pairId -1) per SP across BESS units", () => {
    const out = aggregateBod([
      rec("A-1", "2026-05-15T10:00:00Z", 1, 300, -50),
      rec("A-1", "2026-05-15T10:00:00Z", -1, 300, -50),
      rec("B-1", "2026-05-15T10:00:00Z", 1, 401, -70),
      rec("B-1", "2026-05-15T10:00:00Z", -1, 401, -71),
    ], BESS);
    expect(out).toEqual([{ time: "11:00", avgOffer: 351, avgBid: -60, unitCount: 2 }]); // BST; -60.5 rounds to -60
  });

  it("excludes sentinels, non-BESS units and duplicate (unit, pair) rows", () => {
    const out = aggregateBod([
      rec("A-1", "2026-05-15T10:00:00Z", 1, 200, 0),
      rec("A-1", "2026-05-15T10:00:00Z", 1, 999, 0),    // duplicate pair — ignored
      rec("B-1", "2026-05-15T10:00:00Z", 1, 9999, 0),   // offer sentinel
      rec("B-1", "2026-05-15T10:00:00Z", -1, 0, -9999), // bid sentinel
      rec("CCGT-1", "2026-05-15T10:00:00Z", 1, 50, 0),  // not BESS
    ], BESS);
    expect(out).toEqual([{ time: "11:00", avgOffer: 200, avgBid: 0, unitCount: 1 }]);
  });

  it("drops SPs with no usable prices and sorts by time", () => {
    const out = aggregateBod([
      rec("A-1", "2026-05-15T12:00:00Z", 1, 400, 0),
      rec("A-1", "2026-05-15T11:00:00Z", 1, 9999, 0), // only a sentinel → SP dropped
      rec("A-1", "2026-05-15T10:00:00Z", 1, 100, 0),
    ], BESS);
    expect(out.map((p) => p.time)).toEqual(["11:00", "13:00"]);
  });
});
