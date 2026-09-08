"use client";

import type { AppState } from "@/lib/state";
import { C, h1 } from "../ui";

export default function ProgressTab({ state }: { state: AppState }) {
  const bars = state.progress.volumeBars;
  const max = Math.max(8, ...bars.map((b) => b.km)) * 1.12;

  return (
    <>
      <h1 style={{ ...h1, marginBottom: 28 }}>Progress</h1>

      <div className="grid-stat4" style={{ marginBottom: 32 }}>
        {state.progress.stats.map((c) => (
          <div
            key={c.label}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{c.label}</div>
            <div
              style={{
                fontFamily: "Spectral, serif",
                fontSize: 30,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {c.value}
            </div>
            <div
              style={{ fontSize: 12.5, color: c.trendColor, fontWeight: 600, marginTop: 6 }}
            >
              {c.trend}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 26,
          marginBottom: 24,
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
          <div style={{ fontWeight: 700, fontSize: 15 }}>Weekly volume</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>last 8 weeks + this week, km</div>
        </div>
        <div className="bar-chart" style={{ height: 160 }}>
          {bars.map((b) => (
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
                {b.km}
              </div>
              <div
                style={{
                  width: "100%",
                  borderRadius: "6px 6px 3px 3px",
                  background: b.current ? C.mint : "#B9C7BE",
                  height: Math.round((b.km / max) * 118) + 8,
                }}
              />
              <div style={{ fontSize: 11.5, color: C.muted }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Recent runs</div>
        {state.progress.recentRuns.length === 0 && (
          <div style={{ fontSize: 13.5, color: C.muted }}>
            Nothing synced yet — post a run to Strava and it lands here.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {state.progress.recentRuns.map((r) => (
            <div
              key={r.id}
              className="grid-runs"
              style={{
                padding: "13px 0",
                borderBottom: `1px solid ${C.raised}`,
                fontSize: 13.5,
              }}
            >
              <div style={{ color: C.muted }}>{r.date}</div>
              <div style={{ fontWeight: 600 }}>
                {r.name}
                {r.fromStrava && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: C.strava,
                      background: C.stravaBadge,
                      borderRadius: 20,
                      padding: "2px 7px",
                      marginLeft: 6,
                    }}
                  >
                    STRAVA
                  </span>
                )}
              </div>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>{r.km} km</div>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>{r.pace}</div>
              <div style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{r.hr}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
