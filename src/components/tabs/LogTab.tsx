"use client";

import { useEffect, useState } from "react";
import type { AppState } from "@/lib/state";
import { C, h1 } from "../ui";

const FEELS = ["Great", "Good", "OK", "Rough"] as const;

export default function LogTab({
  state,
  onRefresh,
}: {
  state: AppState;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [feel, setFeel] = useState<string | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<RunDetail | null>(null);

  const run = state.log.find((r) => r.id === selected) ?? null;

  useEffect(() => {
    if (selected === null) {
      setDetail(null);
      return;
    }
    let live = true;
    fetch(`/api/runs/${selected}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!live || !body) return;
        setDetail(body as RunDetail);
        if (body.survey) {
          setFeel(body.survey.feel);
          setRpe(body.survey.rpe);
          setNotes(body.survey.notes);
          setSaved(true);
        } else {
          setFeel(null);
          setRpe(null);
          setNotes("");
          setSaved(false);
        }
      });
    return () => {
      live = false;
    };
  }, [selected]);

  async function save() {
    if (selected === null || !feel || !rpe) return;
    setSaving(true);
    const res = await fetch(`/api/runs/${selected}/survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feel, rpe, notes }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      await onRefresh();
    }
  }

  if (run && detail) {
    return (
      <>
        <button
          onClick={() => setSelected(null)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13.5,
            fontWeight: 600,
            color: C.mint,
            padding: 0,
            marginBottom: 14,
          }}
        >
          ‹ Back to run log
        </button>
        <h1 style={{ ...h1, marginBottom: 4 }}>{run.name}</h1>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 26 }}>
          {run.date} · {run.km} km · {run.pace} · {run.hr}
        </div>
        <div className="split-log">
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: 26,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>How did it feel?</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 10 }}>
              OVERALL FEEL
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {FEELS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFeel(f)}
                  style={{
                    flex: 1,
                    background: feel === f ? C.text : C.bg,
                    color: feel === f ? C.bg : C.text2,
                    border: `1px solid ${feel === f ? C.text : C.border}`,
                    borderRadius: 9,
                    padding: "11px 0",
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 10 }}>
              EFFORT (RPE 1–10)
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setRpe(n)}
                  style={{
                    flex: 1,
                    background: rpe === n ? C.text : C.bg,
                    color: rpe === n ? C.bg : C.text2,
                    border: `1px solid ${rpe === n ? C.text : C.border}`,
                    borderRadius: 8,
                    padding: "10px 0",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 10 }}>
              YOUR THOUGHTS
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Legs, breathing, niggles, fuelling, anything the watch can't see…"
              style={{
                width: "100%",
                minHeight: 110,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "13px 16px",
                fontFamily: "inherit",
                fontSize: 14,
                outline: "none",
                background: C.bg,
                color: C.text,
                resize: "vertical",
              }}
            />
            <button
              onClick={save}
              disabled={!feel || !rpe || saving}
              className="btn-primary"
              style={{
                marginTop: 18,
                width: "100%",
                background: C.accent,
                color: "#F7F5F0",
                border: "none",
                borderRadius: 10,
                padding: 14,
                fontFamily: "inherit",
                fontSize: 14.5,
                fontWeight: 600,
                cursor: "pointer",
                opacity: !feel || !rpe || saving ? 0.5 : 1,
              }}
            >
              {saving ? "Saving…" : saved ? "Update feedback" : "Save feedback"}
            </button>
            {saved && (
              <div
                style={{
                  marginTop: 14,
                  background: C.successBg,
                  borderRadius: 10,
                  padding: "13px 16px",
                  fontSize: 13.5,
                  color: C.mint,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontWeight: 700 }}>Logged.</span> This feedback is now part of the
                algorithm — it weighs alongside your HR and pace data when the plan adapts.
              </div>
            )}
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
              FROM THE WATCH
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              <Row label="Distance" value={`${detail.km} km`} />
              <Row label="Avg pace" value={detail.pace} />
              <Row label="Avg HR" value={detail.hr} />
              <Row label="Time in Z2" value={detail.z2} />
              <Row label="Cadence" value={detail.cadence} />
            </div>
            <div
              style={{
                marginTop: 22,
                padding: 15,
                background: "#2C3E36",
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.55,
                color: "#C6D3CB",
              }}
            >
              {detail.watchNote}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 style={{ ...h1, marginBottom: 8 }}>Run log</h1>
      <p style={{ color: C.text2, fontSize: 14.5, margin: "0 0 24px", maxWidth: 640 }}>
        Tap a run to inspect it and tell the coach how it felt. Your feedback feeds the algorithm
        alongside the watch data.
      </p>
      {state.log.length === 0 && (
        <div style={{ color: C.muted, fontSize: 14 }}>
          No runs synced yet — post one to Strava and hit Sync.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 780 }}>
        {state.log.map((r) => (
          <div
            key={r.id}
            onClick={() => setSelected(r.id)}
            className="card-click grid-logrow"
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "16px 20px",
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            <div style={{ color: C.muted }}>{r.date}</div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontVariantNumeric: "tabular-nums" }}>{r.km} km</div>
            <div style={{ fontVariantNumeric: "tabular-nums" }}>{r.pace}</div>
            <div style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{r.hr}</div>
            <div
              style={{
                textAlign: "right",
                fontWeight: 700,
                fontSize: 12,
                color: r.logged ? C.mint : C.warn,
              }}
            >
              {r.logged ? "LOGGED ✓" : "ADD FEEDBACK"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

interface RunDetail {
  km: string;
  pace: string;
  hr: string;
  z2: string;
  cadence: string;
  watchNote: string;
  survey: { feel: string; rpe: number; notes: string } | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: C.panelLabel }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
