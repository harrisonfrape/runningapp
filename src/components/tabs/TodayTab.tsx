"use client";

import { useEffect, useState } from "react";
import type { AppState } from "@/lib/state";
import { C, h1 } from "../ui";

interface Workout {
  date: string;
  dateLabel: string;
  title: string;
  adapted: boolean;
  adaptReason: string | null;
  km: string;
  duration: string;
  zone: string;
  hr: string;
  pace: string;
  coachNote: string;
  segments: Array<{ name: string; detail: string; target: string; zone: string; color: string }>;
}

export default function TodayTab({
  state,
  date,
  onAskCoach,
}: {
  state: AppState;
  date: string | null;
  onAskCoach: () => void;
}) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setWorkout(null);
    setError(null);
    fetch(`/api/workout${date ? `?date=${date}` : ""}`)
      .then(async (res) => {
        const body = await res.json();
        if (!live) return;
        if (!res.ok) setError(body.error ?? "Could not load that session");
        else setWorkout(body as Workout);
      })
      .catch(() => live && setError("Could not load that session"));
    return () => {
      live = false;
    };
  }, [date, state.today]);

  if (error) {
    return (
      <>
        <h1 style={h1}>Today&apos;s workout</h1>
        <p style={{ color: C.text2, marginTop: 16 }}>{error}</p>
      </>
    );
  }
  if (!workout) {
    return <div className="pulse" style={{ color: C.muted, fontSize: 14 }}>Loading session…</div>;
  }

  return (
    <>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.muted,
          letterSpacing: "0.06em",
          marginBottom: 8,
        }}
      >
        {workout.dateLabel}
      </div>
      <h1 style={{ ...h1, marginBottom: 8 }}>{workout.title}</h1>
      {workout.adapted && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: C.warnBg,
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 12.5,
            fontWeight: 700,
            color: C.warn,
            marginBottom: 16,
          }}
        >
          ADAPTED · {workout.adaptReason}
        </div>
      )}
      <p style={{ color: C.text2, fontSize: 15, lineHeight: 1.6, maxWidth: 640, margin: "0 0 32px" }}>
        {workout.coachNote}
      </p>
      <div className="split-today">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {workout.segments.map((s, i) => (
            <div
              key={`${s.name}-${i}`}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div style={{ width: 10, height: 40, borderRadius: 5, background: s.color }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{s.detail}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{ fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                >
                  {s.target}
                </div>
                <div style={{ fontSize: 12.5, color: C.muted }}>{s.zone}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: C.panel, color: C.text, borderRadius: 14, padding: 24 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: C.panelLabel,
              marginBottom: 18,
            }}
          >
            SESSION TARGETS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
            <Row label="Distance" value={`${workout.km} km`} />
            <Row label="Duration" value={workout.duration} />
            <Row label="Primary zone" value={workout.zone} />
            <Row label="Target HR" value={workout.hr} />
            <Row label="Target pace" value={workout.pace} />
          </div>
          <button
            onClick={onAskCoach}
            style={{
              marginTop: 22,
              width: "100%",
              background: C.successBg,
              color: C.mint,
              border: "none",
              borderRadius: 9,
              padding: 12,
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Ask the coach about this session
          </button>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: C.panelLabel }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
