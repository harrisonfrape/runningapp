"use client";

import { useState } from "react";
import type { AppState } from "@/lib/state";
import { RACE_DISTANCES } from "@/lib/types";
import { C, h1, h2 } from "../ui";

export default function RaceTab({
  state,
  onRefresh,
}: {
  state: AppState;
  onRefresh: () => Promise<void>;
}) {
  const r = state.race;
  return (
    <>
      <h1 style={{ ...h1, marginBottom: 28 }}>Race readiness</h1>
      <div className="grid-race2" style={{ marginBottom: 24 }}>
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
      <div className="grid-miles3">
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

      <TuneUps state={state} onRefresh={onRefresh} />
    </>
  );
}

/**
 * Races inside the block. Adding one rebuilds the plan around it: three easy
 * days going in, four coming out, and no quality session in between.
 */
function TuneUps({ state, onRefresh }: { state: AppState; onRefresh: () => Promise<void> }) {
  const races = state.race.tuneUps;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [distanceKm, setDistanceKm] = useState(RACE_DISTANCES[3].km);
  const [goalTime, setGoalTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/races", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, date, distanceKm, goalTime }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not add that race");
        return;
      }
      setOpen(false);
      setName("");
      setDate("");
      setGoalTime("");
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/races?id=${id}`, { method: "DELETE" });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  const field: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontFamily: "inherit",
    fontSize: 14,
    outline: "none",
    background: C.bg,
    color: C.text,
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          margin: "32px 0 14px",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ ...h2, margin: 0 }}>Races along the way</h2>
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn-soft"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "8px 14px",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            color: C.text,
          }}
        >
          {open ? "Cancel" : "Add a race"}
        </button>
      </div>

      <p style={{ color: C.text2, fontSize: 14, margin: "0 0 16px", maxWidth: 640 }}>
        A race inside the block earns its place twice over: it is the sharpest read on your
        marathon fitness you can get, and the result becomes the anchor your finish projection is
        built from. The plan eases off for three days beforehand and keeps the four days after it
        easy.
      </p>

      {open && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            maxWidth: 640,
          }}
        >
          <div className="grid-metric2" style={{ marginBottom: 12 }}>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12.5, color: C.muted, display: "block", marginBottom: 6 }}>
                Race name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Christmas Half"
                style={field}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12.5, color: C.muted, display: "block", marginBottom: 6 }}>
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={field}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12.5, color: C.muted, display: "block", marginBottom: 6 }}>
                Distance
              </span>
              <select
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                style={field}
              >
                {RACE_DISTANCES.map((d) => (
                  <option key={d.label} value={d.km}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12.5, color: C.muted, display: "block", marginBottom: 6 }}>
                Target time (optional)
              </span>
              <input
                value={goalTime}
                onChange={(e) => setGoalTime(e.target.value)}
                placeholder="1:40:00"
                style={field}
              />
            </label>
          </div>
          {error && (
            <div style={{ color: C.warn, fontSize: 13, marginBottom: 10 }}>{error}</div>
          )}
          <button
            onClick={() => void save()}
            disabled={busy || !name.trim() || !date}
            className="btn-primary"
            style={{
              background: C.accent,
              color: "#F7F5F0",
              border: "none",
              borderRadius: 9,
              padding: "11px 20px",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              opacity: busy || !name.trim() || !date ? 0.5 : 1,
            }}
          >
            {busy ? "Rebuilding the plan…" : "Add race and rebuild plan"}
          </button>
        </div>
      )}

      {races.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 14 }}>
          No races booked in yet. A half marathon somewhere in the middle of the block is the most
          useful one you can run.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 780 }}>
          {races.map((race) => (
            <div
              key={race.id}
              className="grid-runs"
              style={{
                background: C.card,
                border: `1px solid ${race.past ? C.border : C.mint}`,
                borderRadius: 12,
                padding: "14px 18px",
                fontSize: 13.5,
                opacity: race.past ? 0.6 : 1,
              }}
            >
              <div style={{ color: C.muted }}>{race.dateLabel}</div>
              <div style={{ fontWeight: 600 }}>{race.name}</div>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>{race.distanceLabel}</div>
              <div style={{ fontVariantNumeric: "tabular-nums", color: C.text2 }}>
                {race.target}
              </div>
              <div style={{ textAlign: "right" }}>
                <button
                  onClick={() => void remove(race.id)}
                  disabled={busy}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: C.muted,
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
