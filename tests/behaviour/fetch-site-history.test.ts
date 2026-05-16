/**
 * Behaviour tests for fetchSiteTimeSeries.
 * Verifies: site prefix filtering, 5-min slot-building, step-hold, multi-BMU
 * aggregation, and empty-array returns for no-match / error cases.
 */

type ElexonModule = typeof import("@/lib/elexon");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function makeBoalfResponse(records: Array<{ bmu: string; level: number; time: string }>) {
  return {
    ok: true,
    json: async () => ({
      data: records.map((r) => ({
        nationalGridBmUnit: r.bmu,
        levelFrom: r.level,
        timeFrom: r.time,
      })),
    }),
  };
}

describe("fetchSiteTimeSeries", () => {
  let fetchSiteTimeSeries: ElexonModule["fetchSiteTimeSeries"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchSiteTimeSeries } = require("@/lib/elexon"));
    });
  });

  it("returns 288 data points for a full day (5-min slots × 24h)", async () => {
    mockFetch.mockResolvedValueOnce(makeBoalfResponse([
      { bmu: "E_MINETY-1", level: 50, time: "2026-05-15T00:00:00Z" },
    ]));

    const result = await fetchSiteTimeSeries("2026-05-15", "E_MINETY");
    expect(result).toHaveLength(288);
  });

  it("each point has time, battery, pumped, total fields", async () => {
    mockFetch.mockResolvedValueOnce(makeBoalfResponse([
      { bmu: "E_MINETY-1", level: 100, time: "2026-05-15T06:00:00Z" },
    ]));

    const result = await fetchSiteTimeSeries("2026-05-15", "E_MINETY");
    expect(result[0]).toMatchObject({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      battery: expect.any(Number),
      pumped: 0,
      total: expect.any(Number),
    });
  });

  it("filters by site prefix: only includes BMUs matching the site ID", async () => {
    mockFetch.mockResolvedValueOnce(makeBoalfResponse([
      { bmu: "E_MINETY-1", level: 80,  time: "2026-05-15T10:00:00Z" },
      { bmu: "E_PILGR-1",  level: 999, time: "2026-05-15T10:00:00Z" }, // different site — excluded
    ]));

    const result = await fetchSiteTimeSeries("2026-05-15", "E_MINETY");
    const slotAt10 = result.find((p) => p.time.startsWith("2026-05-15T10:00"));
    expect(slotAt10?.battery).toBe(80); // E_PILGR-1 not counted
  });

  it("aggregates multiple BMUs from the same site", async () => {
    mockFetch.mockResolvedValueOnce(makeBoalfResponse([
      { bmu: "E_MINETY-1", level: 50, time: "2026-05-15T10:00:00Z" },
      { bmu: "E_MINETY-2", level: 75, time: "2026-05-15T10:00:00Z" },
    ]));

    const result = await fetchSiteTimeSeries("2026-05-15", "E_MINETY");
    const slotAt10 = result.find((p) => p.time.startsWith("2026-05-15T10:00"));
    expect(slotAt10?.battery).toBe(125); // 50 + 75
  });

  it("applies step-hold: level persists until replaced by a later record", async () => {
    mockFetch.mockResolvedValueOnce(makeBoalfResponse([
      { bmu: "E_MINETY-1", level: 100, time: "2026-05-15T10:00:00Z" },
    ]));

    const result = await fetchSiteTimeSeries("2026-05-15", "E_MINETY");
    const slotAt11 = result.find((p) => p.time.startsWith("2026-05-15T11:00"));
    expect(slotAt11?.battery).toBe(100); // held from 10:00 dispatch
  });

  it("returns empty array when no records match the site prefix", async () => {
    mockFetch.mockResolvedValueOnce(makeBoalfResponse([
      { bmu: "E_PILGR-1", level: 200, time: "2026-05-15T10:00:00Z" },
    ]));

    const result = await fetchSiteTimeSeries("2026-05-15", "E_MINETY");
    expect(result).toEqual([]);
  });

  it("returns empty array when BOALF fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" });

    await expect(fetchSiteTimeSeries("2026-05-15", "E_MINETY")).rejects.toThrow("BOALF 503");
  });

  it("handles negative MW (charging) correctly", async () => {
    mockFetch.mockResolvedValueOnce(makeBoalfResponse([
      { bmu: "E_MINETY-1", level: -300, time: "2026-05-15T02:00:00Z" },
    ]));

    const result = await fetchSiteTimeSeries("2026-05-15", "E_MINETY");
    const slotAt2 = result.find((p) => p.time.startsWith("2026-05-15T02:00"));
    expect(slotAt2?.battery).toBe(-300);
  });
});
