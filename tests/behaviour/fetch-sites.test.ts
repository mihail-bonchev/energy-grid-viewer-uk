/**
 * Behaviour tests for fetchSitesLive.
 * Verifies BOALF → per-site aggregation: BMU grouping, step-hold,
 * site deduplication (strip trailing -N), and sorting.
 *
 * Call order in fetchSitesLive — Promise.all([fetch(BOALF), fetchBmuMeta()]):
 *   mockFetch call #1 → BOALF response
 *   mockFetch call #2 → BMU reference response
 */

type SitesModule = typeof import("@/lib/sites");

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
        bmUnitName: "Minety 1",
        leadPartyName: "Gresham Power",
        gspGroupName: "South West",
      },
      {
        nationalGridBmUnit: "E_MINETY-2",
        bmUnitType: "S",
        fuelType: "OTHER",
        generationCapacity: "50",
        demandCapacity: "50",
        bmUnitName: "Minety 2",
        leadPartyName: "Gresham Power",
        gspGroupName: "South West",
      },
      {
        nationalGridBmUnit: "E_PILGR-1",
        bmUnitType: "S",
        fuelType: "OTHER",
        generationCapacity: "100",
        demandCapacity: "100",
        bmUnitName: "Pillswood 1",
        leadPartyName: "Zenobe",
        gspGroupName: "North",
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

describe("fetchSitesLive", () => {
  let fetchSitesLive: SitesModule["fetchSitesLive"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchSitesLive } = require("@/lib/sites"));
    });
  });

  it("groups multiple BMUs from the same site (strip -N suffix) into one entry", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeBoalfResponse([
          { bmu: "E_MINETY-1", level: 30, time: "2026-05-15T10:00:00Z" },
          { bmu: "E_MINETY-2", level: 20, time: "2026-05-15T10:00:00Z" },
        ])
      )
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    const minety = sites.find((s) => s.id === "E_MINETY");
    expect(minety).toBeDefined();
    expect(minety!.bmUnits).toHaveLength(2);
    expect(minety!.currentMW).toBe(50);
  });

  it("sums capacityMW across all BMUs at a site", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeBoalfResponse([
          { bmu: "E_MINETY-1", level: 0, time: "2026-05-15T10:00:00Z" },
          { bmu: "E_MINETY-2", level: 0, time: "2026-05-15T10:00:00Z" },
        ])
      )
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    const minety = sites.find((s) => s.id === "E_MINETY");
    expect(minety!.capacityMW).toBe(100);
  });

  it("uses step-hold: a future dispatch level is not yet applied", async () => {
    const now = new Date();
    const past   = new Date(now.getTime() - 60_000).toISOString();
    const future = new Date(now.getTime() + 60_000).toISOString();

    mockFetch
      .mockResolvedValueOnce(
        makeBoalfResponse([
          { bmu: "E_PILGR-1", level: 50, time: past },
          { bmu: "E_PILGR-1", level: 80, time: future },
        ])
      )
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    const pilgr = sites.find((s) => s.id === "E_PILGR");
    expect(pilgr!.currentMW).toBe(50);
  });

  it("sorts sites by |currentMW| descending", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeBoalfResponse([
          { bmu: "E_MINETY-1", level: 10, time: "2026-05-15T10:00:00Z" },
          { bmu: "E_PILGR-1",  level: 90, time: "2026-05-15T10:00:00Z" },
        ])
      )
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(Math.abs(sites[0].currentMW)).toBeGreaterThanOrEqual(Math.abs(sites[1].currentMW));
  });

  it("includes reportingUnits count in meta", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeBoalfResponse([
          { bmu: "E_MINETY-1", level: 0, time: "2026-05-15T10:00:00Z" },
        ])
      )
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { meta } = await fetchSitesLive();
    expect(meta.reportingUnits).toBe(1);
    expect(meta.source).toBe("boalf");
  });

  it("ignores BMUs not in the reference data", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeBoalfResponse([
          { bmu: "UNKNOWN-BM-UNIT", level: 999, time: "2026-05-15T10:00:00Z" },
          { bmu: "E_PILGR-1",       level: 50,  time: "2026-05-15T10:00:00Z" },
        ])
      )
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(sites).toHaveLength(1);
    expect(sites[0].id).toBe("E_PILGR");
  });
});
