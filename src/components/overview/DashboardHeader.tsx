"use client";

import type { ApiResponse } from "@/lib/elexon";
import { getStatus } from "@/lib/elexon";
import { PulseDot, Badge } from "./ui";

export default function DashboardHeader({ meta, currentMW, refreshing, countdown, lastUpdated, onRefresh }: {
  meta: ApiResponse["meta"];
  currentMW: number;
  refreshing: boolean;
  countdown: number;
  lastUpdated: string;
  onRefresh: () => void;
}) {
  const status = getStatus(currentMW);
  const mono = { color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" };

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(7,8,15,0.85)",
      backdropFilter: "blur(16px)",
      borderBottom: "1px solid var(--border)",
      padding: "16px 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: "linear-gradient(135deg, rgba(0,255,179,0.15), rgba(0,255,179,0.05))",
          border: "1px solid rgba(0,255,179,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>⚡</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>GB Grid Battery Storage</div>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>Transmission-Level BESS · Elexon Insights API</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {meta.source === "mock" && <Badge color="var(--warn)">⚠ SIMULATED DATA</Badge>}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PulseDot color={status.color} />
          <span style={{ color: status.color, fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.1em" }}>
            {refreshing ? "UPDATING…" : status.label}
          </span>
        </div>

        <div style={mono}>Updated {lastUpdated}</div>
        <div style={mono}>↻ {countdown}s</div>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8, padding: "7px 16px",
            color: "var(--text)", fontSize: 12, cursor: "pointer",
            fontFamily: "var(--font-sans)",
            transition: "border-color 0.2s, background 0.2s",
            opacity: refreshing ? 0.5 : 1,
          }}
          onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = "var(--border)"; }}
        >
          Refresh
        </button>
      </div>
    </header>
  );
}
