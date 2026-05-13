"use client";

import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────

interface BessUnit {
  id: string;
  elexonId: string;
  name: string;
  rawName: string;
  operator: string;
  region: string;
  bmUnitType: string;
  capacityMW: number;
  energyMWh: number | null;
  fpnFlag: boolean;
}

interface RegionSummary { region: string; count: number; capacityMW: number; }
interface OperatorSummary { name: string; count: number; capacityMW: number; }

interface UnitsResponse {
  units: BessUnit[];
  byRegion: RegionSummary[];
  topOperators: OperatorSummary[];
  meta: { total: number; totalCapacityMW: number; lastUpdated: string };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACCENT = "#00ffb3";
const TEXT_DIM = "rgba(255,255,255,0.38)";
const TEXT_MID = "rgba(255,255,255,0.65)";
const BORDER = "rgba(255,255,255,0.08)";

const REGION_COLORS: Record<string, string> = {
  "South East":       "#00ffb3",
  "South Western":    "#00e5a0",
  "Eastern":          "#3b82f6",
  "East Midlands":    "#60a5fa",
  "West Midlands":    "#818cf8",
  "North Western":    "#a78bfa",
  "Yorkshire":        "#f472b6",
  "Northern":         "#fb923c",
  "North Scotland":   "#fbbf24",
  "South Scotland":   "#34d399",
  "South Wales":      "#2dd4bf",
  "Merseyside":       "#e879f9",
  "London":           "#f87171",
  "Eastern GSP Group":"#38bdf8",
};

function getRegionColor(region: string) {
  return REGION_COLORS[region] ?? "#6b7280";
}

function fmtMW(mw: number) {
  if (mw >= 1000) return `${(mw / 1000).toFixed(2)} GW`;
  return `${mw.toFixed(mw < 10 ? 1 : 0)} MW`;
}

// Capacity bar — visual proportion of unit size
function CapBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: ACCENT, borderRadius: 2, opacity: 0.8 }} />
      </div>
      <span style={{ color: ACCENT, fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 68, textAlign: "right" }}>
        {fmtMW(value)}
      </span>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function UnitsTab() {
  const [data, setData] = useState<UnitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"capacityMW" | "name" | "operator" | "region">("capacityMW");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [activeView, setActiveView] = useState<"fleet" | "regions" | "operators">("fleet");

  useEffect(() => {
    fetch("/api/units")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  const maxCap = useMemo(() => data ? Math.max(...data.units.map((u) => u.capacityMW)) : 1, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let units = data.units;
    if (regionFilter !== "all") units = units.filter((u) => u.region === regionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      units = units.filter((u) =>
        u.name.toLowerCase().includes(q) ||
        u.operator.toLowerCase().includes(q) ||
        u.region.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    }
    return [...units].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, search, sortKey, sortDir, regionFilter]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortHeader({ k, label }: { k: typeof sortKey; label: string }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        style={{
          padding: "10px 14px", textAlign: "left", fontSize: 11, letterSpacing: "0.08em",
          textTransform: "uppercase", color: active ? ACCENT : TEXT_DIM,
          cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: TEXT_DIM, fontFamily: "var(--font-mono)" }}>
      Loading fleet data…
    </div>
  );

  if (error || !data) return (
    <div style={{ color: "#f87171", padding: 24 }}>Failed to load unit data: {error}</div>
  );

  const regions = ["all", ...data.byRegion.map((r) => r.region)];

  return (
    <div style={{ animation: "fade-up 0.4s ease both" }}>

      {/* ── Summary hero ─────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 14, marginBottom: 20,
      }}>
        {[
          ["Registered Units", data.meta.total, TEXT_MID],
          ["Total Capacity", fmtMW(data.meta.totalCapacityMW), ACCENT],
          ["Regions", data.byRegion.length, TEXT_MID],
          ["Operators", data.topOperators.length + "+", TEXT_MID],
        ].map(([label, value, color]) => (
          <div key={String(label)} style={{
            background: "var(--bg-card)", border: `1px solid ${BORDER}`,
            borderRadius: "var(--radius)", padding: "16px 20px",
          }}>
            <div style={{ color: TEXT_DIM, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
            <div style={{ color: String(color), fontSize: 24, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── View tabs ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 4, width: "fit-content" }}>
        {(["fleet", "regions", "operators"] as const).map((v) => (
          <button key={v} onClick={() => setActiveView(v)} style={{
            background: activeView === v ? "rgba(255,255,255,0.08)" : "transparent",
            border: activeView === v ? `1px solid ${BORDER}` : "1px solid transparent",
            borderRadius: 6, padding: "7px 18px",
            color: activeView === v ? "white" : TEXT_DIM,
            fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)",
            textTransform: "capitalize", transition: "all 0.15s",
          }}>
            {v === "fleet" ? "Fleet Directory" : v === "regions" ? "By Region" : "By Operator"}
          </button>
        ))}
      </div>

      {/* ── FLEET DIRECTORY ──────────────────────────────────────────── */}
      {activeView === "fleet" && (
        <div style={{ background: "var(--bg-card)", border: `1px solid ${BORDER}`, borderRadius: "var(--radius-lg)" }}>
          {/* Search + filter bar */}
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search units, operators, regions…"
              style={{
                flex: 1, minWidth: 220,
                background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "8px 14px",
                color: "white", fontSize: 13, fontFamily: "var(--font-sans)",
                outline: "none",
              }}
              onFocus={(e) => { e.target.style.borderColor = ACCENT; }}
              onBlur={(e) => { e.target.style.borderColor = BORDER; }}
            />
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "8px 14px",
                color: TEXT_MID, fontSize: 12, fontFamily: "var(--font-sans)",
                cursor: "pointer", outline: "none",
              }}
            >
              {regions.map((r) => (
                <option key={r} value={r} style={{ background: "#0a0c14" }}>
                  {r === "all" ? "All regions" : r}
                </option>
              ))}
            </select>
            <span style={{ color: TEXT_DIM, fontSize: 12, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
              {filtered.length} units
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.2)" }}>
                  <SortHeader k="name" label="Unit" />
                  <SortHeader k="operator" label="Operator" />
                  <SortHeader k="region" label="Region" />
                  <SortHeader k="capacityMW" label="Capacity" />
                  <th style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }} />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((unit, i) => (
                  <tr
                    key={unit.id}
                    style={{
                      borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,255,179,0.03)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"; }}
                  >
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: "white" }}>{unit.name}</div>
                      <div style={{ color: TEXT_DIM, fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>{unit.id}</div>
                    </td>
                    <td style={{ padding: "11px 14px", color: TEXT_MID, fontSize: 12, maxWidth: 200 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit.operator}</div>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{
                        background: `${getRegionColor(unit.region)}18`,
                        border: `1px solid ${getRegionColor(unit.region)}33`,
                        borderRadius: 4, padding: "2px 8px",
                        fontSize: 11, color: getRegionColor(unit.region),
                        whiteSpace: "nowrap",
                      }}>
                        {unit.region}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", minWidth: 180 }}>
                      <CapBar value={unit.capacityMW} max={maxCap} />
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      {unit.energyMWh && (
                        <span style={{ color: TEXT_DIM, fontSize: 11, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                          {unit.energyMWh} MWh
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <div style={{ padding: "12px 20px", color: TEXT_DIM, fontSize: 12, textAlign: "center" }}>
                Showing 200 of {filtered.length} units
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BY REGION ────────────────────────────────────────────────── */}
      {activeView === "regions" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--bg-card)", border: `1px solid ${BORDER}`, borderRadius: "var(--radius-lg)", padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Capacity by Region</div>
            <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 20 }}>Total registered MW per GSP group</div>
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={data.byRegion} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={BORDER} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v}MW`} stroke="transparent"
                  tick={{ fill: TEXT_DIM, fontSize: 10, fontFamily: "var(--font-mono)" }} />
                <YAxis type="category" dataKey="region" width={110}
                  tick={{ fill: TEXT_MID, fontSize: 11 }} stroke="transparent" />
                <Tooltip
                  formatter={(v: number) => [fmtMW(v), "Capacity"]}
                  contentStyle={{ background: "#0a0c14", border: `1px solid ${BORDER}`, borderRadius: 8 }}
                  labelStyle={{ color: TEXT_MID }}
                  itemStyle={{ color: ACCENT, fontFamily: "var(--font-mono)" }}
                />
                <Bar dataKey="capacityMW" radius={[0, 4, 4, 0]}>
                  {data.byRegion.map((r) => (
                    <Cell key={r.region} fill={getRegionColor(r.region)} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: "var(--bg-card)", border: `1px solid ${BORDER}`, borderRadius: "var(--radius-lg)", padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Unit Count by Region</div>
            <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 20 }}>Number of registered storage BMUs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.byRegion.map((r) => (
                <div key={r.region} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: getRegionColor(r.region), flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13, color: TEXT_MID, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.region}
                  </div>
                  <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                    <span style={{ color: TEXT_DIM, fontSize: 12, fontFamily: "var(--font-mono)", minWidth: 30, textAlign: "right" }}>
                      {r.count}
                    </span>
                    <span style={{ color: getRegionColor(r.region), fontSize: 12, fontFamily: "var(--font-mono)", minWidth: 70, textAlign: "right" }}>
                      {fmtMW(r.capacityMW)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BY OPERATOR ──────────────────────────────────────────────── */}
      {activeView === "operators" && (
        <div style={{ background: "var(--bg-card)", border: `1px solid ${BORDER}`, borderRadius: "var(--radius-lg)", padding: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Top Operators by Capacity</div>
          <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 24 }}>Lead party registered capacity in MW</div>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={data.topOperators} layout="vertical" margin={{ top: 0, right: 80, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${v}MW`} stroke="transparent"
                tick={{ fill: TEXT_DIM, fontSize: 10, fontFamily: "var(--font-mono)" }} />
              <YAxis type="category" dataKey="name" width={160}
                tick={{ fill: TEXT_MID, fontSize: 11 }} stroke="transparent" />
              <Tooltip
                formatter={(v: number, _: string, item: any) => [
                  item.payload ? `${fmtMW(v)} · ${item.payload.count} unit${item.payload.count !== 1 ? "s" : ""}` : fmtMW(v),
                  "Capacity",
                ]}
                contentStyle={{ background: "#0a0c14", border: `1px solid ${BORDER}`, borderRadius: 8 }}
                labelStyle={{ color: TEXT_MID }}
                itemStyle={{ color: ACCENT, fontFamily: "var(--font-mono)" }}
              />
              <Bar dataKey="capacityMW" fill={ACCENT} fillOpacity={0.7} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Data note ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 8, fontSize: 12, color: "rgba(251,191,36,0.8)", lineHeight: 1.6 }}>
        <strong>Data note:</strong> Unit registry from Elexon BM Reference API. Capacities shown are registered <code>generationCapacity</code> values — verified figures for major sites.
        For per-site live output, see the <strong>Live Sites</strong> tab.
      </div>
    </div>
  );
}
