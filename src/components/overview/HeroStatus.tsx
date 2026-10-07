"use client";

import { fmtMW, getStatus } from "@/lib/elexon";
import { heroIcon, heroCaption } from "./helpers";

// Vertical in/out meter: bar grows up from the midline when discharging, down when charging.
function ChargeMeter({ mw, yBound }: { mw: number; yBound: number }) {
  const height = `${Math.min(48, (Math.abs(mw) / yBound) * 50)}%`;
  const bar = mw > 0
    ? { bottom: "50%", background: "linear-gradient(to top, var(--discharge), rgba(0,255,179,0.3))", borderRadius: "3px 3px 0 0" }
    : { top: "50%", background: "linear-gradient(to bottom, var(--charge), rgba(96,165,250,0.3))", borderRadius: "0 0 3px 3px" };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, userSelect: "none" }}>
      <span style={{ color: "var(--discharge)", fontSize: 10, letterSpacing: "0.1em" }}>OUT</span>
      <div style={{ width: 10, height: 120, background: "rgba(255,255,255,0.05)", borderRadius: 5, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height, transition: "height 1s ease", ...bar }} />
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.2)" }} />
      </div>
      <span style={{ color: "var(--charge)", fontSize: 10, letterSpacing: "0.1em" }}>IN</span>
    </div>
  );
}

export default function HeroStatus({ mw, viewLabel, yBound }: { mw: number; viewLabel: string; yBound: number }) {
  const status = getStatus(mw);
  const tint = mw < 0 ? "96,165,250" : "0,255,179";
  return (
    <div className="animate-fade-up" style={{
      background: `linear-gradient(135deg, var(--bg-card), rgba(${tint},0.04))`,
      border: `1px solid rgba(${tint},0.2)`,
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

      <div style={{ fontSize: 52 }}>{heroIcon(mw)}</div>

      <div style={{ flex: 1 }}>
        <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
          Current Net Output · {viewLabel}
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, fontFamily: "var(--font-mono)", color: status.color }}>
          {fmtMW(mw)}
        </div>
        <div style={{ marginTop: 10, color: "var(--text-mid)", fontSize: 13 }}>
          {heroCaption(mw, fmtMW)}
        </div>
      </div>

      <ChargeMeter mw={mw} yBound={yBound} />
    </div>
  );
}
