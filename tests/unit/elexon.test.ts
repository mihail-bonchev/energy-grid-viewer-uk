import { fmtMW, fmtTime, getStatus, generateMockData } from "@/lib/elexon";

// ─── fmtMW ────────────────────────────────────────────────────────────────────

describe("fmtMW", () => {
  it.each<[number | null | undefined, string]>([
    [0,         "0 MW"],
    [500,       "500 MW"],
    [-500,      "-500 MW"],
    [999,       "999 MW"],
    [1000,      "1.00 GW"],
    [1500,      "1.50 GW"],
    [-2000,     "-2.00 GW"],
    [1234,      "1.23 GW"],
    [null,      "—"],
    [undefined, "—"],
  ])("fmtMW(%s) → %s", (input, expected) => {
    expect(fmtMW(input)).toBe(expected);
  });
});

// ─── fmtTime ──────────────────────────────────────────────────────────────────

describe("fmtTime", () => {
  it("returns a HH:MM formatted string", () => {
    const result = fmtTime("2026-05-15T10:30:00.000Z");
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns different times for different ISO strings", () => {
    const t1 = fmtTime("2026-05-15T08:00:00.000Z");
    const t2 = fmtTime("2026-05-15T20:00:00.000Z");
    expect(t1).not.toBe(t2);
  });
});

// ─── getStatus ────────────────────────────────────────────────────────────────

describe("getStatus", () => {
  it("returns DISCHARGING for MW > 50", () => {
    const s = getStatus(51);
    expect(s.label).toBe("DISCHARGING");
    expect(s.color).toBe("#00ffb3");
    expect(s.icon).toBe("▲");
  });

  it("returns CHARGING for MW < -50", () => {
    const s = getStatus(-51);
    expect(s.label).toBe("CHARGING");
    expect(s.color).toBe("#60a5fa");
    expect(s.icon).toBe("▼");
  });

  it.each([-50, -1, 0, 1, 50])("returns IDLE for MW = %d (within ±50)", (mw) => {
    expect(getStatus(mw).label).toBe("IDLE");
  });

  it("returns DISCHARGING for large discharge", () => {
    expect(getStatus(2000).label).toBe("DISCHARGING");
  });

  it("returns CHARGING for large charge", () => {
    expect(getStatus(-2000).label).toBe("CHARGING");
  });
});

// ─── generateMockData ─────────────────────────────────────────────────────────

describe("generateMockData", () => {
  describe("default 24-hour dataset", () => {
    const data = generateMockData(24);

    it("returns 288 points (5-min intervals × 24h)", () => {
      expect(data).toHaveLength(288);
    });

    it("every point has time, battery, pumped, total", () => {
      for (const p of data) {
        expect(typeof p.time).toBe("string");
        expect(typeof p.battery).toBe("number");
        expect(typeof p.pumped).toBe("number");
        expect(typeof p.total).toBe("number");
      }
    });

    it("total equals battery + pumped for every point", () => {
      for (const p of data) {
        expect(p.total).toBe(p.battery + p.pumped);
      }
    });

    it("timestamps are in strictly ascending order", () => {
      for (let i = 1; i < data.length; i++) {
        expect(new Date(data[i].time).getTime()).toBeGreaterThan(
          new Date(data[i - 1].time).getTime()
        );
      }
    });

    it("all timestamps are valid ISO strings", () => {
      for (const p of data) {
        expect(new Date(p.time).getTime()).not.toBeNaN();
      }
    });

    it("battery values are integers (rounded MW)", () => {
      for (const p of data) {
        expect(Number.isInteger(p.battery)).toBe(true);
      }
    });
  });

  it("respects the hours parameter — 12h yields 144 points", () => {
    expect(generateMockData(12)).toHaveLength(144);
  });

  it("respects the hours parameter — 1h yields 12 points", () => {
    expect(generateMockData(1)).toHaveLength(12);
  });

  it("contains both positive (discharge) and negative (charge) battery values", () => {
    const data = generateMockData(24);
    const hasPositive = data.some((p) => p.battery > 0);
    const hasNegative = data.some((p) => p.battery < 0);
    expect(hasPositive).toBe(true);
    expect(hasNegative).toBe(true);
  });
});
