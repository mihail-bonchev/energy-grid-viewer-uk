"use client";

import { useMemo } from "react";
import type { ApiResponse, StorageDataPoint } from "@/lib/elexon";
import { fmtMW } from "@/lib/elexon";
import { londonDateStr, previousLondonDate } from "@/lib/time";
import { useOverlayData } from "./useOverlayData";
import { VIEW_LABELS, summariseToday, mergeYesterday } from "./helpers";
import type { StorageView } from "./helpers";
import { StatCard } from "./ui";
import HeroStatus from "./HeroStatus";
import MainChart from "./MainChart";
import type { OverlayKey } from "./MainChart";
import PricesPanel from "./PricesPanel";
import CarbonPanel from "./CarbonPanel";
import BmPricesPanel from "./BmPricesPanel";
import SystemPricePanel from "./SystemPricePanel";
import PnlPanel from "./PnlPanel";
import RenewablesPanel from "./RenewablesPanel";
import FrequencyPanel from "./FrequencyPanel";
import BottomRow from "./BottomRow";

export default function OverviewTab({ apiData, view, onView, overlays, onToggle }: {
  apiData: ApiResponse;
  view: StorageView;
  onView: (v: StorageView) => void;
  overlays: Set<OverlayKey>;
  onToggle: (k: OverlayKey) => void;
}) {
  const { data, meta } = apiData;
  const refreshKey = meta.lastUpdated; // overlay panels refetch with each main-data refresh

  const showYesterday = overlays.has("yesterday");
  const yesterdayUrl = `/api/elexon/history?date=${previousLondonDate(londonDateStr())}`;
  const yesterday = useOverlayData<StorageDataPoint>(yesterdayUrl, showYesterday);
  const chartData = useMemo(
    () => (showYesterday ? mergeYesterday(data, yesterday, view) : data),
    [data, yesterday, view, showYesterday],
  );

  const currentMW = data[data.length - 1]?.[view] ?? 0;
  const today = summariseToday(data);

  return (
    <>
      <HeroStatus mw={currentMW} viewLabel={VIEW_LABELS[view]} yBound={today.yBound} />

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Peak Discharge" value={fmtMW(today.max)} accent="var(--discharge)" sub="Max positive today" delay={50} />
        <StatCard label="Peak Charge" value={fmtMW(Math.abs(today.min))} accent="var(--charge)" sub="Max absorption today" delay={100} />
        <StatCard label="Daily Average" value={fmtMW(today.avg)} accent={today.avg >= 0 ? "var(--discharge)" : "var(--charge)"} sub="Net avg output" delay={150} />
        <StatCard label="Data Points" value={data.length} sub="5-min intervals" delay={200} />
        <StatCard label="Source" value="Elexon" accent="var(--accent)" sub="No API key required" delay={250} />
      </div>

      <MainChart
        data={chartData}
        view={view}
        onView={onView}
        overlays={overlays}
        onToggle={onToggle}
        yBound={today.yBound}
        showYesterdayLine={showYesterday && yesterday.length > 0}
      />

      {overlays.has("prices") && <PricesPanel refreshKey={refreshKey} />}
      {overlays.has("carbon") && <CarbonPanel refreshKey={refreshKey} />}
      {overlays.has("bmprices") && <BmPricesPanel refreshKey={refreshKey} />}
      {overlays.has("sysprice") && <SystemPricePanel refreshKey={refreshKey} />}
      {overlays.has("pnl") && <PnlPanel data={data} view={view} refreshKey={refreshKey} />}
      {overlays.has("renewables") && <RenewablesPanel data={data} />}
      {overlays.has("frequency") && <FrequencyPanel refreshKey={refreshKey} />}

      <BottomRow data={data} source={meta.source} />
    </>
  );
}
