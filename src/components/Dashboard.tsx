"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import dynamic from "next/dynamic";
import type { ApiResponse, StorageDataPoint } from "@/lib/elexon";
import type { PricePoint } from "@/lib/prices";
import type { CarbonPoint } from "@/lib/carbon";
import UnitsTab from "@/components/UnitsTab";

const UKMap = dynamic(() => import("@/components/UKMap"), { ssr: false });
import { fmtMW, fmtTime, getStatus } from "@/lib/elexon";

const REFRESH_MS = 300_000; // 5 minutes
type MainTab = "overview" | "units" | "map";

// ─── Sub-components ───────────────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14 }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: color, opacity: 0.35,
        animation: "pulse-ring 2s ease-out infinite",
      }} />
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, position: "relative" }} />
    </span>
  );
}

function StatCard({
  label, value, sub, accent, delay = 0,
}: {
  label: string; value: string | number; sub?: string; accent?: string; delay?: number;
}) {
  return (
    <div className="animate-fade-up" style={{
      animationDelay: `${delay}ms`,
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "18px 20px",
      flex: "1 1 160px",
    }}>
      <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{
        color: accent || "var(--text)",
        fontSize: 22, fontWeight: 700,
        fontFamily: "var(--font-mono)",
        lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 7 }}>{sub}</div>
      )}
    </div>
  );
}

function Badge({ children, color = "var(--warn)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 6, padding: "3px 10px",
      fontSize: 11, color, letterSpacing: "0.06em",
      fontFamily: "var(--font-mono)",
    }}>
      {children}
    </span>
  );
}

// ─── Custom Chart Tooltip ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(7,8,15,0.96)",
      border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 16px",
      fontFamily: "var(--font-mono)", fontSize: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "var(--text-dim)", marginBottom: 8 }}>{label ? fmtTime(label) : ""}</div>
      {payload.map((p) => {
        const status = getStatus(p.value);
        return (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
            <span style={{ color: "var(--text-mid)" }}>{p.name}</span>
            <span style={{ color: p.value >= 0 ? "var(--discharge)" : "var(--charge)", fontWeight: 700, marginLeft: "auto" }}>
              {fmtMW(p.value)}
            </span>
          </div>
        );
      })}
      {payload[0] && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", color: getStatus(payload[0].value).color, fontSize: 11, letterSpacing: "0.08em" }}>
          {getStatus(payload[0].value).icon} {getStatus(payload[0].value).label}
        </div>
      )}
    </div>
  );
}

// ─── Hourly breakdown ─────────────────────────────────────────────────────────

function buildHourlyData(points: StorageDataPoint[]) {
  const byHour: Record<number, number[]> = {};
  points.forEach((p) => {
    const h = new Date(p.time).getHours();
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(p.battery);
  });
  return Array.from({ length: 24 }, (_, h) => {
    const vals = byHour[h] ?? [];
    return {
      hour: `${String(h).padStart(2, "0")}h`,
      avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
    };
  });
}

// ─── Overlay chart tooltips ───────────────────────────────────────────────────

function getPriceColor(price: number): string {
  if (price <= 0) return "#60a5fa";   // negative pricing — charging bonus
  if (price < 10) return "#00ffb3";
  if (price < 20) return "#4ade80";
  if (price < 35) return "#fbbf24";
  if (price < 60) return "#f97316";
  return "#ef4444";
}

function getCarbonColor(index: string): string {
  switch (index) {
    case "very low":  return "#00ffb3";
    case "low":       return "#4ade80";
    case "moderate":  return "#fbbf24";
    case "high":      return "#f97316";
    case "very high": return "#ef4444";
    default:          return "rgba(255,255,255,0.4)";
  }
}

function PriceTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const price = payload[0].value;
  return (
    <div style={{
      background: "rgba(7,8,15,0.96)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 16px",
      fontFamily: "var(--font-mono)", fontSize: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "var(--text-dim)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: getPriceColor(price) }} />
        <span style={{ color: "var(--text-mid)" }}>Price</span>
        <span style={{ color: getPriceColor(price), fontWeight: 700, marginLeft: "auto" }}>
          {price.toFixed(2)} p/kWh
        </span>
      </div>
    </div>
  );
}

function CarbonTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: CarbonPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const { value, payload: entry } = payload[0];
  const color = getCarbonColor(entry.index);
  return (
    <div style={{
      background: "rgba(7,8,15,0.96)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 16px",
      fontFamily: "var(--font-mono)", fontSize: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "var(--text-dim)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ color: "var(--text-mid)" }}>Carbon</span>
        <span style={{ color, fontWeight: 700, marginLeft: "auto" }}>{value} gCO₂/kWh</span>
      </div>
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", color, fontSize: 11, letterSpacing: "0.08em" }}>
        {entry.index.toUpperCase()}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard({ initialData }: { initialData: ApiResponse }) {
  const [apiData, setApiData] = useState<ApiResponse>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [selectedView, setSelectedView] = useState<"battery" | "pumped" | "total">("battery");
  const [activeTab, setActiveTab] = useState<MainTab>("overview");
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [carbonData, setCarbonData] = useState<CarbonPoint[]>([]);
  const [showPrices, setShowPrices] = useState(false);
  const [showCarbon, setShowCarbon] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/elexon", { cache: "no-store" });
      const json: ApiResponse = await res.json();
      setApiData(json);
    } catch (err) {
      console.error("Refresh failed", err);
    } finally {
      setRefreshing(false);
      setCountdown(REFRESH_MS / 1000);
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/prices", { cache: "no-store" });
      const json = await res.json();
      if (json.data) setPriceData(json.data);
    } catch (err) {
      console.error("Prices fetch failed", err);
    }
  }, []);

  const fetchCarbon = useCallback(async () => {
    try {
      const res = await fetch("/api/carbon", { cache: "no-store" });
      const json = await res.json();
      if (json.data) setCarbonData(json.data);
    } catch (err) {
      console.error("Carbon fetch failed", err);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    fetchCarbon();
    timerRef.current = setInterval(refresh, REFRESH_MS);
    countRef.current = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [refresh, fetchPrices, fetchCarbon]);

  const { data, meta } = apiData;
  const latest = data[data.length - 1];
  const currentMW = latest?.[selectedView] ?? 0;
  const status = getStatus(currentMW);

  const todayMax = data.length ? Math.max(...data.map((d) => d.battery)) : 0;
  const todayMin = data.length ? Math.min(...data.map((d) => d.battery)) : 0;
  const avgMW = data.length ? Math.round(data.reduce((a, b) => a + b.battery, 0) / data.length) : 0;
  const yBound = Math.max(Math.abs(todayMax), Math.abs(todayMin), 500) * 1.15;
  const hourlyData = buildHourlyData(data);
  const lastUpdated = new Date(meta.lastUpdated).toLocaleTimeString("en-GB");

  const viewKeys: Array<{ key: typeof selectedView; label: string }> = [
    { key: "battery", label: "BESS" },
    { key: "pumped", label: "Pumped Hydro" },
    { key: "total", label: "Total Storage" },
  ];

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 64 }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
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
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>
              GB Grid Battery Storage
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>
              Transmission-Level BESS · Elexon Insights API
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {meta.source === "mock" && <Badge color="var(--warn)">⚠ SIMULATED DATA</Badge>}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PulseDot color={status.color} />
            <span style={{
              color: status.color, fontSize: 12,
              fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.1em",
            }}>
              {refreshing ? "UPDATING…" : status.label}
            </span>
          </div>

          <div style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            Updated {lastUpdated}
          </div>

          <div style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            ↻ {countdown}s
          </div>

          <button
            onClick={refresh}
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

      <main style={{ padding: "28px 32px 0", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Main tab navigation ───────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {([
            { key: "overview", label: "⚡ Live Overview" },
            { key: "units",    label: "🏭 Fleet Directory" },
            { key: "map",      label: "🗺 Site Map" },
          ] as { key: MainTab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                background: activeTab === key ? "rgba(255,255,255,0.09)" : "transparent",
                border: activeTab === key ? "1px solid var(--border)" : "1px solid transparent",
                borderRadius: 7, padding: "8px 20px",
                color: activeTab === key ? "white" : "var(--text-dim)",
                fontSize: 13, cursor: "pointer", fontFamily: "var(--font-sans)",
                fontWeight: activeTab === key ? 600 : 400,
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Units tab ────────────────────────────────────────────────────── */}
        {activeTab === "units" && <UnitsTab />}

        {/* ── Map tab ──────────────────────────────────────────────────────── */}
        {activeTab === "map" && <UKMap />}

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        {activeTab === "overview" && <>

        {/* ── Hero status ───────────────────────────────────────────────────── */}
        <div className="animate-fade-up" style={{
          background: `linear-gradient(135deg, var(--bg-card), ${currentMW < 0 ? "rgba(96,165,250,0.04)" : "rgba(0,255,179,0.04)"})`,
          border: `1px solid ${currentMW < 0 ? "rgba(96,165,250,0.2)" : "rgba(0,255,179,0.2)"}`,
          borderRadius: "var(--radius-lg)",
          padding: "28px 32px",
          marginBottom: 20,
          display: "flex", alignItems: "center", gap: 32,
          position: "relative", overflow: "hidden",
        }}>
          {/* Background radial glow */}
          <div style={{
            position: "absolute", right: -80, top: -80,
            width: 360, height: 360, borderRadius: "50%",
            background: `radial-gradient(circle, ${status.color}12 0%, transparent 65%)`,
            pointerEvents: "none",
          }} />

          <div style={{ fontSize: 52 }}>{currentMW < -50 ? "🔋" : currentMW > 50 ? "⚡" : "🔌"}</div>

          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Current Net Output · {viewKeys.find((v) => v.key === selectedView)?.label}
            </div>
            <div style={{
              fontSize: 56, fontWeight: 700, lineHeight: 1,
              fontFamily: "var(--font-mono)",
              color: status.color,
            }}>
              {fmtMW(currentMW)}
            </div>
            <div style={{ marginTop: 10, color: "var(--text-mid)", fontSize: 13 }}>
              {currentMW < -50
                ? `Fleet absorbing ${fmtMW(Math.abs(currentMW))} · storing cheap grid power`
                : currentMW > 50
                ? `Fleet injecting ${fmtMW(currentMW)} into the national grid`
                : "Fleet near net-zero — minimal activity"}
            </div>
          </div>

          {/* Vertical charge meter */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, userSelect: "none" }}>
            <span style={{ color: "var(--discharge)", fontSize: 10, letterSpacing: "0.1em" }}>OUT</span>
            <div style={{
              width: 10, height: 120, background: "rgba(255,255,255,0.05)",
              borderRadius: 5, position: "relative", overflow: "hidden",
            }}>
              {currentMW > 0 ? (
                <div style={{
                  position: "absolute", bottom: "50%", left: 0, right: 0,
                  height: `${Math.min(48, (currentMW / yBound) * 50)}%`,
                  background: `linear-gradient(to top, var(--discharge), rgba(0,255,179,0.3))`,
                  borderRadius: "3px 3px 0 0",
                  transition: "height 1s ease",
                }} />
              ) : (
                <div style={{
                  position: "absolute", top: "50%", left: 0, right: 0,
                  height: `${Math.min(48, (Math.abs(currentMW) / yBound) * 50)}%`,
                  background: `linear-gradient(to bottom, var(--charge), rgba(96,165,250,0.3))`,
                  borderRadius: "0 0 3px 3px",
                  transition: "height 1s ease",
                }} />
              )}
              <div style={{
                position: "absolute", top: "50%", left: 0, right: 0,
                height: 1, background: "rgba(255,255,255,0.2)",
              }} />
            </div>
            <span style={{ color: "var(--charge)", fontSize: 10, letterSpacing: "0.1em" }}>IN</span>
          </div>
        </div>

        {/* ── Stat cards ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <StatCard label="Peak Discharge" value={fmtMW(todayMax)} accent="var(--discharge)" sub="Max positive today" delay={50} />
          <StatCard label="Peak Charge" value={fmtMW(Math.abs(todayMin))} accent="var(--charge)" sub="Max absorption today" delay={100} />
          <StatCard label="Daily Average" value={fmtMW(avgMW)} accent={avgMW >= 0 ? "var(--discharge)" : "var(--charge)"} sub="Net avg output" delay={150} />
          <StatCard label="Data Points" value={data.length} sub="5-min intervals" delay={200} />
          <StatCard label="Source" value="Elexon" accent="var(--accent)" sub="No API key required" delay={250} />
        </div>

        {/* ── View selector + main chart ────────────────────────────────────── */}
        <div className="animate-fade-up" style={{
          animationDelay: "100ms",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: "24px",
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Storage Output — Today</div>
              <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 3 }}>
                Positive = discharging to grid · Negative = charging from grid · 5-min resolution
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* View toggles */}
              <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 4 }}>
                {viewKeys.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedView(key)}
                    style={{
                      background: selectedView === key ? "rgba(255,255,255,0.08)" : "transparent",
                      border: selectedView === key ? "1px solid var(--border)" : "1px solid transparent",
                      borderRadius: 6, padding: "6px 14px",
                      color: selectedView === key ? "var(--text)" : "var(--text-dim)",
                      fontSize: 12, cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Overlay toggles */}
              <div style={{ width: 1, height: 20, background: "var(--border)" }} />
              {([
                { key: "prices", label: "⚡ Prices", active: showPrices, toggle: () => setShowPrices((v) => !v) },
                { key: "carbon", label: "🌱 Carbon", active: showCarbon, toggle: () => setShowCarbon((v) => !v) },
              ] as { key: string; label: string; active: boolean; toggle: () => void }[]).map(({ key, label, active, toggle }) => (
                <button
                  key={key}
                  onClick={toggle}
                  style={{
                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                    border: active ? "1px solid var(--border)" : "1px solid transparent",
                    borderRadius: 6, padding: "6px 14px",
                    color: active ? "var(--text)" : "var(--text-dim)",
                    fontSize: 12, cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, fontSize: 12, marginBottom: 16 }}>
            {[["var(--discharge)", "Discharging"], ["var(--charge)", "Charging"]].map(([c, l]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 16, height: 3, background: c, borderRadius: 2, display: "inline-block" }} />
                <span style={{ color: "var(--text-dim)" }}>{l}</span>
              </span>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {/* Dynamic zero-line split: discharge (green) above zero, charge (blue) below */}
                <linearGradient id="gradDischarge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ffb3" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00ffb3" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradCharge" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={fmtTime}
                stroke="transparent"
                tick={{ fill: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                interval={Math.floor(data.length / 12)}
              />
              <YAxis
                domain={[-yBound, yBound]}
                tickFormatter={(v) => `${Math.round(v / 100) / 10}GW`}
                stroke="transparent"
                tick={{ fill: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                width={50}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="5 5" label={{ value: "0", fill: "rgba(255,255,255,0.2)", fontSize: 10 }} />
              {/* Positive area — discharging (green) */}
              <Area
                type="monotone"
                dataKey={selectedView}
                name={viewKeys.find((v) => v.key === selectedView)?.label}
                stroke="#00ffb3"
                strokeWidth={2}
                fill="url(#gradDischarge)"
                dot={false}
                activeDot={{ r: 5, fill: "#00ffb3", stroke: "rgba(0,0,0,0.6)", strokeWidth: 2 }}
                baseLine={0}
              />
              {/* Negative area — charging (blue): render data clamped to <=0 */}
              <Area
                type="monotone"
                dataKey={(d: StorageDataPoint) => Math.min(0, d[selectedView])}
                name="Charging"
                stroke="#60a5fa"
                strokeWidth={2}
                fill="url(#gradCharge)"
                dot={false}
                activeDot={false}
                legendType="none"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Prices overlay ───────────────────────────────────────────────── */}
        {showPrices && (
          <div className="animate-fade-up" style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: "24px",
            marginBottom: 20,
          }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Octopus Agile Prices — Today</div>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 18 }}>
              Half-hourly electricity unit rate · p/kWh inc. VAT · Region A (East England)
            </div>
            {priceData.length === 0 ? (
              <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "20px 0" }}>Loading prices…</div>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={priceData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="transparent"
                    tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    interval={5}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${v}p`}
                    stroke="transparent"
                    tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    width={38}
                  />
                  <Tooltip content={<PriceTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="5 5" />
                  <Bar dataKey="price" radius={[2, 2, 0, 0]}>
                    {priceData.map((entry, i) => (
                      <Cell key={i} fill={getPriceColor(entry.price)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ── Carbon intensity overlay ──────────────────────────────────────── */}
        {showCarbon && (
          <div className="animate-fade-up" style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: "24px",
            marginBottom: 20,
          }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Grid Carbon Intensity — Today</div>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 18 }}>
              gCO₂eq/kWh · National Grid ESO · Half-hourly actual &amp; forecast
            </div>
            {carbonData.length === 0 ? (
              <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "20px 0" }}>Loading carbon data…</div>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={carbonData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="transparent"
                    tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    interval={5}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${v}`}
                    stroke="transparent"
                    tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    width={38}
                  />
                  <Tooltip content={<CarbonTooltip />} />
                  <Bar dataKey="intensity" radius={[2, 2, 0, 0]}>
                    {carbonData.map((entry, i) => (
                      <Cell key={i} fill={getCarbonColor(entry.index)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ── Bottom row: hourly bars + info ────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

          {/* Hourly avg bar chart */}
          <div className="animate-fade-up" style={{
            animationDelay: "150ms",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: "24px",
          }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Hourly Average · BESS</div>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 18 }}>
              Avg MW per hour of day — typical daily charge/discharge rhythm
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke="transparent"
                  tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                  interval={2}
                />
                <YAxis
                  tickFormatter={(v) => `${(v / 1000).toFixed(1)}GW`}
                  stroke="transparent"
                  tick={{ fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                  width={44}
                />
                <Tooltip
                  formatter={(val: number) => [fmtMW(val), "Avg"]}
                  labelStyle={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}
                  contentStyle={{ background: "rgba(7,8,15,0.96)", border: "1px solid var(--border)", borderRadius: 8 }}
                  itemStyle={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                  {hourlyData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.avg >= 0 ? "var(--discharge)" : "var(--charge)"}
                      fillOpacity={0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Info panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Data sources */}
            <div className="animate-fade-up" style={{
              animationDelay: "200ms",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "20px",
              flex: 1,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Data Sources</div>
              {([
                ["API", "Elexon Insights Solution", "var(--accent)"],
                ["Primary", "PN — operator physical notifications", "var(--discharge)"],
                ["Fallback", "BOALF → FUELINST", "var(--text-mid)"],
                ["Source", meta.source.toUpperCase(), meta.source === "boalf" ? "var(--discharge)" : meta.source === "mock" ? "var(--warn)" : "var(--text-mid)"],
                ["Auth", "None required — public", "var(--discharge)"],
                ["Scope", "GB transmission-level BESS", "var(--text-mid)"],
                ["Refresh", "Every 5 minutes", "var(--text-mid)"],
              ] as [string, string, string][]).map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, fontSize: 12, alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{k}</span>
                  <span style={{ color: c, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* How to read */}
            <div className="animate-fade-up" style={{
              animationDelay: "250ms",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "20px",
              flex: 1,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Reading the Chart</div>
              {([
                ["▲ Green", "Discharging — selling power to grid"],
                ["▼ Blue", "Charging — absorbing grid power"],
                ["BOALF", "BM dispatch acceptances, per unit"],
                ["PS field", "Pumped hydro — negative when pumping"],
                ["5–9pm", "Evening peak — typical max discharge"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, fontSize: 12, gap: 8 }}>
                  <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{k}</span>
                  <span style={{ color: "var(--text-mid)", textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        </> /* end overview tab */}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
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
            {meta.source !== "mock" ? "🟢 Live data" : "🟡 Simulated data"} ·{" "}
            {data.length} points · Updated {lastUpdated}
          </span>
        </div>

      </main>
    </div>
  );
}
