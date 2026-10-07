"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { ApiResponse, StorageDataPoint } from "@/lib/elexon";
import { fmtMW } from "@/lib/elexon";
import { buildHourlyData, sourceDisplay } from "./helpers";
import { AXIS_TICK, Panel, KeyValueList } from "./ui";

function HourlyPanel({ data }: { data: StorageDataPoint[] }) {
  const hourly = buildHourlyData(data);
  return (
    <Panel
      title="Hourly Average · BESS"
      subtitle="Avg MW per hour of day — typical daily charge/discharge rhythm"
      style={{ animationDelay: "150ms", marginBottom: 0 }}
    >
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={hourly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="hour" stroke="transparent" tick={AXIS_TICK} interval={2} />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(1)}GW`} stroke="transparent" tick={AXIS_TICK} width={44} />
          <Tooltip
            formatter={(val: number) => [fmtMW(val), "Avg"]}
            labelStyle={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}
            contentStyle={{ background: "rgba(7,8,15,0.96)", border: "1px solid var(--border)", borderRadius: 8 }}
            itemStyle={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
          <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
            {hourly.map((entry, i) => (
              <Cell key={i} fill={entry.avg >= 0 ? "var(--discharge)" : "var(--charge)"} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function InfoCard({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up" style={{
      animationDelay: `${delay}ms`,
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "20px",
      flex: 1,
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

export default function BottomRow({ data, source }: { data: StorageDataPoint[]; source: ApiResponse["meta"]["source"] }) {
  const src = sourceDisplay(source);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
      <HourlyPanel data={data} />

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <InfoCard title="Data Sources" delay={200}>
          <KeyValueList rows={[
            ["API", "Elexon Insights Solution", "var(--accent)"],
            ["Primary", "PN + BOALF overrides, per unit", "var(--discharge)"],
            ["Fallback", "BOALF only → FUELINST"],
            ["Source", src.label, src.color],
            ["Auth", "None required — public", "var(--discharge)"],
            ["Scope", "GB transmission-level BESS"],
            ["Refresh", "Every 5 minutes"],
          ]} />
        </InfoCard>

        <InfoCard title="Reading the Chart" delay={250}>
          <KeyValueList rows={[
            ["▲ Green", "Discharging — selling power to grid"],
            ["▼ Blue", "Charging — absorbing grid power"],
            ["PN", "Operator plans incl. merchant trading"],
            ["BOALF", "SO instructions — override PN when active"],
            ["PS field", "Pumped hydro — negative when pumping"],
            ["5–9pm", "Evening peak — typical max discharge"],
          ]} />
        </InfoCard>
      </div>
    </div>
  );
}
