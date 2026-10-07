import {
  getPriceColor, getCarbonColor, heroIcon, heroCaption, summariseToday, buildHourlyData,
  mergeYesterday, toLondonMw, pnlTotal, fmtSignedK, sourceDisplay, VIEW_LABELS,
} from "@/components/overview/helpers";
import type { StorageDataPoint } from "@/lib/elexon";

const pt = (time: string, battery: number, pumped = 0): StorageDataPoint =>
  ({ time, battery, pumped, total: battery + pumped });

// ─── colours ──────────────────────────────────────────────────────────────────

describe("getPriceColor", () => {
  it.each([
    [-5, "#60a5fa"], [0, "#60a5fa"], [5, "#00ffb3"], [15, "#4ade80"],
    [30, "#fbbf24"], [50, "#f97316"], [80, "#ef4444"],
  ])("%p p/kWh → %s", (price, color) => {
    expect(getPriceColor(price)).toBe(color);
  });
});

describe("getCarbonColor", () => {
  it("maps each carbon index and falls back for unknown values", () => {
    expect(getCarbonColor("very low")).toBe("#00ffb3");
    expect(getCarbonColor("very high")).toBe("#ef4444");
    expect(getCarbonColor("unknown")).toBe("rgba(255,255,255,0.4)");
  });
});

// ─── hero ─────────────────────────────────────────────────────────────────────

describe("heroIcon / heroCaption", () => {
  const fmt = (mw: number) => `${mw} MW`;

  it("charging below -50 MW", () => {
    expect(heroIcon(-300)).toBe("🔋");
    expect(heroCaption(-300, fmt)).toBe("Fleet absorbing 300 MW · storing cheap grid power");
  });

  it("discharging above 50 MW", () => {
    expect(heroIcon(800)).toBe("⚡");
    expect(heroCaption(800, fmt)).toBe("Fleet injecting 800 MW into the national grid");
  });

  it("idle within ±50 MW", () => {
    expect(heroIcon(50)).toBe("🔌");
    expect(heroIcon(-50)).toBe("🔌");
    expect(heroCaption(0, fmt)).toBe("Fleet near net-zero — minimal activity");
  });
});

// ─── summariseToday / buildHourlyData ─────────────────────────────────────────

describe("summariseToday", () => {
  it("returns peak, trough, rounded mean and a symmetric axis bound", () => {
    const s = summariseToday([pt("2026-05-15T10:00:00Z", 1000), pt("2026-05-15T10:05:00Z", -2001), pt("2026-05-15T10:10:00Z", 0)]);
    expect(s).toEqual({ max: 1000, min: -2001, avg: -334, yBound: 2001 * 1.15 });
  });

  it("uses a 500 MW floor for the axis bound", () => {
    expect(summariseToday([pt("2026-05-15T10:00:00Z", 100)]).yBound).toBeCloseTo(575);
  });

  it("handles an empty series", () => {
    expect(summariseToday([])).toEqual({ max: 0, min: 0, avg: 0, yBound: 575 });
  });
});

describe("buildHourlyData", () => {
  it("always returns 24 hours, averaging each local hour and zero-filling gaps", () => {
    const d = new Date(2026, 4, 15, 9, 0); // local 09:00
    const d2 = new Date(2026, 4, 15, 9, 30);
    const out = buildHourlyData([pt(d.toISOString(), 100), pt(d2.toISOString(), 300)]);
    expect(out).toHaveLength(24);
    expect(out[9]).toEqual({ hour: "09h", avg: 200 });
    expect(out[10]).toEqual({ hour: "10h", avg: 0 });
  });
});

// ─── mergeYesterday ───────────────────────────────────────────────────────────

describe("mergeYesterday", () => {
  const today = [pt("2026-05-15T10:00:00.000Z", 50, 5), pt("2026-05-15T10:05:00.000Z", 60, 6)];

  it("attaches yesterday's value for the same HH:MM in the selected view", () => {
    const yesterday = [pt("2026-05-14T10:00:00.000Z", -40, 7)];
    const out = mergeYesterday(today, yesterday, "pumped");
    expect(out[0].yesterday).toBe(7);
    expect(out[1].yesterday).toBeNull(); // no 10:05 point yesterday
  });

  it("returns today unchanged when yesterday is empty", () => {
    expect(mergeYesterday(today, [], "battery")).toBe(today);
  });
});

// ─── P&L helpers ──────────────────────────────────────────────────────────────

describe("toLondonMw", () => {
  it("converts ISO times to London HH:MM and picks the selected view", () => {
    expect(toLondonMw([pt("2026-05-15T10:00:00Z", 40, 9)], "total")).toEqual([{ time: "11:00", mw: 49 }]); // BST
  });
});

describe("pnlTotal / fmtSignedK", () => {
  const p = (pnl: number) => ({ time: "00:00", pnl, avgMW: 0, price: 0 });

  it("sums to 1 dp", () => {
    expect(pnlTotal([p(1.04), p(2.03), p(-0.5)])).toBe(2.6);
    expect(pnlTotal([])).toBe(0);
  });

  it("formats with an explicit sign", () => {
    expect(fmtSignedK(12.5)).toBe("+£12.5k");
    expect(fmtSignedK(0)).toBe("+£0k");
    expect(fmtSignedK(-3)).toBe("-£3k");
  });
});

// ─── labels ───────────────────────────────────────────────────────────────────

describe("sourceDisplay / VIEW_LABELS", () => {
  it("labels each data source", () => {
    expect(sourceDisplay("pn")).toEqual({ label: "PN + BOALF", color: "var(--discharge)" });
    expect(sourceDisplay("boalf").label).toBe("BOALF");
    expect(sourceDisplay("fuelinst")).toEqual({ label: "FUELINST", color: "var(--text-mid)" });
    expect(sourceDisplay("mock").color).toBe("var(--warn)");
  });

  it("has a label for every view", () => {
    expect(VIEW_LABELS).toEqual({ battery: "BESS", pumped: "Pumped Hydro", total: "Total Storage" });
  });
});
