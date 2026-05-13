"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { SiteData } from "@/lib/sites";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT     = "#00ffb3";
const CHARGE_COL = "#60a5fa";
const WARN       = "#fbbf24";
const BORDER     = "rgba(255,255,255,0.08)";
const TEXT_DIM   = "rgba(255,255,255,0.38)";
const TEXT_MID   = "rgba(255,255,255,0.65)";

type SortKey = "output" | "discharge" | "charge" | "capacity";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMW(mw: number): string {
  const abs = Math.abs(mw);
  if (abs >= 1000) return `${(mw / 1000).toFixed(2)} GW`;
  return `${Math.round(mw)} MW`;
}

function siteStatus(mw: number): { label: string; color: string; icon: string } {
  if (mw > 50)  return { label: "DISCHARGING", color: ACCENT,     icon: "▲" };
  if (mw < -50) return { label: "CHARGING",    color: CHARGE_COL, icon: "▼" };
  return           { label: "IDLE",        color: TEXT_DIM,   icon: "●" };
}

function utilizationPct(currentMW: number, capacityMW: number): number {
  if (!capacityMW) return 0;
  return Math.min(100, (Math.abs(currentMW) / capacityMW) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RankBadge({ rank, color }: { rank: number; color: string }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
      background: rank <= 3 ? `${color}18` : "rgba(255,255,255,0.04)",
      border: `1px solid ${rank <= 3 ? color + "44" : BORDER}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-mono)", fontSize: 11,
      color: rank <= 3 ? color : TEXT_DIM,
      fontWeight: rank <= 3 ? 700 : 400,
    }}>
      {rank}
    </div>
  );
}

function UtilBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{
      height: 4, background: "rgba(255,255,255,0.06)",
      borderRadius: 2, overflow: "hidden", width: "100%",
    }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: color, borderRadius: 2,
        transition: "width 0.6s ease",
        opacity: pct > 0 ? 0.85 : 0,
      }} />
    </div>
  );
}

function SummaryChip({
  label, value, color,
}: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: `${color}10`, border: `1px solid ${color}28`,
      borderRadius: 8, padding: "10px 18px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ color: TEXT_DIM, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color, fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SitesTab() {
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("output");
  const [showIdle, setShowIdle] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sites", { cache: "no-store" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSites(json.sites ?? []);
      setLastUpdated(new Date(json.meta?.lastUpdated).toLocaleTimeString("en-GB"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const visible = showIdle ? sites : sites.filter((s) => Math.abs(s.currentMW) > 10);
    return [...visible].sort((a, b) => {
      switch (sortKey) {
        case "discharge": return b.currentMW - a.currentMW;
        case "charge":    return a.currentMW - b.currentMW;
        case "capacity":  return b.capacityMW - a.capacityMW;
        default:          return Math.abs(b.currentMW) - Math.abs(a.currentMW);
      }
    });
  }, [sites, sortKey, showIdle]);

  const discharging = sites.filter((s) => s.currentMW > 50);
  const charging    = sites.filter((s) => s.currentMW < -50);
  const totalDischargeMW = discharging.reduce((s, x) => s + x.currentMW, 0);
  const totalChargeMW    = Math.abs(charging.reduce((s, x) => s + x.currentMW, 0));

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          height: 68, borderRadius: "var(--radius)", background: "var(--bg-card)",
          border: `1px solid ${BORDER}`, overflow: "hidden",
          position: "relative",
        }}>
          <div className="shimmer" style={{ position: "absolute", inset: 0 }} />
        </div>
      ))}
    </div>
  );

  if (error) return (
    <div style={{
      padding: 24, background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius-lg)",
      color: "#f87171", fontFamily: "var(--font-mono)", fontSize: 13,
    }}>
      Failed to load site data: {error}
      <button
        onClick={load}
        style={{
          marginLeft: 16, padding: "4px 12px", borderRadius: 6,
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#f87171", cursor: "pointer", fontSize: 12,
        }}
      >Retry</button>
    </div>
  );

  return (
    <div style={{ animation: "fade-up 0.3s ease both" }}>

      {/* ── Summary chips ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <SummaryChip label={`${discharging.length} discharging`}  value={fmtMW(totalDischargeMW)} color={ACCENT} />
        <SummaryChip label={`${charging.length} charging`}        value={fmtMW(totalChargeMW)}    color={CHARGE_COL} />
        <SummaryChip label="total reporting"                       value={`${sites.length} sites`} color={WARN} />
        {lastUpdated && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
            color: TEXT_DIM, fontSize: 11, fontFamily: "var(--font-mono)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT,
              display: "inline-block", animation: "pulse-ring 2s ease-out infinite" }} />
            Live · Updated {lastUpdated}
            <button
              onClick={load}
              style={{
                marginLeft: 8, padding: "4px 12px", borderRadius: 6,
                background: "var(--bg-card)", border: `1px solid ${BORDER}`,
                color: TEXT_MID, cursor: "pointer", fontSize: 11,
                fontFamily: "var(--font-sans)",
              }}
            >Refresh</button>
          </div>
        )}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 4 }}>
          {([
            { key: "output",    label: "By Output" },
            { key: "discharge", label: "Discharging ↓" },
            { key: "charge",    label: "Charging ↓" },
            { key: "capacity",  label: "By Capacity" },
          ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              style={{
                background: sortKey === key ? "rgba(255,255,255,0.08)" : "transparent",
                border: sortKey === key ? `1px solid ${BORDER}` : "1px solid transparent",
                borderRadius: 6, padding: "6px 14px",
                color: sortKey === key ? "white" : TEXT_DIM,
                fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowIdle((v) => !v)}
          style={{
            background: showIdle ? "rgba(255,255,255,0.08)" : "transparent",
            border: showIdle ? `1px solid ${BORDER}` : "1px solid transparent",
            borderRadius: 6, padding: "6px 14px",
            color: showIdle ? "white" : TEXT_DIM,
            fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)",
            transition: "all 0.15s",
          }}
        >
          {showIdle ? "Hiding idle" : "Show idle"}
        </button>

        <span style={{ color: TEXT_DIM, fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {sorted.length} site{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Sites list ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((site, i) => {
          const st = siteStatus(site.currentMW);
          const pct = utilizationPct(site.currentMW, site.capacityMW);
          const isIdle = Math.abs(site.currentMW) <= 50;

          return (
            <div
              key={site.id}
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${isIdle ? BORDER : st.color + "28"}`,
                borderRadius: "var(--radius)",
                padding: "14px 20px",
                display: "flex", alignItems: "center", gap: 16,
                transition: "border-color 0.2s, background 0.2s",
                opacity: isIdle ? 0.55 : 1,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = isIdle
                  ? "var(--bg-card-hover)"
                  : `rgba(${st.color === ACCENT ? "0,255,179" : "96,165,250"},0.04)`;
                (e.currentTarget as HTMLDivElement).style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
                (e.currentTarget as HTMLDivElement).style.opacity = isIdle ? "0.55" : "1";
              }}
            >
              {/* Rank */}
              <RankBadge rank={i + 1} color={st.color} />

              {/* Site name + operator */}
              <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "white",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {site.name}
                </div>
                <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {site.operator}
                </div>
              </div>

              {/* Region */}
              <div style={{ flex: "0 0 140px", display: "none" }} className="region-col">
                <span style={{
                  background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`,
                  borderRadius: 4, padding: "2px 8px",
                  fontSize: 11, color: TEXT_MID, whiteSpace: "nowrap",
                }}>
                  {site.region}
                </span>
              </div>

              {/* Status badge */}
              <div style={{ flex: "0 0 110px" }}>
                <span style={{
                  background: `${st.color}14`, border: `1px solid ${st.color}30`,
                  borderRadius: 5, padding: "3px 10px",
                  fontSize: 10, color: st.color,
                  fontFamily: "var(--font-mono)", letterSpacing: "0.08em",
                }}>
                  {st.icon} {st.label}
                </span>
              </div>

              {/* Current MW — the hero number */}
              <div style={{ flex: "0 0 110px", textAlign: "right" }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700,
                  color: st.color, lineHeight: 1,
                }}>
                  {site.currentMW > 0 ? "+" : ""}{fmtMW(site.currentMW)}
                </span>
              </div>

              {/* Utilisation bar + capacity label */}
              <div style={{ flex: 1, minWidth: 80, display: "flex", flexDirection: "column", gap: 5 }}>
                <UtilBar pct={pct} color={st.color} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: TEXT_DIM, fontSize: 10, fontFamily: "var(--font-mono)" }}>
                    {pct > 0 ? `${Math.round(pct)}%` : "—"}
                  </span>
                  {site.capacityMW > 0 && (
                    <span style={{ color: TEXT_DIM, fontSize: 10, fontFamily: "var(--font-mono)" }}>
                      {fmtMW(site.capacityMW)} cap
                    </span>
                  )}
                </div>
              </div>

              {/* Unit count */}
              <div style={{ flex: "0 0 48px", textAlign: "right" }}>
                <span style={{ color: TEXT_DIM, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {site.unitCount}u
                </span>
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && !loading && (
          <div style={{
            padding: "48px 24px", textAlign: "center",
            color: TEXT_DIM, fontFamily: "var(--font-mono)", fontSize: 13,
          }}>
            No active sites right now — try enabling "Show idle"
          </div>
        )}
      </div>

      {/* ── Footer note ───────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 16, padding: "10px 14px",
        background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)",
        borderRadius: 8, fontSize: 11, color: "rgba(251,191,36,0.7)", lineHeight: 1.6,
      }}>
        Source: Elexon Insights BOALF data · Only sites with BM dispatch acceptances today are shown · Merchant charging may not be visible · Capacities are approximate
      </div>
    </div>
  );
}
