import { isBessUnit, toBessUnit, siteIdOf, siteDisplayName, boalfLevelAt, boalfActiveAt, physicalLevelAt, physicalSeries, groupBoalf } from "@/lib/bmu";
import type { BoalfRecord } from "@/lib/bmu";

// ─── isBessUnit ───────────────────────────────────────────────────────────────

describe("isBessUnit", () => {
  // Fixtures copied from the live Elexon reference data (2026-10-06)
  it.each([
    ["battery-named, fuelType null", { nationalGridBmUnit: "PILLB-1", bmUnitType: "E", fuelType: null, bmUnitName: "Pillswood 1 Battery Storage" }],
    ["code-named, B-suffix ID", { nationalGridBmUnit: "KILSB-3", bmUnitType: "T", fuelType: null, bmUnitName: "T_KILSB-3" }],
    ["fuelType OTHER, B-suffix ID", { nationalGridBmUnit: "THURB-1", bmUnitType: "T", fuelType: "OTHER", bmUnitName: "T_THURB-1" }],
    ["supplier BMU named BESS", { nationalGridBmUnit: "FBPG02", bmUnitType: "S", fuelType: null, bmUnitName: "Hawthorn Pit BESS" }],
    ["'Storage' in name", { nationalGridBmUnit: "LRDSC-1", bmUnitType: "T", fuelType: "OTHER", bmUnitName: "Lister Storage 1" }],
  ])("includes %s", (_label, unit) => {
    expect(isBessUnit(unit)).toBe(true);
  });

  it.each([
    ["solar with fuelType OTHER", { nationalGridBmUnit: "CLVHS-1", bmUnitType: "T", fuelType: "OTHER", bmUnitName: "Cleve Hill Solar 1" }],
    ["gas peaker with fuelType OTHER", { nationalGridBmUnit: "THUPG-1", bmUnitType: "T", fuelType: "OTHER", bmUnitName: "T_THUPG-1" }],
    ["supplier aggregate (type S)", { nationalGridBmUnit: "AG-AFLX01", bmUnitType: "S", fuelType: null, bmUnitName: "2__AFLEX001" }],
    ["supplier wind (type S)", { nationalGridBmUnit: "ACHLW-1", bmUnitType: "S", fuelType: "WIND", bmUnitName: "C__PSMAR001-AAA-ACH-183" }],
    ["pumped storage hydro", { nationalGridBmUnit: "DINO-1", bmUnitType: "T", fuelType: "PS", bmUnitName: "Dinorwig Storage 1" }],
    ["interconnector", { nationalGridBmUnit: "I_IEG-IFA2", bmUnitType: "I", fuelType: "INTIFA2", bmUnitName: "IFA2" }],
  ])("excludes %s", (_label, unit) => {
    expect(isBessUnit(unit)).toBe(false);
  });
});

// ─── siteIdOf / siteDisplayName ───────────────────────────────────────────────

describe("siteIdOf", () => {
  it.each([
    ["KILSB-3", "KILSB"],
    ["WBURB-41", "WBURB"],
    ["FBPG02", "FBPG02"],
    ["AG-CBS08M", "AG-CBS08M"],
  ])("%s → %s", (id, site) => {
    expect(siteIdOf(id)).toBe(site);
  });
});

describe("siteDisplayName", () => {
  it("uses the curated name for code-named sites", () => {
    expect(siteDisplayName("BLHLB", "T_BLHLB-1")).toBe("Blackhillock");
  });

  it("falls back to the site ID for unnamed codes", () => {
    expect(siteDisplayName("HAMHB", "T_HAMHB-1")).toBe("HAMHB");
    expect(siteDisplayName("BUXTB", "2__GCMRO001")).toBe("BUXTB");
    expect(siteDisplayName("BNKSB", null)).toBe("BNKSB");
  });

  it("cleans unit numbers and stray whitespace from published names", () => {
    expect(siteDisplayName("FERRB", "Ferrybridge BESS BMU-1")).toBe("Ferrybridge BESS");
    expect(siteDisplayName("USKMB", "Uskmouth Battery Unit 2")).toBe("Uskmouth Battery");
    expect(siteDisplayName("LKSDB", "Lakeside  BESS")).toBe("Lakeside BESS");
    expect(siteDisplayName("DALMB", "Dalmarnock_BESS")).toBe("Dalmarnock BESS");
    expect(siteDisplayName("JAMBB", "Jamesfield 1 Battery Storage")).toBe("Jamesfield Battery Storage");
  });
});

// ─── boalfLevelAt ─────────────────────────────────────────────────────────────

const T = (hhmm: string) => Date.parse(`2026-05-15T${hhmm}:00Z`);
const rec = (from: string, to: string, levelFrom: number, levelTo: number, acc: number): BoalfRecord => ({
  timeFrom: `2026-05-15T${from}:00Z`,
  timeTo: `2026-05-15T${to}:00Z`,
  levelFrom,
  levelTo,
  acceptanceNumber: acc,
});

describe("boalfLevelAt", () => {
  it("returns 0 when no records", () => {
    expect(boalfLevelAt([], T("10:00"))).toBe(0);
  });

  it("returns the level inside the window and 0 outside it", () => {
    const recs = [rec("10:00", "10:30", -50, -50, 1)];
    expect(boalfLevelAt(recs, T("09:59"))).toBe(0);
    expect(boalfLevelAt(recs, T("10:00"))).toBe(-50);
    expect(boalfLevelAt(recs, T("10:29"))).toBe(-50);
    expect(boalfLevelAt(recs, T("10:30"))).toBe(0); // half-open: timeTo excluded
    expect(boalfLevelAt(recs, T("12:00"))).toBe(0); // not held after expiry
  });

  it("interpolates linearly across a ramp segment", () => {
    const recs = [rec("10:00", "10:10", 0, 100, 1)];
    expect(boalfLevelAt(recs, T("10:05"))).toBe(50);
  });

  it("lets a later acceptance supersede an overlapping earlier one", () => {
    const recs = [
      rec("10:00", "11:00", 80, 80, 7),
      rec("10:20", "10:40", -30, -30, 9),
    ];
    expect(boalfLevelAt(recs, T("10:10"))).toBe(80);
    expect(boalfLevelAt(recs, T("10:30"))).toBe(-30);
    expect(boalfLevelAt(recs, T("10:50"))).toBe(80);
  });

  it("moves between consecutive segments of the same acceptance", () => {
    const recs = [
      rec("10:00", "10:01", 22, 0, 5),
      rec("10:01", "10:06", -1, -1, 5),
    ];
    expect(boalfLevelAt(recs, T("10:03"))).toBe(-1);
  });
});

// ─── groupBoalf ───────────────────────────────────────────────────────────────

describe("groupBoalf", () => {
  const row = { timeFrom: "2026-05-15T10:00:00Z", timeTo: "2026-05-15T10:30:00Z", levelFrom: 10, levelTo: 10, acceptanceNumber: 1 };

  it("groups by BMU and applies the keep filter", () => {
    const g = groupBoalf(
      [{ ...row, nationalGridBmUnit: "PILLB-1" }, { ...row, nationalGridBmUnit: "PILLB-1" }, { ...row, nationalGridBmUnit: "WIND-1" }],
      (id) => id !== "WIND-1",
    );
    expect([...g.keys()]).toEqual(["PILLB-1"]);
    expect(g.get("PILLB-1")).toHaveLength(2);
  });

  it("strips the E_/T_ prefix from the bmUnit fallback", () => {
    const g = groupBoalf([{ ...row, nationalGridBmUnit: null, bmUnit: "T_KILSB-1" }], () => true);
    expect(g.has("KILSB-1")).toBe(true);
  });

  it("drops rows without a time window", () => {
    const g = groupBoalf([{ nationalGridBmUnit: "PILLB-1", timeFrom: "2026-05-15T10:00:00Z", levelFrom: 5 }], () => true);
    expect(g.size).toBe(0);
  });
});

// ─── PN + BOALF combination ───────────────────────────────────────────────────

describe("physicalLevelAt", () => {
  const pn = [rec("17:00", "18:00", 90, 90, 0)];

  it("uses PN when no acceptance is in force", () => {
    expect(physicalLevelAt(pn, [], T("17:10"))).toBe(90);
    expect(physicalLevelAt(pn, undefined, T("17:10"))).toBe(90);
  });

  it("lets an in-force acceptance replace PN — including an instruction to 0 MW", () => {
    const boa = [rec("17:20", "17:40", 0, 0, 4)];
    expect(physicalLevelAt(pn, boa, T("17:30"))).toBe(0);
    expect(physicalLevelAt(pn, boa, T("17:50"))).toBe(90);
  });

  it("is 0 with neither dataset covering t", () => {
    expect(physicalLevelAt(pn, [], T("19:00"))).toBe(0);
    expect(physicalLevelAt(undefined, undefined, T("19:00"))).toBe(0);
  });
});

describe("boalfActiveAt", () => {
  it("is true inside an acceptance even at 0 MW, false outside", () => {
    const boa = [rec("10:00", "10:30", 0, 0, 1)];
    expect(boalfActiveAt(boa, T("10:10"))).toBe(true);
    expect(boalfActiveAt(boa, T("10:30"))).toBe(false);
    expect(boalfActiveAt(undefined, T("10:10"))).toBe(false);
  });
});

describe("physicalSeries", () => {
  it("matches physicalLevelAt slot by slot across units", () => {
    const pnMap = new Map([
      ["A-1", [rec("10:00", "11:00", 50, 50, 0)]],
      ["B-1", [rec("10:00", "10:30", -20, -20, 0)]],
    ]);
    const boaMap = new Map([["A-1", [rec("10:10", "10:20", 5, 5, 2)]]]);
    const out = physicalSeries(pnMap, boaMap, T("09:55"), T("10:35"));
    // 09:55 nothing · 10:00–10:05 PN 50-20 · 10:10–10:15 BOA 5-20 · 10:20–10:25 PN 50-20 · 10:30+ PN 50
    expect(out.map((p) => p.mw)).toEqual([0, 30, 30, -15, -15, 30, 30, 50, 50]);
    // The sweep must agree with the point-in-time function
    out.forEach((p) => {
      const t = Date.parse(p.time);
      const expected = physicalLevelAt(pnMap.get("A-1"), boaMap.get("A-1"), t) + physicalLevelAt(pnMap.get("B-1"), undefined, t);
      expect(p.mw).toBe(Math.round(expected));
    });
  });

  it("includes units that appear only in BOALF", () => {
    const out = physicalSeries(new Map(), new Map([["A-1", [rec("10:00", "10:30", 40, 40, 1)]]]), T("10:00"), T("10:00"));
    expect(out[0].mw).toBe(40);
  });
});

// ─── toBessUnit ───────────────────────────────────────────────────────────────

describe("toBessUnit", () => {
  it("maps a distribution-connected unit with a GSP group", () => {
    expect(toBessUnit({
      nationalGridBmUnit: "PILLB-1", elexonBmUnit: "E_PILLB-1", bmUnitName: "Pillswood 1 Battery Storage",
      leadPartyName: "BP Gas Marketing Limited", gspGroupId: "_M", gspGroupName: "Yorkshire Electricity",
      bmUnitType: "E", generationCapacity: "49.94", demandCapacity: "-50.06", fpnFlag: true,
    })).toEqual({
      id: "PILLB-1", elexonId: "E_PILLB-1", name: "Pillswood Battery Storage",
      rawName: "Pillswood 1 Battery Storage", operator: "BP Gas Marketing Limited",
      region: "Yorkshire", gspGroupId: "_M", // canonical name from the code, not the variant spelling
      bmUnitType: "E", capacityMW: 50.1, fpnFlag: true,
    });
  });

  it("labels units without a GSP group as Transmission and tolerates missing fields", () => {
    const u = toBessUnit({ nationalGridBmUnit: "BNKSB-1" });
    expect(u).toMatchObject({ region: "Transmission", gspGroupId: null, capacityMW: 0, operator: "Unknown", name: "BNKSB" });
  });
});
