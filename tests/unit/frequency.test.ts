import { summariseFrequency } from "@/lib/frequency";

const p = (time: string, hz: number) => ({ time, hz });

describe("summariseFrequency", () => {
  it("returns nulls for no readings", () => {
    expect(summariseFrequency([])).toEqual({ current: null, min: null, max: null, pctOutside: 0, outside: 0, readings: 0 });
  });

  it("finds current, min and max with their times", () => {
    const s = summariseFrequency([p("t1", 50.01), p("t2", 49.91), p("t3", 50.12), p("t4", 50.0)]);
    expect(s.current).toEqual(p("t4", 50.0));
    expect(s.min).toEqual(p("t2", 49.91));
    expect(s.max).toEqual(p("t3", 50.12));
    expect(s.readings).toBe(4);
  });

  it("counts readings outside 49.8–50.2 Hz (limits themselves are inside)", () => {
    const s = summariseFrequency([p("a", 49.8), p("b", 50.2), p("c", 49.79), p("d", 50.21), p("e", 50.0), p("f", 50.0), p("g", 50.0), p("h", 50.0)]);
    expect(s.pctOutside).toBe(25); // 2 of 8
    expect(s.outside).toBe(2);
  });

  it("rounds the percentage to 1 dp", () => {
    const pts = [p("a", 49.7), p("b", 50), p("c", 50)];
    expect(summariseFrequency(pts).pctOutside).toBe(33.3);
  });
});
