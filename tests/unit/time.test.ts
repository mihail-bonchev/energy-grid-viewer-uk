import { londonDateStr, londonMidnightUtc, londonDayBounds, previousLondonDate } from "@/lib/time";
import { getCoordinates, GSP_CENTROIDS, GSP_NAMES } from "@/lib/bess-sites";

const iso = (ms: number) => new Date(ms).toISOString();

// ─── londonDateStr ────────────────────────────────────────────────────────────

describe("londonDateStr", () => {
  it("is the next day for 23:30Z during BST", () => {
    expect(londonDateStr(new Date("2026-10-06T23:30:00Z"))).toBe("2026-10-07");
  });

  it("matches the UTC date during GMT", () => {
    expect(londonDateStr(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });
});

// ─── londonMidnightUtc / londonDayBounds ──────────────────────────────────────

describe("londonMidnightUtc", () => {
  it("is 23:00Z the previous day during BST", () => {
    expect(iso(londonMidnightUtc("2026-10-06"))).toBe("2026-10-05T23:00:00.000Z");
  });

  it("is 00:00Z during GMT", () => {
    expect(iso(londonMidnightUtc("2026-12-01"))).toBe("2026-12-01T00:00:00.000Z");
  });

  it("uses GMT on the spring-forward day (clocks change at 01:00Z)", () => {
    expect(iso(londonMidnightUtc("2026-03-29"))).toBe("2026-03-29T00:00:00.000Z");
  });

  it("uses BST on the fall-back day", () => {
    expect(iso(londonMidnightUtc("2026-10-25"))).toBe("2026-10-24T23:00:00.000Z");
  });
});

describe("londonDayBounds", () => {
  const hours = (d: string) => {
    const [s, e] = londonDayBounds(d);
    return (e - s) / 3_600_000;
  };

  it("is 24h on an ordinary day", () => expect(hours("2026-05-15")).toBe(24));
  it("is 23h when clocks go forward", () => expect(hours("2026-03-29")).toBe(23));
  it("is 25h when clocks go back", () => expect(hours("2026-10-25")).toBe(25));
});

describe("previousLondonDate", () => {
  it.each([
    ["2026-10-07", "2026-10-06"],
    ["2026-03-01", "2026-02-28"],
    ["2026-01-01", "2025-12-31"],
  ])("%s → %s", (d, prev) => {
    expect(previousLondonDate(d)).toBe(prev);
  });
});

// ─── getCoordinates (bess-sites) ──────────────────────────────────────────────

describe("getCoordinates", () => {
  it("uses exact site coords when known", () => {
    expect(getCoordinates("KILSB-3", null)).toEqual([-4.5, 55.59]);
  });

  it("falls back to the GSP group centroid by code", () => {
    expect(getCoordinates("ZZZZB-1", "_P")).toEqual(GSP_CENTROIDS["_P"]);
  });

  it("returns null when the location is unknown", () => {
    expect(getCoordinates("ZZZZB-1", null)).toBeNull();
    expect(getCoordinates("ZZZZB-1", "Unknown")).toBeNull();
  });

  it("places Scottish GSP groups in Scotland and Welsh ones in Wales", () => {
    expect(GSP_NAMES["_N"]).toBe("South Scotland");
    expect(GSP_CENTROIDS["_N"][1]).toBeGreaterThan(55);
    expect(GSP_CENTROIDS["_P"][1]).toBeGreaterThan(56.5);
    expect(GSP_NAMES["_K"]).toBe("South Wales");
    expect(GSP_CENTROIDS["_K"][0]).toBeLessThan(-3);
  });
});
