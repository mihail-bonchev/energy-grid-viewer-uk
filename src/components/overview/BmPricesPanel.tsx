"use client";

import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { BmPricePoint } from "@/lib/bm-prices";
import { useOverlayData } from "./useOverlayData";
import { AXIS_TICK, CHART_MARGIN, ZERO_LINE, Panel, Legend, LoadingNote, FootNote, TooltipBox, TooltipRow } from "./ui";

const OFFER_COL = "#f59e0b";
const BID_COL = "#60a5fa";

function BmPricesTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; payload: BmPricePoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipBox label={label}>
      {payload.map((p) => (
        <TooltipRow key={p.name} color={p.color} name={p.name} value={`£${p.value.toLocaleString()}/MWh`} />
      ))}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 10 }}>
        {payload[0].payload.unitCount} BESS units
      </div>
    </TooltipBox>
  );
}

function priceLine(dataKey: "avgOffer" | "avgBid", name: string, color: string) {
  return (
    <Line
      type="stepAfter"
      dataKey={dataKey}
      name={name}
      stroke={color}
      strokeWidth={2}
      dot={false}
      activeDot={{ r: 4, fill: color, stroke: "rgba(0,0,0,0.5)", strokeWidth: 1 }}
    />
  );
}

export default function BmPricesPanel({ refreshKey }: { refreshKey?: string }) {
  const bmPrices = useOverlayData<BmPricePoint>("/api/bm-prices", true, refreshKey);

  return (
    <Panel
      subtitleGap={6}
      title="BM Bid/Offer Prices — Today"
      subtitle="Fleet-average submitted prices per half-hour · £/MWh · Elexon BOD dataset · No API key"
    >
      <Legend items={[{ color: OFFER_COL, label: "Offer (discharge)" }, { color: BID_COL, label: "Bid (charge)" }]} />
      {bmPrices.length === 0 ? (
        <LoadingNote>Loading BM prices…</LoadingNote>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={bmPrices} margin={CHART_MARGIN}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" stroke="transparent" tick={AXIS_TICK} interval={5} />
            <YAxis tickFormatter={(v: number) => `£${v}`} stroke="transparent" tick={AXIS_TICK} width={48} />
            <Tooltip content={<BmPricesTooltip />} />
            <ReferenceLine y={0} {...ZERO_LINE} />
            {priceLine("avgOffer", "Offer", OFFER_COL)}
            {priceLine("avgBid", "Bid", BID_COL)}
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <FootNote>
        Offer = price fleet accepts to discharge (sentinels ≥£9,000 excluded) · Bid = price fleet accepts to charge (can be negative — unit pays to charge)
      </FootNote>
    </Panel>
  );
}
