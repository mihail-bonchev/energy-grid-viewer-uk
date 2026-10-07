"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { CarbonPoint } from "@/lib/carbon";
import { useOverlayData } from "./useOverlayData";
import { getCarbonColor } from "./helpers";
import { AXIS_TICK, CHART_MARGIN, Panel, LoadingNote, TooltipBox, TooltipRow } from "./ui";

function CarbonTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: CarbonPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const { value, payload: entry } = payload[0];
  const color = getCarbonColor(entry.index);
  return (
    <TooltipBox label={label}>
      <TooltipRow color={color} name="Carbon" value={`${value} gCO₂/kWh`} />
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", color, fontSize: 11, letterSpacing: "0.08em" }}>
        {entry.index.toUpperCase()}
      </div>
    </TooltipBox>
  );
}

export default function CarbonPanel({ refreshKey }: { refreshKey?: string }) {
  const carbon = useOverlayData<CarbonPoint>("/api/carbon", true, refreshKey);

  return (
    <Panel
      title="Grid Carbon Intensity — Today"
      subtitle="gCO₂eq/kWh · National Grid ESO · Half-hourly actual & forecast"
    >
      {carbon.length === 0 ? (
        <LoadingNote>Loading carbon data…</LoadingNote>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={carbon} margin={CHART_MARGIN}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" stroke="transparent" tick={AXIS_TICK} interval={5} />
            <YAxis tickFormatter={(v: number) => `${v}`} stroke="transparent" tick={AXIS_TICK} width={38} />
            <Tooltip content={<CarbonTooltip />} />
            <Bar dataKey="intensity" radius={[2, 2, 0, 0]}>
              {carbon.map((entry, i) => (
                <Cell key={i} fill={getCarbonColor(entry.index)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
