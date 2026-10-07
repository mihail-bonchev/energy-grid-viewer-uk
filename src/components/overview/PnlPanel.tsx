"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { StorageDataPoint } from "@/lib/elexon";
import type { MarketPricePoint } from "@/lib/market-price";
import type { SystemPricePoint } from "@/lib/system-prices";
import { computePnl } from "@/lib/pnl";
import type { PnlPoint } from "@/lib/pnl";
import { useOverlayData } from "./useOverlayData";
import { VIEW_LABELS, toLondonMw, pnlTotal, fmtSignedK } from "./helpers";
import type { StorageView } from "./helpers";
import { AXIS_TICK, CHART_MARGIN, ZERO_LINE, Panel, LoadingNote, FootNote, TooltipBox, TooltipRow, ToggleButton } from "./ui";

type Basis = "market" | "system";

const BASIS_TEXT: Record<Basis, { button: string; source: string; footnote: string }> = {
  market: {
    button: "Market index",
    source: "Elexon Market Index Price",
    footnote: "wholesale Market Index Price (APX), roughly what trading earns",
  },
  system: {
    button: "System price",
    source: "System (imbalance) price",
    footnote: "System (imbalance) price, roughly what balancing activity earns",
  },
};

const pnlColor = (v: number) => (v >= 0 ? "var(--discharge)" : "#ef4444");

function PnlTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: PnlPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const { value, payload: entry } = payload[0];
  const detail = (k: string, v: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--text-dim)", fontSize: 10 }}>
      <span>{k}</span><span style={{ color: "var(--text-mid)" }}>{v}</span>
    </div>
  );
  return (
    <TooltipBox label={label}>
      <TooltipRow color={pnlColor(value)} name="Est. P&L" value={fmtSignedK(value)} />
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 3 }}>
        {detail("avg MW", `${entry.avgMW.toLocaleString()} MW`)}
        {detail("Price", `£${entry.price.toFixed(2)}/MWh`)}
      </div>
    </TooltipBox>
  );
}

function PnlChart({ points }: { points: PnlPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={points} margin={CHART_MARGIN}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" stroke="transparent" tick={AXIS_TICK} interval={5} />
        <YAxis tickFormatter={(v: number) => `£${v}k`} stroke="transparent" tick={AXIS_TICK} width={50} />
        <Tooltip content={<PnlTooltip />} />
        <ReferenceLine y={0} {...ZERO_LINE} />
        <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
          {points.map((entry, i) => (
            <Cell key={i} fill={pnlColor(entry.pnl)} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function PnlPanel({ data, view, refreshKey }: {
  data: StorageDataPoint[];
  view: StorageView;
  refreshKey?: string;
}) {
  const [basis, setBasis] = useState<Basis>("market");
  const market = useOverlayData<MarketPricePoint>("/api/market-price", basis === "market", refreshKey);
  const system = useOverlayData<SystemPricePoint>("/api/system-prices", basis === "system", refreshKey);
  const prices = basis === "system" ? system : market;

  const points = useMemo(() => computePnl(toLondonMw(data, view), prices), [data, view, prices]);
  const total = pnlTotal(points);

  const totalBadge = points.length > 0 && (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div style={{ color: "var(--text-dim)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Today so far</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20, color: pnlColor(total), marginTop: 2 }}>
        {fmtSignedK(total)}
      </div>
    </div>
  );

  return (
    <Panel
      subtitleGap={6}
      title={`Estimated Revenue — Today · ${VIEW_LABELS[view]}`}
      subtitle={`MW output × ${BASIS_TEXT[basis].source} · £k per settlement period · gross estimate only`}
      aside={totalBadge}
    >
      <div style={{ display: "flex", gap: 4, margin: "10px 0 12px" }}>
        {(["market", "system"] as const).map((b) => (
          <ToggleButton key={b} size="sm" active={basis === b} onClick={() => setBasis(b)}>
            Value at {BASIS_TEXT[b].button}
          </ToggleButton>
        ))}
      </div>

      {points.length === 0 ? (
        <LoadingNote>Loading prices…</LoadingNote>
      ) : (
        <>
          <PnlChart points={points} />
          <FootNote>
            Gross estimate only — values output at the {BASIS_TEXT[basis].footnote}. Ignores BM bid/offer prices, ancillary and capacity revenues. The latest half-hours appear once prices are published.
          </FootNote>
        </>
      )}
    </Panel>
  );
}
