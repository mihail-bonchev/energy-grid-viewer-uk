/**
 * Behaviour tests for fetchSitesLive.
 * Verifies per-site aggregation of the physical estimate now (BOALF if in force,
 * else PN), the BM-instructed flag, site deduplication (strip trailing -N), sorting,
 * and BOALF-only fallback. Fetches are URL-routed (see elexon-mock.ts).
 */

import { routeElexon, seg, BMU_REF } from "./elexon-mock";

type SitesModule = typeof import("@/lib/sites");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// Windows relative to the real clock, since fetchSitesLive evaluates "now"
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const ACTIVE = { from: iso(-600_000), to: iso(600_000) };     // in force now
const EXPIRED = { from: iso(-1_200_000), to: iso(-600_000) }; // ended 10 min ago

const pnNow = (bmu: string, level: number) => seg(bmu, level, ACTIVE.from, { to: ACTIVE.to });
const boaNow = (bmu: string, level: number, acc = 1) => seg(bmu, level, ACTIVE.from, { to: ACTIVE.to, acc });

describe("fetchSitesLive", () => {
  let fetchSitesLive: SitesModule["fetchSitesLive"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchSitesLive } = require("@/lib/sites"));
    });
  });

  it("groups multiple BMUs from the same site (strip -N suffix) into one entry", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [pnNow("KILSB-1", 30), pnNow("KILSB-2", 20)] });
    const { sites } = await fetchSitesLive();
    const kils = sites.find((s) => s.id === "KILSB")!;
    expect(kils.bmUnits).toEqual(["KILSB-1", "KILSB-2"]);
    expect(kils.currentMW).toBe(50);
    expect(kils.name).toBe("Kilmarnock South");
    expect(kils.capacityMW).toBe(100);
  });

  it("includes PN-only sites (merchant activity, no SO instruction)", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [pnNow("PILLB-1", -40)], boalf: [] });
    const { sites, meta } = await fetchSitesLive();
    expect(sites[0]).toMatchObject({ id: "PILLB", currentMW: -40, bmInstructed: false, name: "Pillswood Battery Storage" });
    expect(meta.source).toBe("pn+boalf");
  });

  it("uses the BOALF level while an acceptance is in force and flags the site", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [pnNow("PILLB-1", 90)], boalf: [boaNow("PILLB-1", 0)] });
    const { sites } = await fetchSitesLive();
    expect(sites[0]).toMatchObject({ id: "PILLB", currentMW: 0, bmInstructed: true }); // instructed to 0 still counts
  });

  it("reverts to PN once the acceptance has expired", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [pnNow("PILLB-1", 90)],
      boalf: [seg("PILLB-1", -50, EXPIRED.from, { to: EXPIRED.to, acc: 1 })],
    });
    const { sites } = await fetchSitesLive();
    expect(sites[0]).toMatchObject({ currentMW: 90, bmInstructed: false });
  });

  it("does not apply a future level yet", async () => {
    routeElexon(mockFetch, {
      bmu: BMU_REF,
      pn: [pnNow("PILLB-1", 50), seg("PILLB-1", 80, iso(600_000), { to: iso(1_800_000) })],
    });
    const { sites } = await fetchSitesLive();
    expect(sites[0].currentMW).toBe(50);
  });

  it("falls back to BOALF only when PN fails", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: "fail", boalf: [boaNow("PILLB-1", 70)] });
    const { sites, meta } = await fetchSitesLive();
    expect(sites[0].currentMW).toBe(70);
    expect(meta.source).toBe("boalf");
  });

  it("sorts sites by |currentMW| descending", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [pnNow("KILSB-1", 10), pnNow("PILLB-1", -90)] });
    const { sites } = await fetchSitesLive();
    expect(sites.map((s) => s.id)).toEqual(["PILLB", "KILSB"]);
  });

  it("counts BMUs reporting in either dataset", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [pnNow("KILSB-1", 0)], boalf: [boaNow("PILLB-1", 5)] });
    const { meta } = await fetchSitesLive();
    expect(meta.reportingUnits).toBe(2);
  });

  it("ignores rows for units outside the BESS list", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: [pnNow("CLVHS-1", 999), pnNow("PILLB-1", 50)] });
    const { sites } = await fetchSitesLive();
    expect(sites.map((s) => s.id)).toEqual(["PILLB"]);
  });

  it("throws when both PN and BOALF fail", async () => {
    routeElexon(mockFetch, { bmu: BMU_REF, pn: "fail", boalf: "fail" });
    await expect(fetchSitesLive()).rejects.toThrow();
  });
});
