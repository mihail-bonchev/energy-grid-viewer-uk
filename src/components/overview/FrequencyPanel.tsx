"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { FrequencyPoint, FrequencyResponse } from "@/lib/frequency";
import { NOMINAL_HZ, LOW_LIMIT_HZ, HIGH_LIMIT_HZ } from "@/lib/frequency";
import { fmtTime } from "@/lib/elexon";
import { useOverlayResponse, useTicker } from "./useOverlayData";
import { frequencyColor, frequencyDomain, fmtPctOutside } from "./helpers";
import { AXIS_TICK, CHART_MARGIN, Panel, Legend, LoadingNote, FootNote, TooltipBox, TooltipRow } from "./ui";

const LINE_COL = "#38bdf8";
const LIMIT_COL = "rgba(248,113,113,0.6)";
const POLL_MS = 60_000; // frequency moves fast — refresh every minute while open

const fmtSeconds = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" });

function FrequencyTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: FrequencyPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const dev = p.hz - NOMINAL_HZ;
  return (
    <TooltipBox label={fmtSeconds(p.time)}>
      <TooltipRow color={frequencyColor(p.hz)} name="Frequency" value={`${p.hz.toFixed(3)} Hz`} />
      <div style={{ color: "var(--text-dim)", fontSize: 10 }}>{dev >= 0 ? "+" : ""}{(dev * 1000).toFixed(0)} mHz from 50 Hz</div>
    </TooltipBox>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ color: "var(--text-dim)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontWeight: 700, fontSize: 15 }}>{value}</div>
      {sub && <div style={{ color: "var(--text-dim)", fontSize: 10 }}>{sub}</div>}
    </div>
  );
}

function FrequencyStats({ stats }: { stats: FrequencyResponse["stats"] }) {
  const { current, min, max, pctOutside, outside } = stats;
  if (!current || !min || !max) return null;
  return (
    <div style={{ display: "flex", gap: 18, fontFamily: "var(--font-mono)" }}>
      <Stat label="Now" value={`${current.hz.toFixed(3)} Hz`} sub={fmtSeconds(current.time)} color={frequencyColor(current.hz)} />
      <Stat label="Today low" value={`${min.hz.toFixed(3)}`} sub={fmtTime(min.time)} color={frequencyColor(min.hz)} />
      <Stat label="Today high" value={`${max.hz.toFixed(3)}`} sub={fmtTime(max.time)} color={frequencyColor(max.hz)} />
      <Stat label="Outside ±0.2" value={fmtPctOutside(pctOutside, outside)} sub="of today" color={outside > 0 ? LIMIT_COL : "var(--discharge)"} />
    </div>
  );
}

function FrequencyChart({ points }: { points: FrequencyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={points} margin={CHART_MARGIN}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" tickFormatter={fmtTime} stroke="transparent" tick={AXIS_TICK} interval={Math.floor(points.length / 8)} />
        <YAxis domain={frequencyDomain(points)} tickFormatter={(v: number) => v.toFixed(2)} stroke="transparent" tick={AXIS_TICK} width={44} />
        <Tooltip content={<FrequencyTooltip />} />
        <ReferenceLine y={NOMINAL_HZ} stroke="rgba(255,255,255,0.3)" strokeDasharray="5 5" />
        <ReferenceLine y={HIGH_LIMIT_HZ} stroke={LIMIT_COL} strokeDasharray="3 3" />
        <ReferenceLine y={LOW_LIMIT_HZ} stroke={LIMIT_COL} strokeDasharray="3 3" />
        <Line type="monotone" dataKey="hz" name="Frequency" stroke={LINE_COL} strokeWidth={1.5} dot={false}
          isAnimationActive={false}
          activeDot={{ r: 3, fill: LINE_COL, stroke: "rgba(0,0,0,0.5)", strokeWidth: 1 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function FrequencyPanel({ refreshKey }: { refreshKey?: string }) {
  const tick = useTicker(POLL_MS);
  const response = useOverlayResponse<FrequencyResponse>("/api/frequency", true, `${refreshKey}-${tick}`);

  return (
    <Panel
      subtitleGap={6}
      title="Grid Frequency — Last Hour"
      subtitle="Hz at 15-second resolution · Elexon (NESO) · ~90 s behind real time · refreshes every minute"
      aside={response && <FrequencyStats stats={response.stats} />}
    >
      <Legend items={[
        { color: LINE_COL, label: "Frequency" },
        { color: "rgba(255,255,255,0.45)", label: "50 Hz nominal", kind: "dash" },
        { color: LIMIT_COL, label: "±0.2 Hz operational limits", kind: "dash" },
      ]} />
      {response?.data.length ? <FrequencyChart points={response.data} /> : <LoadingNote>Loading frequency…</LoadingNote>}
      <FootNote>
        Frequency falls when demand exceeds supply and rises when supply exceeds demand. Batteries provide most of GB&apos;s
        fast frequency response (Dynamic Containment, Moderation and Regulation), reacting within a second to deviations from 50 Hz.
      </FootNote>
    </Panel>
  );
}
