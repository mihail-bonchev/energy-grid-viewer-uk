"use client";

import {
  ComposedChart, Line, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import type { SystemPricePoint } from "@/lib/system-prices";
import type { MarketPricePoint } from "@/lib/market-price";
import { useOverlayData } from "./useOverlayData";
import { AXIS_TICK, CHART_MARGIN, ZERO_LINE, Panel, Legend, LoadingNote, FootNote, TooltipBox } from "./ui";

const PRICE_COL = "#f472b6";
const MIP_COL = "rgba(255,255,255,0.45)";
const SHORT_COL = "#f87171";
const LONG_COL = "#60a5fa";

type ChartPoint = SystemPricePoint & { mip: number | null };

function Row({ k, v, color }: { k: string; v: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
      <span style={{ color: "var(--text-mid)" }}>{k}</span>
      <span style={{ color, fontWeight: 700 }}>{v}</span>
    </div>
  );
}

function SystemPriceTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const short = p.niv >= 0;
  return (
    <TooltipBox label={label}>
      <Row k="System price" v={`£${p.price.toLocaleString()}/MWh`} color={PRICE_COL} />
      {p.sbp !== p.price && <Row k="SBP" v={`£${p.sbp.toLocaleString()}/MWh`} color={PRICE_COL} />}
      {p.mip !== null && <Row k="Market index" v={`£${p.mip.toLocaleString()}/MWh`} color="var(--text-mid)" />}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
        <Row k="NIV" v={`${p.niv > 0 ? "+" : ""}${p.niv.toLocaleString()} MWh`} color={short ? SHORT_COL : LONG_COL} />
        <div style={{ color: "var(--text-dim)", fontSize: 10 }}>
          System {short ? "short — needed more power" : "long — had surplus power"}
        </div>
      </div>
    </TooltipBox>
  );
}

function PriceStats({ data }: { data: SystemPricePoint[] }) {
  if (!data.length) return null;
  const prices = data.map((p) => p.price);
  const stats: Array<[string, number]> = [
    ["Latest", data[data.length - 1].price],
    ["High", Math.max(...prices)],
    ["Low", Math.min(...prices)],
  ];
  return (
    <div style={{ display: "flex", gap: 18, fontFamily: "var(--font-mono)" }}>
      {stats.map(([k, v]) => (
        <div key={k} style={{ textAlign: "right" }}>
          <div style={{ color: "var(--text-dim)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</div>
          <div style={{ color: PRICE_COL, fontWeight: 700, fontSize: 15 }}>£{v.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function SystemPriceChart({ points }: { points: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={points} margin={CHART_MARGIN}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" stroke="transparent" tick={AXIS_TICK} interval={5} />
        <YAxis yAxisId="price" tickFormatter={(v: number) => `£${v}`} stroke="transparent" tick={AXIS_TICK} width={48} />
        <YAxis yAxisId="niv" orientation="right" stroke="transparent" tick={AXIS_TICK} width={44} />
        <Tooltip content={<SystemPriceTooltip />} />
        <ReferenceLine yAxisId="price" y={0} {...ZERO_LINE} />
        <Bar yAxisId="niv" dataKey="niv" name="NIV" radius={[2, 2, 0, 0]}>
          {points.map((p, i) => (
            <Cell key={i} fill={p.niv >= 0 ? SHORT_COL : LONG_COL} fillOpacity={0.35} />
          ))}
        </Bar>
        <Line yAxisId="price" type="stepAfter" dataKey="mip" name="Market index"
          stroke={MIP_COL} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
        <Line yAxisId="price" type="stepAfter" dataKey="price" name="System price"
          stroke={PRICE_COL} strokeWidth={2} dot={false}
          activeDot={{ r: 4, fill: PRICE_COL, stroke: "rgba(0,0,0,0.5)", strokeWidth: 1 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function SystemPricePanel({ refreshKey }: { refreshKey?: string }) {
  const system = useOverlayData<SystemPricePoint>("/api/system-prices", true, refreshKey);
  const market = useOverlayData<MarketPricePoint>("/api/market-price", true, refreshKey);

  const mipByTime = new Map(market.map((m) => [m.time, m.price]));
  const points: ChartPoint[] = system.map((p) => ({ ...p, mip: mipByTime.get(p.time) ?? null }));

  return (
    <Panel
      subtitleGap={6}
      title="System Price & Imbalance — Today"
      subtitle="Imbalance price (SSP/SBP) per half-hour · £/MWh · Elexon · initial settlement values"
      aside={<PriceStats data={system} />}
    >
      <Legend items={[
        { color: PRICE_COL, label: "System price" },
        { color: MIP_COL, label: "Market index", kind: "dash" },
        { color: SHORT_COL, label: "NIV short", kind: "bar" },
        { color: LONG_COL, label: "NIV long", kind: "bar" },
      ]} />
      {points.length === 0 ? <LoadingNote>Loading system prices…</LoadingNote> : <SystemPriceChart points={points} />}
      <FootNote>
        NIV (right axis, MWh): positive = system short, which pushes the price up; negative = long, which pushes it down (can go below zero).
        Each half-hour is published ~20 min after it ends; later settlement runs may revise it.
      </FootNote>
    </Panel>
  );
}
