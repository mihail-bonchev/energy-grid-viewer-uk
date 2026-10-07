"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { PricePoint } from "@/lib/prices";
import { useOverlayData } from "./useOverlayData";
import { getPriceColor } from "./helpers";
import { AXIS_TICK, CHART_MARGIN, ZERO_LINE, Panel, LoadingNote, TooltipBox, TooltipRow } from "./ui";

function PriceTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const price = payload[0].value;
  return (
    <TooltipBox label={label}>
      <TooltipRow color={getPriceColor(price)} name="Price" value={`${price.toFixed(2)} p/kWh`} />
    </TooltipBox>
  );
}

export default function PricesPanel({ refreshKey }: { refreshKey?: string }) {
  const prices = useOverlayData<PricePoint>("/api/prices", true, refreshKey);

  return (
    <Panel
      title="Octopus Agile Prices — Today"
      subtitle="Half-hourly electricity unit rate · p/kWh inc. VAT · Region A (East England)"
    >
      {prices.length === 0 ? (
        <LoadingNote>Loading prices…</LoadingNote>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={prices} margin={CHART_MARGIN}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" stroke="transparent" tick={AXIS_TICK} interval={5} />
            <YAxis tickFormatter={(v: number) => `${v}p`} stroke="transparent" tick={AXIS_TICK} width={38} />
            <Tooltip content={<PriceTooltip />} />
            <ReferenceLine y={0} {...ZERO_LINE} />
            <Bar dataKey="price" radius={[2, 2, 0, 0]}>
              {prices.map((entry, i) => (
                <Cell key={i} fill={getPriceColor(entry.price)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
