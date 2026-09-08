"use client";

import { useState } from "react";
import type { AppState } from "@/lib/state";
import { C, h1, h2 } from "../ui";

export default function PlanTab({
  state,
  onOpenDay,
}: {
  state: AppState;
  onOpenDay: (date: string) => void;
}) {
  const [weekIdx, setWeekIdx] = useState(state.plan.currentWeek);
  const weeks = state.plan.weeks;
  const week = weeks.find((w) => w.week === weekIdx) ?? weeks[0];
  const first = weeks[0]?.week ?? 1;
  const last = weeks[weeks.length - 1]?.week ?? 1;
  const isCurrent = weekIdx === state.plan.currentWeek;

  if (!week) {
    return (
      <div>
        <h1 style={h1}>Training plan</h1>
        <p style={{ color: C.text2, marginTop: 16 }}>
          No plan yet — connect Strava and the plan builds itself from your history.
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 6 }}>
        <h1 style={h1}>Training plan</h1>
        <div style={{ fontSize: 14, color: C.muted }}>
          {state.profile.weeksToRace} weeks to {state.profile.raceName.replace(/ Marathon$/, "")} ·{" "}
          {week.phase} phase
        </div>
      </div>
      <p style={{ color: C.text2, fontSize: 14.5, margin: "0 0 28px", maxWidth: 640 }}>
        {state.plan.summary}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <button
          onClick={() => setWeekIdx((w) => Math.max(first, w - 1))}
          disabled={weekIdx === first}
          className="btn-soft"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            width: 34,
            height: 34,
            fontFamily: "inherit",
            fontSize: 15,
            cursor: "pointer",
            color: C.text,
            opacity: weekIdx === first ? 0.35 : 1,
          }}
        >
          ‹
        </button>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 200, textAlign: "center" }}>
          Week {week.week} · {week.phase} phase{isCurrent ? " (this week)" : ""}
        </div>
        <button
          onClick={() => setWeekIdx((w) => Math.min(last, w + 1))}
          disabled={weekIdx === last}
          className="btn-soft"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            width: 34,
            height: 34,
            fontFamily: "inherit",
            fontSize: 15,
            cursor: "pointer",
            color: C.text,
            opacity: weekIdx === last ? 0.35 : 1,
          }}
        >
          ›
        </button>
        <div style={{ fontSize: 13, color: C.muted }}>
          {isCurrent
            ? ""
            : weekIdx < state.plan.currentWeek
              ? "Past — what was planned that week."
              : "Projected — will adjust to how the weeks before actually go."}
        </div>
      </div>

      <div className="grid-week" style={{ marginBottom: 32 }}>
        {week.days.map((d) => (
          <div
            key={d.date}
            onClick={() => onOpenDay(d.date)}
            className="card-click"
            style={{
              background: d.isToday ? C.todayBg : C.card,
              border: `1px solid ${d.isToday ? C.mint : C.border}`,
              borderRadius: 12,
              padding: 14,
              minHeight: 168,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{d.day}</div>
              {d.adapted && (
                <div
                  title={d.adaptReason ?? "Adjusted after your last sync"}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.warn,
                    background: C.warnBg,
                    borderRadius: 20,
                    padding: "3px 8px",
                  }}
                >
                  ADAPTED
                </div>
              )}
              {d.done && !d.adapted && (
                <div style={{ fontSize: 11, fontWeight: 700, color: C.mint }}>✓</div>
              )}
            </div>
            <div style={{ width: 26, height: 4, borderRadius: 2, background: d.color }} />
            <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>{d.title}</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{d.sub}</div>
            <div
              style={{ marginTop: "auto", fontSize: 12, color: C.text2, fontWeight: 600 }}
            >
              {d.load}
            </div>
          </div>
        ))}
      </div>

      <h2 style={h2}>The block ahead</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {state.plan.block.map((w) => (
          <div
            key={w.n}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "12px 18px",
              fontSize: 13.5,
            }}
            className="grid-block"
          >
            <div style={{ fontWeight: 600 }}>Week {w.n}</div>
            <div style={{ color: w.phaseColor, fontWeight: 600 }}>{w.phase}</div>
            <div style={{ color: C.text2 }}>{w.focus}</div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ fontWeight: 600 }}>{w.km} km</span>{" "}
              <span style={{ color: C.muted }}>planned</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
