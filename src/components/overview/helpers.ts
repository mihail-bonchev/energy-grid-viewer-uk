// Pure helpers for the Live Overview — no React, so they are unit-tested directly.

import type { ApiResponse, StorageDataPoint } from "@/lib/elexon";
import type { PnlPoint } from "@/lib/pnl";

export type StorageView = "battery" | "pumped" | "total";

export const VIEW_LABELS: Record<StorageView, string> = {
  battery: "BESS",
  pumped: "Pumped Hydro",
  total: "Total Storage",
};

// Agile p/kWh → bar colour (negative pricing shown blue).
export function getPriceColor(price: number): string {
  if (price <= 0) return "#60a5fa";
  if (price < 10) return "#00ffb3";
  if (price < 20) return "#4ade80";
  if (price < 35) return "#fbbf24";
  if (price < 60) return "#f97316";
  return "#ef4444";
}

const CARBON_COLORS: Record<string, string> = {
  "very low": "#00ffb3",
  "low": "#4ade80",
  "moderate": "#fbbf24",
  "high": "#f97316",
  "very high": "#ef4444",
};

export function getCarbonColor(index: string): string {
  return CARBON_COLORS[index] ?? "rgba(255,255,255,0.4)";
}

// Hero icon and caption for the current net output (±50 MW counts as idle).
export function heroIcon(mw: number): string {
  if (mw < -50) return "🔋";
  if (mw > 50) return "⚡";
  return "🔌";
}

export function heroCaption(mw: number, fmt: (mw: number) => string): string {
  if (mw < -50) return `Fleet absorbing ${fmt(Math.abs(mw))} · storing cheap grid power`;
  if (mw > 50) return `Fleet injecting ${fmt(mw)} into the national grid`;
  return "Fleet near net-zero — minimal activity";
}

// Peak discharge/charge, average and a symmetric y-axis bound for today's BESS series.
export function summariseToday(points: StorageDataPoint[]) {
  if (!points.length) return { max: 0, min: 0, avg: 0, yBound: 500 * 1.15 };
  const values = points.map((p) => p.battery);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { max, min, avg, yBound: Math.max(Math.abs(max), Math.abs(min), 500) * 1.15 };
}

// Average BESS MW per local hour of day (00h–23h).
export function buildHourlyData(points: StorageDataPoint[]) {
  const byHour: Record<number, number[]> = {};
  for (const p of points) {
    const h = new Date(p.time).getHours();
    (byHour[h] ??= []).push(p.battery);
  }
  return Array.from({ length: 24 }, (_, h) => {
    const vals = byHour[h] ?? [];
    return {
      hour: `${String(h).padStart(2, "0")}h`,
      avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
    };
  });
}

// Attach yesterday's value for the same HH:MM (UTC) to each of today's points.
export function mergeYesterday(
  today: StorageDataPoint[],
  yesterday: StorageDataPoint[],
  view: StorageView,
): Array<StorageDataPoint & { yesterday?: number | null }> {
  if (!yesterday.length) return today;
  const byMinute = new Map(yesterday.map((p) => [p.time.substring(11, 16), p[view]]));
  return today.map((p) => ({ ...p, yesterday: byMinute.get(p.time.substring(11, 16)) ?? null }));
}

// Convert ISO points to the London "HH:MM" + MW pairs computePnl expects.
export function toLondonMw(points: StorageDataPoint[], view: StorageView): Array<{ time: string; mw: number }> {
  return points.map((p) => ({
    time: new Date(p.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }),
    mw: p[view],
  }));
}

// Running daily total in £k, rounded to 1 dp.
export function pnlTotal(points: PnlPoint[]): number {
  return Math.round(points.reduce((s, p) => s + p.pnl, 0) * 10) / 10;
}

// "+£12.3k" / "-£4k"
export function fmtSignedK(value: number): string {
  return `${value < 0 ? "-" : "+"}£${Math.abs(value).toLocaleString()}k`;
}

// Label and colour for the "Source" row of the Data Sources panel.
export function sourceDisplay(source: ApiResponse["meta"]["source"]): { label: string; color: string } {
  switch (source) {
    case "pn":       return { label: "PN + BOALF", color: "var(--discharge)" };
    case "boalf":    return { label: "BOALF", color: "var(--discharge)" };
    case "mock":     return { label: "MOCK", color: "var(--warn)" };
    default:         return { label: source.toUpperCase(), color: "var(--text-mid)" };
  }
}
