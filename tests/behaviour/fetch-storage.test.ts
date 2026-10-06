/**
 * Behaviour tests for fetchStorageDataForDate.
 * Verifies: BOALF slot-building, acceptance-window levels (no hold past timeTo),
 * BMU filtering, and error fallback (returns [] on failure).
 *
 * Call order — Promise.all([fetchBessBmuIds(), fetch(BOALF)]):
 *   mockFetch call #1 → BMU reference response
 *   mockFetch call #2 → BOALF response
 */

export {};

type ElexonModule = typeof import("@/lib/elexon");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// Shapes mirror the live Elexon reference data (NG IDs carry no E_/T_ prefix)
const MOCK_BMU_REF = {
  ok: true,
  json: async () => ({
    data: [
      { nationalGridBmUnit: "PILLB-1", bmUnitType: "E", fuelType: null, bmUnitName: "Pillswood 1 Battery Storage", generationCapacity: "49.9", demandCapacity: "-49.9" },
      { nationalGridBmUnit: "KILSB-1", bmUnitType: "T", fuelType: null, bmUnitName: "T_KILSB-1", generationCapacity: "54", demandCapacity: "-54" },
      { nationalGridBmUnit: "CLVHS-1", bmUnitType: "T", fuelType: "OTHER", bmUnitName: "Cleve Hill Solar 1", generationCapacity: "112", demandCapacity: "0" },
      { nationalGridBmUnit: "AG-AFLX01", bmUnitType: "S", fuelType: null, bmUnitName: "2__AFLEX001", generationCapacity: "49", demandCapacity: "0" },
    ],
  }),
};

type BoalfSpec = { bmu: string; level: number; time: string; to?: string; levelTo?: number; acc?: number };

function makeBoalfResponse(records: BoalfSpec[]) {
  return {
    ok: true,
    json: async () => ({
      data: records.map((r) => ({
        nationalGridBmUnit: r.bmu,
        levelFrom: r.level,
        levelTo: r.levelTo ?? r.level,
        timeFrom: r.time,
        timeTo: r.to ?? new Date(Date.parse(r.time) + 3_600_000).toISOString(),
        acceptanceNumber: r.acc ?? 1,
      })),
    }),
  };
}

const at = (result: Array<{ time: string; battery: number }>, hhmm: string) =>
  result.find((p) => p.time.startsWith(`2026-05-15T${hhmm}`));

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
        { bmu: "PILLB-1", level: 50, time: "2026-05-15T00:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result).toHaveLength(288);
  });

  it("each point has time, battery, pumped, total fields", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "PILLB-1", level: 30, time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result[0]).toMatchObject({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      battery: expect.any(Number),
      pumped: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it("holds a level for the acceptance window, then drops to 0 after timeTo", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "PILLB-1", level: 100, time: "2026-05-15T10:00:00Z", to: "2026-05-15T10:30:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "09:55")?.battery).toBe(0);
    expect(at(result, "10:00")?.battery).toBe(100);
    expect(at(result, "10:25")?.battery).toBe(100);
    expect(at(result, "10:30")?.battery).toBe(0);  // window ended — not held
    expect(at(result, "11:00")?.battery).toBe(0);
  });

  it("ramps linearly between levelFrom and levelTo", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "PILLB-1", level: 0, levelTo: 40, time: "2026-05-15T10:00:00Z", to: "2026-05-15T10:20:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:10")?.battery).toBe(20);
  });

  it("sums MW across multiple BESS BMUs in each slot", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "PILLB-1", level: 50, time: "2026-05-15T10:00:00Z" },
        { bmu: "KILSB-1", level: 75, time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:00")?.battery).toBe(125); // 50 + 75
  });

  it("excludes solar, supplier/VPP and unknown BMUs", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "CLVHS-1",   level: 100, time: "2026-05-15T10:00:00Z" }, // solar, fuelType OTHER
        { bmu: "AG-AFLX01", level: 200, time: "2026-05-15T10:00:00Z" }, // supplier BMU, type S
        { bmu: "UNKNOWN-1", level: 999, time: "2026-05-15T10:00:00Z" },
        { bmu: "PILLB-1",   level: 30,  time: "2026-05-15T10:00:00Z" },
      ]));

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:00")?.battery).toBe(30);
  });

  it("normalises prefixed bmUnit when nationalGridBmUnit is absent", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_BMU_REF)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            // nationalGridBmUnit absent — falls back to bmUnit with E_ prefix stripped
            { bmUnit: "E_PILLB-1", levelFrom: 40, levelTo: 40, timeFrom: "2026-05-15T10:00:00Z", timeTo: "2026-05-15T11:00:00Z", acceptanceNumber: 1 },
          ],
        }),
      });

    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:00")?.battery).toBe(40);
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
