/**
 * Behaviour tests for fetchMarketIndexPrice.
 * Single fetch: Elexon /balancing/pricing/market-index for today's London day.
 */

export {};

type MarketPriceModule = typeof import("@/lib/market-price");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const row = (startTime: string, price: number, volume = 1000, dataProvider = "APXMIDP") =>
  ({ startTime, price, volume, dataProvider, settlementDate: "2026-05-15", settlementPeriod: 1 });

describe("fetchMarketIndexPrice", () => {
  let fetchMarketIndexPrice: MarketPriceModule["fetchMarketIndexPrice"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchMarketIndexPrice } = require("@/lib/market-price"));
    });
  });

  it("requests APXMIDP market index from London midnight", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    await fetchMarketIndexPrice();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("/balancing/pricing/market-index?");
    expect(url).toContain("dataProviders=APXMIDP");
  });

  it("converts to London HH:MM, sorted by time", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [row("2026-05-15T10:30:00Z", 95.5), row("2026-05-15T10:00:00Z", 88.123)] }),
    });
    const { data } = await fetchMarketIndexPrice();
    expect(data).toEqual([
      { time: "11:00", price: 88.12 }, // BST: 10:00Z → 11:00 London
      { time: "11:30", price: 95.5 },
    ]);
  });

  it("drops zero-volume rows and other providers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          row("2026-05-15T10:00:00Z", 90),
          row("2026-05-15T10:00:00Z", 0, 0, "N2EXMIDP"),
          row("2026-05-15T10:30:00Z", 0, 0),
        ],
      }),
    });
    const { data } = await fetchMarketIndexPrice();
    expect(data).toHaveLength(1);
    expect(data[0].price).toBe(90);
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchMarketIndexPrice()).rejects.toThrow("Market index 503");
  });
});
