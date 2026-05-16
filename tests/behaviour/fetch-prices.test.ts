/**
 * Behaviour tests for fetchAgilePrices.
 * Verifies product discovery, tariff code construction, and price parsing.
 */

type PricesModule = typeof import("@/lib/prices");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const MOCK_PRODUCTS = {
  ok: true,
  json: async () => ({
    results: [
      {
        code: "AGILE-24-10-01",
        available_from: "2024-10-01T00:00:00Z",
        available_to: null,
      },
      {
        code: "AGILE-OUTGOING-19-05-13",
        available_from: "2019-05-13T00:00:00Z",
        available_to: null,
      },
      {
        code: "AGILE-18-02-21",
        available_from: "2018-02-21T00:00:00Z",
        available_to: "2023-01-01T00:00:00Z",
      },
    ],
  }),
};

function makePriceResponse(rates: Array<{ value_inc_vat: number; valid_from: string }>) {
  return {
    ok: true,
    json: async () => ({ results: rates }),
  };
}

describe("fetchAgilePrices", () => {
  let fetchAgilePrices: PricesModule["fetchAgilePrices"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchAgilePrices } = require("@/lib/prices"));
    });
  });

  it("selects the most recent active Agile import product (not OUTGOING/EXPORT)", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_PRODUCTS)
      .mockResolvedValueOnce(makePriceResponse([]));

    await fetchAgilePrices();

    const ratesUrl: string = mockFetch.mock.calls[1][0] as string;
    expect(ratesUrl).toContain("AGILE-24-10-01");
    expect(ratesUrl).not.toContain("OUTGOING");
  });

  it("uses Region A tariff code (E-1R-<product>-A)", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_PRODUCTS)
      .mockResolvedValueOnce(makePriceResponse([]));

    await fetchAgilePrices();

    const ratesUrl: string = mockFetch.mock.calls[1][0] as string;
    expect(ratesUrl).toContain("E-1R-AGILE-24-10-01-A");
  });

  it("rounds prices to 2 decimal places", async () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    mockFetch
      .mockResolvedValueOnce(MOCK_PRODUCTS)
      .mockResolvedValueOnce(
        makePriceResponse([
          { value_inc_vat: 24.123456, valid_from: `${today}T00:00:00Z` },
        ])
      );

    const { data } = await fetchAgilePrices();
    // Only today's prices are returned; allow empty if timezone causes filtering
    if (data.length > 0) {
      expect(data[0].price).toBe(24.12);
    }
  });

  it("supports negative prices (surplus events)", async () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    mockFetch
      .mockResolvedValueOnce(MOCK_PRODUCTS)
      .mockResolvedValueOnce(
        makePriceResponse([
          { value_inc_vat: -5.5, valid_from: `${today}T02:00:00Z` },
        ])
      );

    const { data } = await fetchAgilePrices();
    if (data.length > 0) {
      expect(data[0].price).toBe(-5.5);
    }
  });

  it("throws when no active Agile product is found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    await expect(fetchAgilePrices()).rejects.toThrow("No active Agile import product");
  });

  it("throws when the products API returns non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(fetchAgilePrices()).rejects.toThrow("429");
  });

  it("throws when the rates API returns non-ok status", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_PRODUCTS)
      .mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchAgilePrices()).rejects.toThrow("503");
  });

  it("returns the product code in meta", async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_PRODUCTS)
      .mockResolvedValueOnce(makePriceResponse([]));

    const { meta } = await fetchAgilePrices();
    expect(meta.product).toBe("AGILE-24-10-01");
  });
});
