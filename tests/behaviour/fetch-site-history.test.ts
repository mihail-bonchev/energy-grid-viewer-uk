/**
 * Behaviour tests for fetchSiteTimeSeries.
 * Verifies: requests only the site's BMUs, 5-min slot-building, PN with BOALF
 * overrides, multi-BMU aggregation, and empty/error cases. URL-routed fetches.
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

describe("fetchSiteTimeSeries", () => {
  let fetchSiteTimeSeries: ElexonModule["fetchSiteTimeSeries"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchSiteTimeSeries } = require("@/lib/elexon"));
    });
  });

  it("returns 288 data points for a full day (5-min slots × 24h)", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("KILSB-1", 50, "2026-05-15T00:00:00Z")] });
    expect(await fetchSiteTimeSeries("2026-05-15", "KILSB")).toHaveLength(288);
  });

  it("each point has time, battery, pumped, total fields", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("KILSB-1", 100, "2026-05-15T06:00:00Z")] });
    const result = await fetchSiteTimeSeries("2026-05-15", "KILSB");
    expect(result[0]).toMatchObject({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      battery: expect.any(Number),
      pumped: 0,
      total: expect.any(Number),
    });
  });

  it("requests only the site's BMUs", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("KILSB-1", 1, "2026-05-15T10:00:00Z")] });
    await fetchSiteTimeSeries("2026-05-15", "KILSB");
    const pnUrl = mockFetch.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/PN/stream"))!;
    expect(pnUrl).toContain("bmUnit=KILSB-1");
    expect(pnUrl).toContain("bmUnit=KILSB-2");
    expect(pnUrl).not.toContain("PILLB-1");
  });

  it("aggregates multiple BMUs from the same site", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("KILSB-1", 50, "2026-05-15T10:00:00Z"), seg("KILSB-2", 75, "2026-05-15T10:00:00Z")],
    });
    const result = await fetchSiteTimeSeries("2026-05-15", "KILSB");
    expect(at(result, "10:00")?.battery).toBe(125);
  });

  it("applies BOALF overrides over PN within the acceptance window", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [seg("KILSB-1", 100, "2026-05-15T10:00:00Z", { to: "2026-05-15T11:00:00Z" })],
      boalf: [seg("KILSB-1", 20, "2026-05-15T10:20:00Z", { to: "2026-05-15T10:40:00Z", acc: 3 })],
    });
    const result = await fetchSiteTimeSeries("2026-05-15", "KILSB");
    expect(at(result, "10:10")?.battery).toBe(100);
    expect(at(result, "10:30")?.battery).toBe(20);
    expect(at(result, "10:50")?.battery).toBe(100);
    expect(at(result, "11:00")?.battery).toBe(0); // PN window over
  });

  it("handles negative MW (charging) correctly", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [seg("KILSB-1", -300, "2026-05-15T02:00:00Z")] });
    const result = await fetchSiteTimeSeries("2026-05-15", "KILSB");
    expect(at(result, "02:00")?.battery).toBe(-300);
  });

  it("returns empty array for a site not in the BESS list", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF });
    expect(await fetchSiteTimeSeries("2026-05-15", "NOPEB")).toEqual([]);
    expect(mockFetch.mock.calls.some((c) => String(c[0]).includes("/stream"))).toBe(false);
  });

  it("throws when both PN and BOALF fail", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: "fail", boalf: "fail" });
    await expect(fetchSiteTimeSeries("2026-05-15", "KILSB")).rejects.toThrow("PN 503");
  });
});
