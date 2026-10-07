"use client";

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { StorageDataPoint } from "@/lib/elexon";
import { fmtMW, fmtTime, getStatus } from "@/lib/elexon";
import { VIEW_LABELS } from "./helpers";
import type { StorageView } from "./helpers";
import { Legend, ToggleButton, TooltipBox, TooltipRow } from "./ui";

export type OverlayKey = "prices" | "carbon" | "yesterday" | "bmprices" | "sysprice" | "pnl" | "renewables";

export const OVERLAYS: Array<{ key: OverlayKey; label: string }> = [
  { key: "prices",     label: "⚡ Prices" },
  { key: "carbon",     label: "🌱 Carbon" },
  { key: "yesterday",  label: "📅 Yesterday" },
  { key: "bmprices",   label: "💷 BM Price" },
  { key: "sysprice",   label: "⚖️ System Price" },
  { key: "pnl",        label: "💰 P&L" },
  { key: "renewables", label: "🌬️ Renewables" },
];

const YESTERDAY_COL = "#a78bfa";

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const status = getStatus(payload[0].value);
  return (
    <TooltipBox label={label ? fmtTime(label) : ""}>
      {payload.map((p) => (
        <TooltipRow key={p.name} color={p.color} name={p.name} value={fmtMW(p.value)}
          valueColor={p.value >= 0 ? "var(--discharge)" : "var(--charge)"} />
      ))}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", color: status.color, fontSize: 11, letterSpacing: "0.08em" }}>
        {status.icon} {status.label}
      </div>
    </TooltipBox>
  );
}

function ChartControls({ view, onView, overlays, onToggle }: {
  view: StorageView;
  onView: (v: StorageView) => void;
  overlays: Set<OverlayKey>;
  onToggle: (k: OverlayKey) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 4 }}>
        {(Object.keys(VIEW_LABELS) as StorageView[]).map((v) => (
          <ToggleButton key={v} active={view === v} onClick={() => onView(v)}>{VIEW_LABELS[v]}</ToggleButton>
        ))}
      </div>
      <div style={{ width: 1, height: 20, background: "var(--border)" }} />
      {OVERLAYS.map(({ key, label }) => (
        <ToggleButton key={key} active={overlays.has(key)} onClick={() => onToggle(key)}>{label}</ToggleButton>
      ))}
    </div>
  );
}

export default function MainChart({ data, view, onView, overlays, onToggle, yBound, showYesterdayLine }: {
  data: Array<StorageDataPoint & { yesterday?: number | null }>;
  view: StorageView;
  onView: (v: StorageView) => void;
  overlays: Set<OverlayKey>;
  onToggle: (k: OverlayKey) => void;
  yBound: number;
  showYesterdayLine: boolean;
}) {
  const legend = [
    { color: "var(--discharge)", label: "Discharging" },
    { color: "var(--charge)", label: "Charging" },
    ...(overlays.has("yesterday") ? [{ color: YESTERDAY_COL, label: "Yesterday", kind: "dash" as const }] : []),
  ];

  return (
    <div className="animate-fade-up" style={{
      animationDelay: "100ms",
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "24px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Storage Output — Today</div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 3 }}>
            Positive = discharging to grid · Negative = charging from grid · 5-min resolution
          </div>
        </div>
        <ChartControls view={view} onView={onView} overlays={overlays} onToggle={onToggle} />
      </div>

      <Legend items={legend} style={{ margin: "0 0 16px" }} />

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {/* Dynamic zero-line split: discharge (green) above zero, charge (blue) below */}
            <linearGradient id="gradDischarge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00ffb3" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#00ffb3" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradCharge" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={fmtTime}
            stroke="transparent"
            tick={{ fill: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            interval={Math.floor(data.length / 12)}
          />
          <YAxis
            domain={[-yBound, yBound]}
            tickFormatter={(v) => `${Math.round(v / 100) / 10}GW`}
            stroke="transparent"
            tick={{ fill: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            width={50}
          />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="5 5" label={{ value: "0", fill: "rgba(255,255,255,0.2)", fontSize: 10 }} />
          {/* Positive area — discharging (green) */}
          <Area
            type="monotone"
            dataKey={view}
            name={VIEW_LABELS[view]}
            stroke="#00ffb3"
            strokeWidth={2}
            fill="url(#gradDischarge)"
            dot={false}
            activeDot={{ r: 5, fill: "#00ffb3", stroke: "rgba(0,0,0,0.6)", strokeWidth: 2 }}
            baseLine={0}
          />
          {/* Negative area — charging (blue): render data clamped to <=0 */}
          <Area
            type="monotone"
            dataKey={(d: StorageDataPoint) => Math.min(0, d[view])}
            name="Charging"
            stroke="#60a5fa"
            strokeWidth={2}
            fill="url(#gradCharge)"
            dot={false}
            activeDot={false}
            legendType="none"
          />
          {/* Yesterday overlay — dashed lavender reference line */}
          {showYesterdayLine && (
            <Line
              type="monotone"
              dataKey="yesterday"
              name="Yesterday"
              stroke={YESTERDAY_COL}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: YESTERDAY_COL, stroke: "rgba(0,0,0,0.5)", strokeWidth: 1 }}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
