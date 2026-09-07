"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppState } from "@/lib/state";
import Onboarding from "./Onboarding";
import AuthDialog from "./AuthDialog";
import PlanTab from "./tabs/PlanTab";
import TodayTab from "./tabs/TodayTab";
import ZonesTab from "./tabs/ZonesTab";
import ProgressTab from "./tabs/ProgressTab";
import RecoveryTab from "./tabs/RecoveryTab";
import RaceTab from "./tabs/RaceTab";
import LogTab from "./tabs/LogTab";
import CoachTab from "./tabs/CoachTab";
import { C } from "./ui";

export type TabId =
  | "plan"
  | "today"
  | "zones"
  | "progress"
  | "recovery"
  | "race"
  | "log"
  | "coach";

const TABS: Array<[TabId, string]> = [
  ["plan", "Plan"],
  ["today", "Today's workout"],
  ["zones", "HR zones"],
  ["progress", "Progress"],
  ["recovery", "Recovery"],
  ["race", "Race readiness"],
  ["log", "Run log"],
  ["coach", "Coach"],
];

export default function App({ initialState }: { initialState: AppState }) {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<TabId>("plan");
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [auth, setAuth] = useState<"strava" | "garmin" | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state");
    if (res.ok) setState((await res.json()) as AppState);
  }, []);

  // Surface the outcome of an OAuth round trip, then tidy the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");
    const status = params.get("status");
    if (!connect) return;
    const name = connect === "strava" ? "Strava" : "Garmin";
    setSyncNote(
      status === "ok"
        ? `${name} connected.`
        : status === "denied"
          ? `${name} authorization was cancelled.`
          : status === "scope"
            ? `${name} needs activity access — reconnect and tick every box.`
            : `${name} connection failed — check the server logs.`,
    );
    window.history.replaceState({}, "", "/");
    void refresh();
  }, [refresh]);

  async function syncStrava() {
    if (syncing) return;
    if (!state.connections.strava.connected) {
      setAuth("strava");
      return;
    }
    setSyncing(true);
    setSyncNote(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) setSyncNote(body.error ?? "Sync failed");
      else if (body.imported === 0) setSyncNote("Up to date — no new runs on Strava.");
      else setSyncNote(`${body.imported} new run${body.imported === 1 ? "" : "s"} imported.`);
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function dismissBanner(id: number) {
    setState((s) => ({ ...s, banner: null }));
    await fetch("/api/banner/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  if (!state.onboarded) {
    return (
      <Onboarding
        state={state}
        onDone={async () => {
          await refresh();
        }}
      />
    );
  }

  const openDay = (date: string) => {
    setViewDate(date);
    setTab("today");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: C.bg,
          borderBottom: `1px solid ${C.border}`,
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          gap: 28,
          height: 64,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 12 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#F7F5F0",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ fontWeight: 600, letterSpacing: "0.04em", fontSize: 13 }}>STRIDE</div>
        </div>
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                if (id === "today") setViewDate(null);
              }}
              style={{
                background: tab === id ? C.text : "transparent",
                color: tab === id ? C.bg : C.text2,
                border: "none",
                borderRadius: 8,
                padding: "9px 16px",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          onClick={syncStrava}
          className="btn-soft"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "9px 16px",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            color: C.text,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: C.strava,
              display: "inline-block",
            }}
          />
          {syncing
            ? "Syncing…"
            : state.connections.strava.connected
              ? "Sync Strava"
              : "Connect Strava"}
        </button>
      </header>

      {state.banner && (
        <div
          style={{
            background: C.successBg,
            borderBottom: `1px solid ${C.successBorder}`,
            padding: "12px 32px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 14,
            color: C.mint,
          }}
        >
          <span style={{ fontWeight: 700 }}>Plan updated.</span>
          <span style={{ flex: 1 }}>{state.banner.summary}</span>
          <button
            onClick={() => dismissBanner(state.banner!.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.mint,
              fontWeight: 700,
              fontSize: 15,
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {syncNote && (
        <div
          style={{
            background: C.card,
            borderBottom: `1px solid ${C.border}`,
            padding: "10px 32px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13.5,
            color: C.text2,
          }}
        >
          <span style={{ flex: 1 }}>{syncNote}</span>
          <button
            onClick={() => setSyncNote(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.muted,
              fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>
      )}

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1120,
          margin: "0 auto",
          padding: "36px 32px 80px",
        }}
      >
        {tab === "plan" && <PlanTab state={state} onOpenDay={openDay} />}
        {tab === "today" && (
          <TodayTab state={state} date={viewDate} onAskCoach={() => setTab("coach")} />
        )}
        {tab === "zones" && <ZonesTab state={state} />}
        {tab === "progress" && <ProgressTab state={state} />}
        {tab === "recovery" && <RecoveryTab state={state} onRefresh={refresh} />}
        {tab === "race" && <RaceTab state={state} />}
        {tab === "log" && <LogTab state={state} onRefresh={refresh} />}
        {tab === "coach" && <CoachTab state={state} onRefresh={refresh} />}
      </main>

      {auth && (
        <AuthDialog
          provider={auth}
          user={state.user}
          busy={authBusy}
          onCancel={() => setAuth(null)}
          onApprove={() => {
            setAuthBusy(true);
            window.location.href = `/api/${auth}/authorize`;
          }}
        />
      )}
    </div>
  );
}
