/**
 * Behaviour tests for fetchSystemPrices.
 * Single fetch: Elexon /balancing/settlement/system-prices/{London settlement date}.
 */

export {};

type SystemPricesModule = typeof import("@/lib/system-prices");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const row = (settlementPeriod: number, startTime: string, ssp: number, niv: number, sbp = ssp) => ({
  settlementDate: "2026-05-15", settlementPeriod, startTime,
  systemSellPrice: ssp, systemBuyPrice: sbp, netImbalanceVolume: niv,
  priceDerivationCode: "P", reserveScarcityPrice: 0,
});

describe("fetchSystemPrices", () => {
  let fetchSystemPrices: SystemPricesModule["fetchSystemPrices"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchSystemPrices } = require("@/lib/system-prices"));
    });
  });

  it("requests today's London settlement date", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    const { meta } = await fetchSystemPrices();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain(`/balancing/settlement/system-prices/${meta.settlementDate}`);
    expect(meta.settlementDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("maps SSP, SBP and NIV per SP in London HH:MM, sorted by settlement period", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          row(2, "2026-05-14T23:30:00Z", -12.346, -820.6),
          row(1, "2026-05-14T23:00:00Z", 407.004, 462.06, 410),
        ],
      }),
    });
    const { data } = await fetchSystemPrices();
    expect(data).toEqual([
      { time: "00:00", price: 407, sbp: 410, niv: 462 },    // BST: 23:00Z → 00:00 London
      { time: "00:30", price: -12.35, sbp: -12.35, niv: -821 }, // negative price, long system
    ]);
  });

  it("returns empty data when no SPs are published yet", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    expect((await fetchSystemPrices()).data).toEqual([]);
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchSystemPrices()).rejects.toThrow("System prices 503");
  });
});
