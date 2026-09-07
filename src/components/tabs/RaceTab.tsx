"use client";

import type { AppState } from "@/lib/state";
import { C, h1, h2 } from "../ui";

export default function RaceTab({ state }: { state: AppState }) {
  const r = state.race;
  return (
    <>
      <h1 style={{ ...h1, marginBottom: 28 }}>Race readiness</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ background: C.panel, color: C.text, borderRadius: 16, padding: 32 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: C.panelLabel,
              marginBottom: 14,
            }}
          >
            PROJECTED FINISH · {state.profile.raceName.toUpperCase()},{" "}
            {state.profile.raceDateLabel.toUpperCase()}
          </div>
          <div
            style={{
              fontFamily: "Spectral, serif",
              fontSize: 58,
              fontWeight: 500,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {r.projectedFinish}
          </div>
          <div style={{ marginTop: 14, fontSize: 14, color: C.panelLabel }}>
            Goal {state.profile.goalTime} · based on your best recent effort and current training
            load. Confidence grows as the block progresses.
          </div>
          <div
            style={{
              marginTop: 24,
              height: 8,
              borderRadius: 4,
              background: "#35473E",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${r.readinessPct}%`,
                background: C.mint,
                borderRadius: 4,
              }}
            />
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: C.panelLabel }}>
            Readiness {r.readinessPct}% · {r.daysToRace} days to go
          </div>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 32,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18 }}>
            What the projection is built on
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {r.factors.map((f) => (
              <div
                key={f.label}
                style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14 }}
              >
                <span style={{ color: C.text2 }}>{f.label}</span>
                <span
                  style={{
                    fontWeight: 600,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {f.value}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 22,
              padding: 16,
              background: C.bg,
              borderRadius: 10,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: C.text2,
            }}
          >
            {r.note}
          </div>
        </div>
      </div>

      <h2 style={h2}>Milestones on the way</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {r.milestones.map((m) => (
          <div
            key={m.title}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>{m.when}</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{m.title}</div>
            <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.5 }}>{m.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}
