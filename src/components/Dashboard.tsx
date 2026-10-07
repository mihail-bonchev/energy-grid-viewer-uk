"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { ApiResponse } from "@/lib/elexon";
import UnitsTab from "@/components/UnitsTab";
import SitesTab from "@/components/SitesTab";
import DashboardHeader from "@/components/overview/DashboardHeader";
import OverviewTab from "@/components/overview/OverviewTab";
import type { OverlayKey } from "@/components/overview/MainChart";
import type { StorageView } from "@/components/overview/helpers";
import { ToggleButton } from "@/components/overview/ui";

const UKMap = dynamic(() => import("@/components/UKMap"), { ssr: false });

const REFRESH_MS = 300_000; // 5 minutes
type MainTab = "overview" | "units" | "map" | "sites";

const TABS: Array<{ key: MainTab; label: string }> = [
  { key: "overview", label: "⚡ Live Overview" },
  { key: "sites",    label: "📊 Live Sites" },
  { key: "units",    label: "🏭 Fleet Directory" },
  { key: "map",      label: "🗺 Site Map" },
];

// Main data plus a 5-minute auto-refresh and a seconds countdown to the next one.
function useStorageData(initialData: ApiResponse) {
  const [apiData, setApiData] = useState<ApiResponse>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/elexon", { cache: "no-store" });
      setApiData(await res.json());
    } catch (err) {
      console.error("Refresh failed", err);
    } finally {
      setRefreshing(false);
      setCountdown(REFRESH_MS / 1000);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_MS);
    const ticker = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(timer); clearInterval(ticker); };
  }, [refresh]);

  return { apiData, refreshing, countdown, refresh };
}

export default function Dashboard({ initialData }: { initialData: ApiResponse }) {
  const { apiData, refreshing, countdown, refresh } = useStorageData(initialData);
  const [activeTab, setActiveTab] = useState<MainTab>("overview");
  // View and overlay choices live here so they survive switching tabs
  const [view, setView] = useState<StorageView>("battery");
  const [overlays, setOverlays] = useState<Set<OverlayKey>>(new Set());

  const toggleOverlay = useCallback((key: OverlayKey) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const { data, meta } = apiData;
  const currentMW = data[data.length - 1]?.[view] ?? 0;
  const lastUpdated = new Date(meta.lastUpdated).toLocaleTimeString("en-GB");

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 64 }}>
      <DashboardHeader
        meta={meta}
        currentMW={currentMW}
        refreshing={refreshing}
        countdown={countdown}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      <main style={{ padding: "28px 32px 0", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {TABS.map(({ key, label }) => (
            <ToggleButton key={key} size="lg" active={activeTab === key} onClick={() => setActiveTab(key)}>
              {label}
            </ToggleButton>
          ))}
        </div>

        {activeTab === "overview" && (
          <OverviewTab apiData={apiData} view={view} onView={setView} overlays={overlays} onToggle={toggleOverlay} />
        )}
        {activeTab === "sites" && <SitesTab />}
        {activeTab === "units" && <UnitsTab />}
        {activeTab === "map" && <UKMap />}

        <div style={{
          marginTop: 32, paddingTop: 20,
          borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 8,
          fontSize: 11, color: "var(--text-dim)",
          fontFamily: "var(--font-mono)",
        }}>
          <span>GB Grid Battery Storage Dashboard · Data: Elexon Insights API</span>
          <span>
            {meta.source === "mock" ? "🟡 Simulated data" : "🟢 Live data"} · {data.length} points · Updated {lastUpdated}
          </span>
        </div>
      </main>
    </div>
  );
}
