"use client";

// Shared building blocks for the Live Overview panels.

import type { CSSProperties, ReactNode } from "react";

export const AXIS_TICK = { fill: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" };
export const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 0 };
export const ZERO_LINE = { stroke: "rgba(255,255,255,0.25)", strokeDasharray: "5 5" };

export function PulseDot({ color }: { color: string }) {
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

export function StatCard({
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

export function Badge({ children, color = "var(--warn)" }: { children: ReactNode; color?: string }) {
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

// Card wrapper used by every overlay panel: title, subtitle, optional right-hand slot.
export function Panel({ title, subtitle, aside, children, style, subtitleGap = 18 }: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  subtitleGap?: number; // space under the subtitle (smaller when a legend follows)
}) {
  return (
    <div className="animate-fade-up" style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "24px",
      marginBottom: 20,
      ...style,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{title}</div>
          {subtitle && <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: subtitleGap }}>{subtitle}</div>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function LoadingNote({ children }: { children: ReactNode }) {
  return <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "20px 0" }}>{children}</div>;
}

export function FootNote({ children }: { children: ReactNode }) {
  return <div style={{ color: "var(--text-dim)", fontSize: 10, marginTop: 8 }}>{children}</div>;
}

// Row of coloured swatches + labels.
export function Legend({ items, style }: {
  items: Array<{ color: string; label: string; kind?: "line" | "dash" | "bar" }>;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", gap: 20, fontSize: 12, margin: "6px 0 16px", flexWrap: "wrap", ...style }}>
      {items.map(({ color, label, kind = "line" }) => (
        <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: kind === "bar" ? 8 : 16, height: kind === "bar" ? 8 : 3, borderRadius: 2, display: "inline-block",
            background: kind === "dash" ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color,
            opacity: kind === "bar" ? 0.6 : 1,
          }} />
          <span style={{ color: "var(--text-dim)" }}>{label}</span>
        </span>
      ))}
    </div>
  );
}

// Dark tooltip container shared by every chart.
export function TooltipBox({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div style={{
      background: "rgba(7,8,15,0.96)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 16px",
      fontFamily: "var(--font-mono)", fontSize: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {label !== undefined && <div style={{ color: "var(--text-dim)", marginBottom: 8 }}>{label}</div>}
      {children}
    </div>
  );
}

// One "● name ……… value" row inside a TooltipBox.
export function TooltipRow({ color, name, value, valueColor }: {
  color: string; name: ReactNode; value: ReactNode; valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ color: "var(--text-mid)" }}>{name}</span>
      <span style={{ color: valueColor ?? color, fontWeight: 700, marginLeft: "auto" }}>{value}</span>
    </div>
  );
}

// Pill-style toggle button used for tabs, views and overlays.
export function ToggleButton({ active, onClick, children, size = "md" }: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const pad = { sm: "4px 10px", md: "6px 14px", lg: "8px 20px" }[size];
  const fontSize = { sm: 11, md: 12, lg: 13 }[size];
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        border: active ? "1px solid var(--border)" : "1px solid transparent",
        borderRadius: size === "lg" ? 7 : 6, padding: pad,
        color: active ? "var(--text)" : "var(--text-dim)",
        fontSize, cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontWeight: active && size === "lg" ? 600 : 400,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// Two-column "key ……… value" list used by the info panels.
export function KeyValueList({ rows }: { rows: Array<[string, string, string?]> }) {
  return (
    <>
      {rows.map(([k, v, color]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, fontSize: 12, alignItems: "flex-start", gap: 8 }}>
          <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{k}</span>
          <span style={{ color: color ?? "var(--text-mid)", textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </>
  );
}
