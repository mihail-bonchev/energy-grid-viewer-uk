// ─── GB settlement-day helpers ───────────────────────────────────────────────
// Elexon settlement dates, Agile prices and carbon intensity all follow the
// London calendar day, which starts at 23:00Z the previous day during BST.

const LONDON = "Europe/London";

// "YYYY-MM-DD" for the London calendar day containing `d`.
export function londonDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: LONDON });
}

// UTC ms of London midnight starting `dateStr` (YYYY-MM-DD).
export function londonMidnightUtc(dateStr: string): number {
  const utcMidnight = Date.parse(`${dateStr}T00:00:00Z`);
  // London is UTC+0 or UTC+1. At 00:00Z London reads 00:xx (GMT) or 01:xx (BST);
  // on both clock-change days 00:00Z is still before the 01:00Z switch, so the
  // offset read here is the one in force at London midnight.
  const londonHour = Number(
    new Date(utcMidnight).toLocaleString("en-GB", { timeZone: LONDON, hour: "2-digit", hourCycle: "h23" }),
  );
  return utcMidnight - londonHour * 3_600_000;
}

// [start, end) UTC ms bounds of the London day `dateStr` (23, 24 or 25 hours long).
export function londonDayBounds(dateStr: string): [number, number] {
  const next = new Date(Date.parse(`${dateStr}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return [londonMidnightUtc(dateStr), londonMidnightUtc(next)];
}

// The London day before `dateStr`.
export function previousLondonDate(dateStr: string): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
