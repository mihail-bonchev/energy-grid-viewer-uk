/**
 * Behaviour tests for fetchFrequency.
 * Single fetch: Elexon /system/frequency for today's London day (from/to always explicit).
 */

export {};

type FrequencyModule = typeof import("@/lib/frequency");

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
const row = (minsAgo: number, frequency: number) => ({ measurementTime: iso(minsAgo), frequency });

describe("fetchFrequency", () => {
  let fetchFrequency: FrequencyModule["fetchFrequency"];

  beforeEach(() => {
    jest.isolateModules(() => {
      ({ fetchFrequency } = require("@/lib/frequency"));
    });
  });

  it("always sends an explicit from/to window (the default is yesterday)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    await fetchFrequency();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("/system/frequency?from=");
    expect(url).toContain("&to=");
  });

  it("returns only the last hour for the chart, sorted, but stats over the whole day", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [row(1, 50.02), row(120, 49.75), row(30, 50.01), row(90, 50.3)] }),
    });
    const { data, stats } = await fetchFrequency();
    expect(data.map((p) => p.hz)).toEqual([50.01, 50.02]); // 30 and 1 min ago; 90/120 min ago excluded
    expect(stats.min?.hz).toBe(49.75); // from outside the chart window
    expect(stats.max?.hz).toBe(50.3);
    expect(stats.current?.hz).toBe(50.02);
    expect(stats.pctOutside).toBe(50);
  });

  it("handles a day with no readings yet", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    const { data, stats } = await fetchFrequency();
    expect(data).toEqual([]);
    expect(stats.current).toBeNull();
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchFrequency()).rejects.toThrow("Frequency 503");
  });
});
