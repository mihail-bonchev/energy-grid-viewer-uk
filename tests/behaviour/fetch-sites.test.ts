/**
 * Behaviour tests for fetchSitesLive.
 * Verifies BOALF → per-site aggregation: BMU grouping, current level = instruction
 * in force now (0 once expired), site deduplication (strip trailing -N), and sorting.
 *
 * Call order in fetchSitesLive — Promise.all([fetch(BOALF), fetchBessUnits()]):
 *   mockFetch call #1 → BOALF response
 *   mockFetch call #2 → BMU reference response
 */

export {};

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
      { nationalGridBmUnit: "KILSB-1", bmUnitType: "T", fuelType: null, bmUnitName: "T_KILSB-1", generationCapacity: "50", demandCapacity: "-50", leadPartyName: "ZENOBE KILMARNOCK SOUTH LTD", gspGroupName: "South Scotland" },
      { nationalGridBmUnit: "KILSB-2", bmUnitType: "T", fuelType: null, bmUnitName: "T_KILSB-2", generationCapacity: "50", demandCapacity: "-50", leadPartyName: "ZENOBE KILMARNOCK SOUTH LTD", gspGroupName: "South Scotland" },
      { nationalGridBmUnit: "PILLB-1", bmUnitType: "E", fuelType: null, bmUnitName: "Pillswood 1 Battery Storage", generationCapacity: "100", demandCapacity: "-100", leadPartyName: "BP Gas Marketing Limited", gspGroupName: "Yorkshire" },
    ],
  }),
};

type BoalfSpec = { bmu: string; level: number; from: string; to: string };

function makeBoalfResponse(records: BoalfSpec[]) {
  return {
    ok: true,
    json: async () => ({
      data: records.map((r, i) => ({
        nationalGridBmUnit: r.bmu,
        levelFrom: r.level,
        levelTo: r.level,
        timeFrom: r.from,
        timeTo: r.to,
        acceptanceNumber: i + 1,
      })),
    }),
  };
}

// Windows relative to the real clock, since fetchSitesLive evaluates "now"
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const ACTIVE = { from: iso(-600_000), to: iso(600_000) };   // in force now
const EXPIRED = { from: iso(-1_200_000), to: iso(-600_000) }; // ended 10 min ago

describe("fetchSitesLive", () => {
  let fetchSitesLive: SitesModule["fetchSitesLive"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchSitesLive } = require("@/lib/sites"));
    });
  });

  it("groups multiple BMUs from the same site (strip -N suffix) into one entry", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "KILSB-1", level: 30, ...ACTIVE },
        { bmu: "KILSB-2", level: 20, ...ACTIVE },
      ]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    const kils = sites.find((s) => s.id === "KILSB");
    expect(kils).toBeDefined();
    expect(kils!.bmUnits).toHaveLength(2);
    expect(kils!.currentMW).toBe(50);
    expect(kils!.name).toBe("Kilmarnock South"); // curated name for code-named units
  });

  it("uses the cleaned bmUnitName when it is human-readable", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([{ bmu: "PILLB-1", level: 10, ...ACTIVE }]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(sites[0].name).toBe("Pillswood Battery Storage");
  });

  it("sums capacityMW across all BMUs at a site", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "KILSB-1", level: 0, ...ACTIVE },
        { bmu: "KILSB-2", level: 0, ...ACTIVE },
      ]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(sites.find((s) => s.id === "KILSB")!.capacityMW).toBe(100);
  });

  it("does not apply a future dispatch level yet", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "PILLB-1", level: 50, ...ACTIVE },
        { bmu: "PILLB-1", level: 80, from: iso(60_000), to: iso(1_200_000) },
      ]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(sites.find((s) => s.id === "PILLB")!.currentMW).toBe(50);
  });

  it("reports 0 MW once an acceptance has expired (no hold past timeTo)", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([{ bmu: "PILLB-1", level: 90, ...EXPIRED }]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(sites.find((s) => s.id === "PILLB")!.currentMW).toBe(0);
  });

  it("sorts sites by |currentMW| descending", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "KILSB-1", level: 10, ...ACTIVE },
        { bmu: "PILLB-1", level: -90, ...ACTIVE },
      ]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(sites[0].id).toBe("PILLB");
  });

  it("includes reportingUnits count in meta", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([{ bmu: "KILSB-1", level: 0, ...ACTIVE }]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { meta } = await fetchSitesLive();
    expect(meta.reportingUnits).toBe(1);
    expect(meta.source).toBe("boalf");
  });

  it("ignores BMUs not in the reference data", async () => {
    mockFetch
      .mockResolvedValueOnce(makeBoalfResponse([
        { bmu: "UNKNOWN-1", level: 999, ...ACTIVE },
        { bmu: "PILLB-1",   level: 50,  ...ACTIVE },
      ]))
      .mockResolvedValueOnce(MOCK_BMU_REF);

    const { sites } = await fetchSitesLive();
    expect(sites).toHaveLength(1);
    expect(sites[0].id).toBe("PILLB");
  });
});
