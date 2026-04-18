"use client";

import { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { getCoordinates } from "@/lib/bess-sites";

// Natural Earth 50m world TopoJSON — standard react-simple-maps data source
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

// ISO numeric codes for GB (826) and Ireland (372) — for context
const UK_IRELAND = new Set(["826", "372"]);

interface BessUnit {
  id: string;
  name: string;
  operator: string;
  region: string;
  capacityMW: number;
  energyMWh: number | null;
}

interface TooltipState {
  unit: BessUnit;
  x: number;
  y: number;
}

function capacityToRadius(mw: number): number {
  // Scale: 50 MW → r=5, 350 MW → r=13
  return Math.max(4, Math.min(16, Math.sqrt(mw) * 0.72));
}

const OPERATOR_COLORS = [
  "#00ffb3", "#60a5fa", "#f59e0b", "#f472b6",
  "#a78bfa", "#34d399", "#fb7185", "#38bdf8",
];

export default function UKMap() {
  const [units, setUnits] = useState<BessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [colorBy, setColorBy] = useState<"capacity" | "operator">("capacity");
  const [operatorColors, setOperatorColors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/units")
      .then((r) => r.json())
      .then((d) => {
        const unitList: BessUnit[] = d.units ?? [];
        setUnits(unitList);
        // Assign a stable color per operator
        const ops = [...new Set(unitList.map((u) => u.operator))];
        const colors: Record<string, string> = {};
        ops.forEach((op, i) => { colors[op] = OPERATOR_COLORS[i % OPERATOR_COLORS.length]; });
        setOperatorColors(colors);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Deduplicate by site prefix so overlapping BMUs don't stack
  const siteMap = new Map<string, BessUnit & { totalMW: number; unitCount: number }>();
  for (const u of units) {
    const key = u.id.replace(/-\d+$/, "");
    const existing = siteMap.get(key);
    if (existing) {
      existing.totalMW += u.capacityMW;
      existing.unitCount++;
    } else {
      siteMap.set(key, { ...u, totalMW: u.capacityMW, unitCount: 1 });
    }
  }
  const sites = [...siteMap.values()];

  const totalCapacity = units.reduce((s, u) => s + u.capacityMW, 0);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 500, color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
      Loading map data…
    </div>
  );

  if (error) return (
    <div style={{ color: "var(--warn)", padding: 32, fontFamily: "var(--font-mono)", fontSize: 13 }}>
      {error}
    </div>
  );

  return (
    <div className="animate-fade-up" style={{ position: "relative" }}>

      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>GB Grid-Scale BESS — Site Map</div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 3 }}>
            {sites.length} sites · {units.length} BMUs · {Math.round(totalCapacity / 1000).toFixed(1)} GW installed
            <span style={{ marginLeft: 8, color: "var(--text-dim)", fontSize: 11 }}>
              · Bubble area ∝ capacity · Exact coords for known sites, regional centroid otherwise
            </span>
          </div>
        </div>

        {/* Colour mode toggle */}
        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 4 }}>
          {(["capacity", "operator"] as const).map((mode) => (
            <button key={mode} onClick={() => setColorBy(mode)} style={{
              background: colorBy === mode ? "rgba(255,255,255,0.08)" : "transparent",
              border: colorBy === mode ? "1px solid var(--border)" : "1px solid transparent",
              borderRadius: 6, padding: "6px 14px",
              color: colorBy === mode ? "var(--text)" : "var(--text-dim)",
              fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)",
              transition: "all 0.15s", textTransform: "capitalize",
            }}>
              By {mode}
            </button>
          ))}
        </div>
      </div>

      {/* ── Map + legend ────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 20, alignItems: "start" }}>

        {/* Map */}
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", overflow: "hidden", position: "relative",
        }}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 2800, center: [-2.5, 54.5] }}
            style={{ width: "100%", height: "auto" }}
            height={580}
          >
            <ZoomableGroup zoom={1} minZoom={0.8} maxZoom={6}>
              <Geographies geography={GEO_URL}>
                {({ geographies }: { geographies: any[] }) =>
                  geographies
                    .filter((g: any) => UK_IRELAND.has(g.id))
                    .map((geo: any) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="#111827"
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth={0.5}
                        style={{ outline: "none" }}
                      />
                    ))
                }
              </Geographies>

              {sites.map((site) => {
                const coords = getCoordinates(site.id, site.region);
                const r = capacityToRadius(site.totalMW);
                const color = colorBy === "operator"
                  ? (operatorColors[site.operator] ?? "var(--accent)")
                  : "#00ffb3";
                return (
                  <Marker
                    key={site.id}
                    coordinates={coords}
                    onMouseEnter={(e: React.MouseEvent<SVGElement>) => {
                      const svgRect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                      if (!svgRect) return;
                      setTooltip({ unit: site, x: e.clientX - svgRect.left, y: e.clientY - svgRect.top });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <circle
                      r={r}
                      fill={color}
                      fillOpacity={0.75}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeOpacity={0.9}
                      style={{ cursor: "pointer", transition: "r 0.2s, fill-opacity 0.2s" }}
                    />
                    {/* Pulse ring for large sites */}
                    {site.totalMW >= 100 && (
                      <circle r={r + 3} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.3}
                        style={{ animation: "pulse-ring 2s ease-out infinite" }} />
                    )}
                  </Marker>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>

          {/* SVG tooltip overlay */}
          {tooltip && (
            <div style={{
              position: "absolute",
              left: tooltip.x + 12,
              top: tooltip.y - 8,
              background: "rgba(7,8,15,0.97)",
              border: "1px solid var(--border)",
              borderRadius: 8, padding: "10px 14px",
              fontFamily: "var(--font-mono)", fontSize: 12,
              pointerEvents: "none",
              zIndex: 10,
              minWidth: 180,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}>
              <div style={{ color: "var(--accent)", fontWeight: 700, marginBottom: 6 }}>{tooltip.unit.name}</div>
              <div style={{ color: "var(--text-dim)", marginBottom: 3 }}>{tooltip.unit.operator}</div>
              <div style={{ color: "var(--text-mid)", marginBottom: 3 }}>{tooltip.unit.region}</div>
              <div style={{ color: "var(--text)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                {(tooltip.unit as typeof sites[0]).totalMW >= 0
                  ? `${Math.round((tooltip.unit as typeof sites[0]).totalMW)} MW`
                  : `${Math.round(tooltip.unit.capacityMW)} MW`}
                {tooltip.unit.energyMWh && (
                  <span style={{ color: "var(--text-dim)", marginLeft: 8 }}>
                    / {tooltip.unit.energyMWh} MWh
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ padding: "8px 16px 12px", color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)", borderTop: "1px solid var(--border)" }}>
            Scroll to zoom · Drag to pan
          </div>
        </div>

        {/* Legend / stats sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Capacity scale */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Bubble Size</div>
            {[50, 100, 200, 350].map((mw) => (
              <div key={mw} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <svg width={32} height={32}>
                  <circle cx={16} cy={16} r={capacityToRadius(mw)} fill="#00ffb3" fillOpacity={0.7} />
                </svg>
                <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{mw} MW</span>
              </div>
            ))}
          </div>

          {/* Operator colours (when in operator mode) */}
          {colorBy === "operator" && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px" }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Operators</div>
              {Object.entries(operatorColors).slice(0, 10).map(([op, color]) => (
                <div key={op} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ color: "var(--text-dim)", fontSize: 11, lineHeight: 1.3 }}>{op}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top sites by capacity */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Top Sites</div>
            {sites
              .sort((a, b) => b.totalMW - a.totalMW)
              .slice(0, 8)
              .map((site) => (
                <div key={site.id} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: "var(--text-mid)" }}>{site.name}</span>
                    <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                      {Math.round(site.totalMW)} MW
                    </span>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      background: colorBy === "operator" ? (operatorColors[site.operator] ?? "var(--accent)") : "var(--accent)",
                      width: `${(site.totalMW / (sites[0]?.totalMW || 1)) * 100}%`,
                      opacity: 0.8,
                    }} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
