/**
 * Behaviour tests for fetchBmPrices.
 * Fetch call order: BMU reference (call #1) then a single BOD/stream request (call #2).
 * jest.isolateModules resets the BMU cache (bmu.ts) and _cache (bm-prices.ts) between tests.
 */

export {};

type BmPricesModule = typeof import("@/lib/bm-prices");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// BMU reference — 2 BESS units + 1 non-BESS
const BMU_REF = {
  ok: true,
  json: async () => ({
    data: [
      { nationalGridBmUnit: "MINTY-1", bmUnitType: "T", fuelType: "OTHER", bmUnitName: "Minty BESS", generationCapacity: "50", demandCapacity: "50" },
      { nationalGridBmUnit: "PILBW-1", bmUnitType: "E", fuelType: null, bmUnitName: "Pilbw Battery Storage", generationCapacity: "100", demandCapacity: "100" },
      { nationalGridBmUnit: "WIND01",  bmUnitType: "G", fuelType: "WIND",  generationCapacity: "200", demandCapacity: "0" },
    ],
  }),
};

// BOD/stream returns a bare array (no { data } wrapper)
function makeBodResponse(records: object[]) {
  return { ok: true, json: async () => records };
}

function bodRecord(overrides: Partial<{
  nationalGridBmUnit: string;
  timeFrom: string;
  pairId: number;
  offer: number;
  bid: number;
}>) {
  return {
    nationalGridBmUnit: "MINTY-1",
    timeFrom: "2026-05-16T10:00:00Z",
    pairId: 1,
    offer: 200,
    bid: -50,
    ...overrides,
  };
}

describe("fetchBmPrices", () => {
  let fetchBmPrices: BmPricesModule["fetchBmPrices"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchBmPrices } = require("@/lib/bm-prices"));
    });
  });

  it("makes one BOD/stream request for the whole day, filtered to BESS units", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValueOnce(makeBodResponse([bodRecord({ pairId: 1, offer: 100 })]));

    await fetchBmPrices();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const url = String(mockFetch.mock.calls[1][0]);
    expect(url).toContain("/datasets/BOD/stream?");
    expect(url).toContain("bmUnit=MINTY-1");
    expect(url).toContain("bmUnit=PILBW-1");
    expect(url).not.toContain("bmUnit=WIND01");
  });

  it("does not cache a failed fetch", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(makeBodResponse([bodRecord({ pairId: 1, offer: 100 })]));

    expect((await fetchBmPrices()).data).toEqual([]);
    expect((await fetchBmPrices()).data[0].avgOffer).toBe(100); // retried, BMU ref cached
  });

  it("fetches BMU reference then BOD and returns aggregated points", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValue(makeBodResponse([
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: 1,  offer: 300, bid: -50 }),
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: -1, offer: 300, bid: -50 }),
        bodRecord({ nationalGridBmUnit: "PILBW-1", pairId: 1,  offer: 400, bid: -70 }),
        bodRecord({ nationalGridBmUnit: "PILBW-1", pairId: -1, offer: 400, bid: -70 }),
      ]));

    const { data } = await fetchBmPrices();
    expect(data.length).toBeGreaterThan(0);
    const point = data[0];
    expect(point.avgOffer).toBe(350); // (300 + 400) / 2
    expect(point.avgBid).toBe(-60);   // (-50 + -70) / 2
    expect(point.unitCount).toBe(2);
  });

  it("excludes non-BESS units (nationalGridBmUnit not in BMU cache)", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValue(makeBodResponse([
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: 1,  offer: 200 }),
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: -1, bid: -50 }),
        bodRecord({ nationalGridBmUnit: "CCGT99",  pairId: 1,  offer: 9999 }), // not a BESS
      ]));

    const { data } = await fetchBmPrices();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].avgOffer).toBe(200); // CCGT99 excluded
    expect(data[0].unitCount).toBe(1);
  });

  it("excludes offer ≥ 9000 (won't-discharge sentinel)", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValue(makeBodResponse([
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: 1, offer: 300 }),
        bodRecord({ nationalGridBmUnit: "PILBW-1", pairId: 1, offer: 9999 }), // sentinel
      ]));

    const { data } = await fetchBmPrices();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].avgOffer).toBe(300); // 9999 excluded, only MINTY-1 counted
  });

  it("excludes |bid| ≥ 5000 (extreme sentinel bids)", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValue(makeBodResponse([
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: -1, bid: -100 }),
        bodRecord({ nationalGridBmUnit: "PILBW-1", pairId: -1, bid: -9999 }), // sentinel
      ]));

    const { data } = await fetchBmPrices();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].avgBid).toBe(-100); // -9999 excluded
  });

  it("deduplicates records with same (bmu, pairId) per settlement period", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValue(makeBodResponse([
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: 1, offer: 300 }),
        bodRecord({ nationalGridBmUnit: "MINTY-1", pairId: 1, offer: 600 }), // duplicate — same bmu+pairId
      ]));

    const { data } = await fetchBmPrices();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].avgOffer).toBe(300); // only first seen, no double-counting
    expect(data[0].unitCount).toBe(1);
  });

  it("returns empty data when BOD fetch fails", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValue({ ok: false, status: 503 });

    const { data } = await fetchBmPrices();
    expect(data).toEqual([]);
  });

  it("returns data sorted by time (HH:MM ascending)", async () => {
    mockFetch
      .mockResolvedValueOnce(BMU_REF)
      .mockResolvedValue(makeBodResponse([
        bodRecord({ nationalGridBmUnit: "MINTY-1", timeFrom: "2026-05-16T12:00:00Z", pairId: 1, offer: 400 }),
        bodRecord({ nationalGridBmUnit: "MINTY-1", timeFrom: "2026-05-16T12:00:00Z", pairId: -1, bid: -80 }),
        bodRecord({ nationalGridBmUnit: "MINTY-1", timeFrom: "2026-05-16T10:00:00Z", pairId: 1, offer: 200 }),
        bodRecord({ nationalGridBmUnit: "MINTY-1", timeFrom: "2026-05-16T10:00:00Z", pairId: -1, bid: -40 }),
      ]));

    const { data } = await fetchBmPrices();
    expect(data.length).toBe(2);
    expect(data[0].time.localeCompare(data[1].time)).toBeLessThan(0);
    expect(data[0].avgOffer).toBe(200);
    expect(data[1].avgOffer).toBe(400);
  });
});
