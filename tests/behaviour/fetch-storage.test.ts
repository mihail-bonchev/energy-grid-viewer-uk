/**
 * Behaviour tests for fetchStorageDataForDate.
 * Verifies: BOALF slot-building, step-hold interpolation, BMU filtering,
 * and error fallback (returns [] on failure).
 */

type ElexonModule = typeof import("@/lib/elexon");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const MOCK_BMU_REF = {
  ok: true,
  json: async () => ({
    data: [
      {
        nationalGridBmUnit: "E_MINETY-1",
        bmUnitType: "S",
        fuelType: "OTHER",
        generationCapacity: "50",
        demandCapacity: "50",
      },
      {
        nationalGridBmUnit: "E_PILGR-1",
        bmUnitType: "S",
        fuelType: "OTHER",
        generationCapacity: "100",
        demandCapacity: "100",
      },
    ],
  }),
};

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

describe("fetchStorageDataForDate", () => {
  let fetchStorageDataForDate: ElexonModule["fetchStorageDataForDate"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchStorageDataForDate } = require("@/lib/elexon"));
    });
  });

  it("returns 288 data points for a full day (5-min slots × 24h)", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "E_MINETY-1", level: 50, time: "2026-05-15T00:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result).toHaveLength(288);
  });

  it("each point has time, battery, pumped, total fields", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "E_MINETY-1", level: 30, time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result[0]).toMatchObject({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      battery: expect.any(Number),
      pumped: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it("applies step-hold: a dispatch level persists until replaced", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "E_MINETY-1", level: 100, time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");

    const slotAt10 = result.find((p) => p.time.startsWith("2026-05-15T10:00"));
    const slotAt11 = result.find((p) => p.time.startsWith("2026-05-15T11:00"));
    expect(slotAt10?.battery).toBe(100);
    expect(slotAt11?.battery).toBe(100); // held from 10:00 dispatch
  });

  it("sums MW across multiple BESS BMUs in each slot", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "E_MINETY-1", level: 50, time: "2026-05-15T10:00:00Z" },
        { bmu: "E_PILGR-1",  level: 75, time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    const slotAt10 = result.find((p) => p.time.startsWith("2026-05-15T10:00"));
    expect(slotAt10?.battery).toBe(125); // 50 + 75
  });

  it("filters out non-BESS BMUs (not in reference list)", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "UNKNOWN-WIND-FARM", level: 999, time: "2026-05-15T10:00:00Z" },
        { bmu: "E_MINETY-1",        level: 30,  time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    const slotAt10 = result.find((p) => p.time.startsWith("2026-05-15T10:00"));
    expect(slotAt10?.battery).toBe(30); // UNKNOWN-WIND-FARM excluded
  });

  it("normalises bmUnit field when nationalGridBmUnit is absent", async () => {
    const refWithBmUnitOnly = {
      ok: true,
      json: async () => ({
        data: [
          { nationalGridBmUnit: "E_MINETY-1", bmUnitType: "S", fuelType: "OTHER", generationCapacity: "50", demandCapacity: "50" },
        ],
      }),
    };
    const boalfWithBmUnitOnly = {
      ok: true,
      json: async () => ({
        data: [
          // nationalGridBmUnit absent — falls back to bmUnit
          { bmUnit: "E_MINETY-1", levelFrom: 40, timeFrom: "2026-05-15T10:00:00Z" },
        ],
      }),
    };

    mockFetch
      .mockResolvedValueOnce(refWithBmUnitOnly)
      .mockResolvedValueOnce(boalfWithBmUnitOnly);

    const result = await fetchStorageDataForDate("2026-05-15");
    const slotAt10 = result.find((p) => p.time.startsWith("2026-05-15T10:00"));
    expect(slotAt10?.battery).toBe(40);
  });

  it("returns empty array when BOALF fetch fails (graceful degradation)", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result).toEqual([]);
  });

  it("returns empty array when no BESS units match", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "T_WINDONLY", level: 500, time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result).toEqual([]);
  });
});
