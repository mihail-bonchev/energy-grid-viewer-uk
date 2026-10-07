"use client";

import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { StorageDataPoint } from "@/lib/elexon";
import { fmtMW, fmtTime } from "@/lib/elexon";
import { AXIS_TICK, CHART_MARGIN, Panel, Legend, TooltipBox, TooltipRow } from "./ui";

const WIND_COL = "#2dd4bf";
const SOLAR_COL = "#fbbf24";

function RenewablesTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipBox label={label ? fmtTime(label) : ""}>
      {payload.map((p) => (
        <TooltipRow key={p.name} color={p.color} name={p.name} value={fmtMW(p.value)} />
      ))}
    </TooltipBox>
  );
}

function genLine(dataKey: "wind" | "solar", name: string, color: string) {
  return (
    <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false}
      activeDot={{ r: 4, fill: color, stroke: "rgba(0,0,0,0.5)", strokeWidth: 1 }} />
  );
}

export default function RenewablesPanel({ data }: { data: StorageDataPoint[] }) {
  return (
    <Panel
      subtitleGap={6}
      title="Wind & Solar Generation — Today"
      subtitle="Fleet-level generation estimate · MW · FUELINST (onshore + offshore wind, embedded solar)"
    >
      <Legend items={[{ color: WIND_COL, label: "Wind" }, { color: SOLAR_COL, label: "Solar" }]} />
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" tickFormatter={fmtTime} stroke="transparent" tick={AXIS_TICK}
            interval={Math.floor(data.length / 12)} />
          <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}GW`} stroke="transparent" tick={AXIS_TICK} width={36} />
          <Tooltip content={<RenewablesTooltip />} />
          {genLine("wind", "Wind", WIND_COL)}
          {genLine("solar", "Solar", SOLAR_COL)}
        </ComposedChart>
      </ResponsiveContainer>
    </Panel>
  );
}
