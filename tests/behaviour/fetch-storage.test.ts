/**
 * Behaviour tests for fetchStorageDataForDate and fetchStorageData.
 * Verifies: PN with BOALF overrides, BOALF-only fallback, FUELINST fallback,
 * acceptance windows (no hold past timeTo), BMU filtering, and request shape.
 * Fetches are URL-routed (see elexon-mock.ts) — PN/BOALF/FUELINST run in parallel.
 */

import { routeElexon, seg, BMU_REF } from "./elexon-mock";

type ElexonModule = typeof import("@/lib/elexon");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const at = (result: Array<{ time: string; battery: number }>, hhmm: string) =>
  result.find((p) => p.time.startsWith(`2026-05-15T${hhmm}`));

describe("fetchStorageDataForDate", () => {
  let fetchStorageDataForDate: ElexonModule["fetchStorageDataForDate"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchStorageDataForDate } = require("@/lib/elexon"));
    });
  });

  it("returns 288 data points for a 24h London day (5-min slots)", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("PILLB-1", 50, "2026-05-15T00:00:00Z")] });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result).toHaveLength(288);
    expect(result[0].time).toBe("2026-05-14T23:00:00.000Z"); // BST: London midnight
  });

  it("each point has time, battery, pumped, total fields", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("PILLB-1", 30, "2026-05-15T10:00:00Z")] });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(result[0]).toMatchObject({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      battery: expect.any(Number),
      pumped: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it("uses PN, including merchant charging the SO never instructed", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("PILLB-1", -80, "2026-05-15T02:00:00Z", { to: "2026-05-15T04:00:00Z" })],
      boalf: [],
    });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "03:00")?.battery).toBe(-80);
  });

  it("lets an in-force BOALF acceptance override PN, then reverts to PN", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("PILLB-1", 90, "2026-05-15T17:00:00Z", { to: "2026-05-15T19:00:00Z" })],
      boalf: [seg("PILLB-1", 0, "2026-05-15T17:30:00Z", { to: "2026-05-15T18:00:00Z", acc: 7 })],
    });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "17:15")?.battery).toBe(90); // PN
    expect(at(result, "17:45")?.battery).toBe(0);  // SO instructed down to 0 — overrides PN
    expect(at(result, "18:15")?.battery).toBe(90); // acceptance over — back to PN
  });

  it("sums the physical estimate across BMUs (PN-only and BOALF-only units)", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("PILLB-1", 50, "2026-05-15T10:00:00Z")],
      boalf: [seg("KILSB-1", 75, "2026-05-15T10:00:00Z", { acc: 1 })],
    });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:00")?.battery).toBe(125);
  });

  it("falls back to BOALF only when PN fails, with no hold past timeTo", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: "fail",
      boalf: [seg("PILLB-1", 100, "2026-05-15T10:00:00Z", { to: "2026-05-15T10:30:00Z", acc: 1 })],
    });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:25")?.battery).toBe(100);
    expect(at(result, "10:30")?.battery).toBe(0);
  });

  it("ramps linearly between levelFrom and levelTo", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("PILLB-1", 0, "2026-05-15T10:00:00Z", { to: "2026-05-15T10:20:00Z", levelTo: 40 })],
    });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:10")?.battery).toBe(20);
  });

  it("requests PN and BOALF streams filtered to BESS units only", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("PILLB-1", 1, "2026-05-15T10:00:00Z")] });
    await fetchStorageDataForDate("2026-05-15");
    const urls = mockFetch.mock.calls.map((c) => String(c[0]));
    for (const ds of ["PN", "BOALF"]) {
      const url = urls.find((u) => u.includes(`/datasets/${ds}/stream?`))!;
      expect(url).toContain("from=2026-05-14T23:00:00.000Z");
      expect(url).toContain("bmUnit=PILLB-1");
      expect(url).toContain("bmUnit=KILSB-2");
      expect(url).not.toContain("CLVHS-1");   // solar
      expect(url).not.toContain("AG-AFLX01"); // supplier BMU
    }
  });

  it("ignores rows for units outside the BESS list", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("CLVHS-1", 100, "2026-05-15T10:00:00Z"), seg("PILLB-1", 30, "2026-05-15T10:00:00Z")],
    });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:00")?.battery).toBe(30);
  });

  it("normalises prefixed bmUnit when nationalGridBmUnit is absent", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [{ bmUnit: "E_PILLB-1", levelFrom: 40, levelTo: 40, timeFrom: "2026-05-15T10:00:00Z", timeTo: "2026-05-15T11:00:00Z" }],
    });
    const result = await fetchStorageDataForDate("2026-05-15");
    expect(at(result, "10:00")?.battery).toBe(40);
  });

  it("returns empty array when both PN and BOALF fail", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: "fail", boalf: "fail" });
    expect(await fetchStorageDataForDate("2026-05-15")).toEqual([]);
  });

  it("returns empty array when no BESS units have records", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [], boalf: [] });
    expect(await fetchStorageDataForDate("2026-05-15")).toEqual([]);
  });
});

describe("fetchStorageData (today)", () => {
  let fetchStorageData: ElexonModule["fetchStorageData"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchStorageData } = require("@/lib/elexon"));
    });
  });

  const recent = new Date(Date.now() - 20 * 60_000).toISOString();
  const fuelRow = (fuelType: string, generation: number) =>
    ({ startTime: recent, fuelType, generation, settlementDate: "x", settlementPeriod: 1, dataset: "FUELINST", publishTime: recent });

  it("labels PN+BOALF data as source 'pn' and merges FUELINST pumped hydro", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("PILLB-1", 60, recent)],
      fuelinst: [fuelRow("PS", 500), fuelRow("OTHER", 3000)],
    });
    const { data, source } = await fetchStorageData();
    expect(source).toBe("pn");
    const last = data[data.length - 1];
    expect(last.battery).toBe(60);
    expect(last.pumped).toBe(500);
  });

  it("labels BOALF-only data as source 'boalf' when PN fails", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: "fail",
      boalf: [seg("PILLB-1", 60, recent, { acc: 1 })],
      fuelinst: [fuelRow("PS", 500)],
    });
    expect((await fetchStorageData()).source).toBe("boalf");
  });

  it("still returns the BESS series if FUELINST fails", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("PILLB-1", 60, recent)], fuelinst: "fail" });
    const { data, source } = await fetchStorageData();
    expect(source).toBe("pn");
    expect(data[data.length - 1]).toMatchObject({ battery: 60, pumped: 0 });
  });

  it("falls back to FUELINST when PN and BOALF both fail", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: "fail", boalf: "fail", fuelinst: [fuelRow("OTHER", 3000)] });
    const { data, source } = await fetchStorageData();
    expect(source).toBe("fuelinst");
    expect(data[0].battery).toBe(3000);
  });

  it("throws when every source fails (route then serves mock data)", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: "fail", boalf: "fail", fuelinst: "fail" });
    await expect(fetchStorageData()).rejects.toThrow();
  });
});
