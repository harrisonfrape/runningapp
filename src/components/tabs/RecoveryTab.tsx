"use client";

import { useState } from "react";
import type { AppState } from "@/lib/state";
import { C, h1, scoreColor } from "../ui";

export default function RecoveryTab({
  state,
  onRefresh,
}: {
  state: AppState;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const r = state.recovery;
  const maxHours = Math.max(8.5, ...r.sleepBars.map((b) => Number(b.hours) || 0));

  async function refreshGarmin() {
    setBusy(true);
    await fetch("/api/garmin/sync", { method: "POST" });
    await onRefresh();
    setBusy(false);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <h1 style={{ ...h1, marginBottom: 8 }}>Recovery</h1>
        {state.connections.garmin.connected && (
          <button
            onClick={refreshGarmin}
            disabled={busy}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: C.mint,
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {busy ? "Refreshing…" : "Refresh from Garmin"}
          </button>
        )}
      </div>
      <p style={{ color: C.text2, fontSize: 14.5, margin: "0 0 28px", maxWidth: 640 }}>
        Pulled from Garmin overnight — sleep, HRV and body battery. When recovery looks poor, the next
        day&apos;s session is automatically softened to keep injury risk down.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: 20,
          marginBottom: 24,
          alignItems: "start",
        }}
      >
        <div style={{ background: C.panel, color: C.text, borderRadius: 16, padding: 30 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: C.panelLabel,
              marginBottom: 12,
            }}
          >
            TODAY&apos;S RECOVERY SCORE
          </div>
          <div
            style={{
              fontFamily: "Spectral, serif",
              fontSize: 64,
              fontWeight: 500,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: scoreColor(r.score),
            }}
          >
            {r.score ?? "—"}
          </div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: r.statusColor }}>
            {r.status}
          </div>
          <div style={{ marginTop: 16, fontSize: 13.5, lineHeight: 1.55, color: "#C6D3CB" }}>
            {r.summary}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {r.metrics.map((m) => (
            <div
              key={m.label}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{m.label}</div>
              <div
                style={{
                  fontFamily: "Spectral, serif",
                  fontSize: 28,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {m.value}
              </div>
              <div
                style={{ fontSize: 12.5, color: m.noteColor, fontWeight: 600, marginTop: 6 }}
              >
                {m.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 26,
          marginBottom: 24,
          maxWidth: 980,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 22,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15 }}>Sleep, last 7 nights</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>hours · colour = Garmin sleep score</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 140 }}>
          {r.sleepBars.map((b) => {
            const hours = Number(b.hours);
            const height = Number.isFinite(hours) ? Math.round((hours / maxHours) * 100) + 8 : 6;
            const color =
              b.score === null
                ? "#2E3B33"
                : b.score >= 80
                  ? C.mint
                  : b.score >= 70
                    ? "#B9C7BE"
                    : C.warn;
            return (
              <div
                key={b.label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  height: "100%",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.text2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {b.hours}
                </div>
                <div
                  style={{
                    width: "100%",
                    borderRadius: "6px 6px 3px 3px",
                    background: color,
                    height,
                  }}
                />
                <div style={{ fontSize: 11.5, color: C.muted }}>{b.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {r.adjusted ? (
        <div
          style={{
            background: C.warnCard,
            border: `1px solid ${C.warnBorder}`,
            borderRadius: 14,
            padding: "22px 26px",
            maxWidth: 980,
            display: "flex",
            gap: 18,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{ width: 10, height: 48, borderRadius: 5, background: C.warn, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.warn, marginBottom: 6 }}>
              Tomorrow&apos;s session softened
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text2 }}>{r.adjusted.text}</div>
          </div>
        </div>
      ) : r.hasData ? (
        <div
          style={{
            background: C.successBg,
            border: `1px solid ${C.successBorder}`,
            borderRadius: 14,
            padding: "22px 26px",
            maxWidth: 980,
            fontSize: 14,
            lineHeight: 1.6,
            color: C.mint,
          }}
        >
          <span style={{ fontWeight: 700 }}>No changes needed.</span> Recovery is where it should be —
          tomorrow&apos;s session stands as planned. Keep the easy days easy and this stays green.
        </div>
      ) : (
        <div
          style={{
            background: C.warnCard,
            border: `1px solid ${C.warnBorder}`,
            borderRadius: 14,
            padding: "22px 26px",
            maxWidth: 980,
            fontSize: 14,
            lineHeight: 1.6,
            color: C.warn,
          }}
        >
          <span style={{ fontWeight: 700 }}>No Garmin data yet.</span> Connect Garmin and wear the
          watch overnight — sleep, HRV and body battery are what drive the automatic session
          softening.
        </div>
      )}
    </>
  );
}
