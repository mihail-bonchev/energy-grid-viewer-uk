/**
 * Behaviour tests for fetchCarbonIntensity.
 * Verifies parsing logic without hitting the real API.
 */

type FetchCarbonModule = typeof import("@/lib/carbon");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function makeApiResponse(
  records: Array<{ from: string; actual: number | null; forecast: number; index: string }>
) {
  return {
    ok: true,
    json: async () => ({
      data: records.map((r) => ({
        from: r.from,
        intensity: { actual: r.actual, forecast: r.forecast, index: r.index },
      })),
    }),
  };
}

describe("fetchCarbonIntensity", () => {
  let fetchCarbonIntensity: FetchCarbonModule["fetchCarbonIntensity"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchCarbonIntensity } = require("@/lib/carbon"));
    });
  });

  it("uses actual intensity when available", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse([{ from: "2026-05-15T10:00Z", actual: 150, forecast: 200, index: "moderate" }])
    );
    const { data } = await fetchCarbonIntensity();
    expect(data[0].intensity).toBe(150);
    expect(data[0].index).toBe("moderate");
  });

  it("falls back to forecast when actual is null", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse([{ from: "2026-05-15T10:00Z", actual: null, forecast: 220, index: "high" }])
    );
    const { data } = await fetchCarbonIntensity();
    expect(data[0].intensity).toBe(220);
    expect(data[0].index).toBe("high");
  });

  it("formats time as HH:MM", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse([{ from: "2026-05-15T10:00Z", actual: 100, forecast: 100, index: "low" }])
    );
    const { data } = await fetchCarbonIntensity();
    expect(data[0].time).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns all records from the API", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse([
        { from: "2026-05-15T00:00Z", actual: 80,  forecast: 90,  index: "very low" },
        { from: "2026-05-15T00:30Z", actual: 95,  forecast: 100, index: "low" },
        { from: "2026-05-15T01:00Z", actual: null, forecast: 150, index: "moderate" },
      ])
    );
    const { data } = await fetchCarbonIntensity();
    expect(data).toHaveLength(3);
  });

  it("throws when the API returns a non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchCarbonIntensity()).rejects.toThrow("503");
  });

  it("includes the date in the meta field", async () => {
    mockFetch.mockResolvedValueOnce(makeApiResponse([]));
    const { meta } = await fetchCarbonIntensity();
    expect(meta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
