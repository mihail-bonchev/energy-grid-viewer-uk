"use client";

import {
  ComposedChart, Line, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import type { SystemPricePoint } from "@/lib/system-prices";
import type { MarketPricePoint } from "@/lib/market-price";

const PRICE_COL = "#f472b6";
const MIP_COL = "rgba(255,255,255,0.45)";
const SHORT_COL = "#f87171";
const LONG_COL = "#60a5fa";

type ChartPoint = SystemPricePoint & { mip: number | null };

function SystemPriceTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const short = p.niv >= 0;
  const row = (k: string, v: string, color: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
      <span style={{ color: "var(--text-mid)" }}>{k}</span>
      <span style={{ color, fontWeight: 700 }}>{v}</span>
    </div>
  );
  return (
    <div style={{
      background: "rgba(7,8,15,0.96)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 16px",
      fontFamily: "var(--font-mono)", fontSize: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "var(--text-dim)", marginBottom: 8 }}>{label}</div>
      {row("System price", `£${p.price.toLocaleString()}/MWh`, PRICE_COL)}
      {p.sbp !== p.price && row("SBP", `£${p.sbp.toLocaleString()}/MWh`, PRICE_COL)}
      {p.mip !== null && row("Market index", `£${p.mip.toLocaleString()}/MWh`, "var(--text-mid)")}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
        {row("NIV", `${p.niv > 0 ? "+" : ""}${p.niv.toLocaleString()} MWh`, short ? SHORT_COL : LONG_COL)}
        <div style={{ color: "var(--text-dim)", fontSize: 10 }}>
          System {short ? "short — needed more power" : "long — had surplus power"}
        </div>
      </div>
    </div>
  );
}

export default function SystemPricePanel({ data, marketPrices }: {
  data: SystemPricePoint[];
  marketPrices: MarketPricePoint[];
}) {
  const mipByTime = new Map(marketPrices.map((m) => [m.time, m.price]));
  const points: ChartPoint[] = data.map((p) => ({ ...p, mip: mipByTime.get(p.time) ?? null }));

  const prices = data.map((p) => p.price);
  const latest = data[data.length - 1];
  const stats = latest
    ? [
        ["Latest", `£${latest.price.toLocaleString()}`],
        ["High", `£${Math.max(...prices).toLocaleString()}`],
        ["Low", `£${Math.min(...prices).toLocaleString()}`],
      ]
    : [];

  return (
    <div className="animate-fade-up" style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "24px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>System Price &amp; Imbalance — Today</div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 6 }}>
            Imbalance price (SSP/SBP) per half-hour · £/MWh · Elexon · initial settlement values
          </div>
        </div>
        {stats.length > 0 && (
          <div style={{ display: "flex", gap: 18, fontFamily: "var(--font-mono)" }}>
            {stats.map(([k, v]) => (
              <div key={k} style={{ textAlign: "right" }}>
                <div style={{ color: "var(--text-dim)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</div>
                <div style={{ color: PRICE_COL, fontWeight: 700, fontSize: 15 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, fontSize: 12, margin: "6px 0 16px", flexWrap: "wrap" }}>
        {([
          [PRICE_COL, "System price", "line"],
          [MIP_COL, "Market index", "dash"],
          [SHORT_COL, "NIV short", "bar"],
          [LONG_COL, "NIV long", "bar"],
        ] as const).map(([c, l, kind]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: kind === "bar" ? 8 : 16, height: kind === "bar" ? 8 : 3, borderRadius: 2, display: "inline-block",
              background: kind === "dash" ? `repeating-linear-gradient(90deg, ${c} 0 4px, transparent 4px 7px)` : c,
              opacity: kind === "bar" ? 0.6 : 1,
            }} />
            <span style={{ color: "var(--text-dim)" }}>{l}</span>
          </span>
        ))}
      </div>

      {points.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "20px 0" }}>Loading system prices…</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="transparent"
              tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              interval={5}
            />
            <YAxis
              yAxisId="price"
              tickFormatter={(v: number) => `£${v}`}
              stroke="transparent"
              tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              width={48}
            />
            <YAxis
              yAxisId="niv"
              orientation="right"
              tickFormatter={(v: number) => `${v}`}
              stroke="transparent"
              tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              width={44}
            />
            <Tooltip content={<SystemPriceTooltip />} />
            <ReferenceLine yAxisId="price" y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="5 5" />
            <Bar yAxisId="niv" dataKey="niv" name="NIV" radius={[2, 2, 0, 0]}>
              {points.map((p, i) => (
                <Cell key={i} fill={p.niv >= 0 ? SHORT_COL : LONG_COL} fillOpacity={0.35} />
              ))}
            </Bar>
            <Line
              yAxisId="price"
              type="stepAfter"
              dataKey="mip"
              name="Market index"
              stroke={MIP_COL}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="price"
              type="stepAfter"
              dataKey="price"
              name="System price"
              stroke={PRICE_COL}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: PRICE_COL, stroke: "rgba(0,0,0,0.5)", strokeWidth: 1 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <div style={{ color: "var(--text-dim)", fontSize: 10, marginTop: 8 }}>
        NIV (right axis, MWh): positive = system short, which pushes the price up; negative = long, which pushes it down (can go below zero).
        Each half-hour is published ~20 min after it ends; later settlement runs may revise it.
      </div>
    </div>
  );
}
