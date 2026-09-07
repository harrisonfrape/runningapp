"use client";

import { useState } from "react";
import type { AppState } from "@/lib/state";
import AuthDialog from "./AuthDialog";
import { C, primaryButton } from "./ui";

export default function Onboarding({
  state,
  onDone,
}: {
  state: AppState;
  onDone: () => void;
}) {
  const [step, setStep] = useState(state.connections.strava.connected ? 2 : 1);
  const [auth, setAuth] = useState<"strava" | "garmin" | null>(null);
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);

  const { strava, garmin, allowSkipConnect } = state.connections;
  const bothConnected = strava.connected && garmin.connected;
  const canContinue = bothConnected || allowSkipConnect;

  async function finish() {
    setBuilding(true);
    await fetch("/api/onboarding/complete", { method: "POST" });
    onDone();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div style={{ width: 560, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#F7F5F0",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ fontWeight: 600, letterSpacing: "0.04em", fontSize: 14 }}>STRIDE</div>
          <div style={{ marginLeft: "auto", fontSize: 13, color: C.muted }}>Step {step} of 3</div>
        </div>

        {step === 1 && <StepGoal state={state} onNext={() => setStep(2)} />}

        {step === 2 && (
          <>
            <h1
              style={{
                fontFamily: "Spectral, serif",
                fontWeight: 500,
                fontSize: 40,
                lineHeight: 1.15,
                margin: "0 0 16px",
              }}
            >
              Connect your data.
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: C.text2, margin: "0 0 36px" }}>
              Garmin gives us heart rate and recovery. Strava keeps the plan updating — every run you
              post reshapes the weeks ahead.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 36 }}>
              <ProviderRow
                provider="garmin"
                title="Garmin"
                subtitle="Watch data, heart rate, sleep"
                connected={garmin.connected}
                configured={garmin.configured}
                onConnect={() => setAuth("garmin")}
              />
              <ProviderRow
                provider="strava"
                title="Strava"
                subtitle="Auto-sync every posted run into the algorithm"
                connected={strava.connected}
                configured={strava.configured}
                onConnect={() => setAuth("strava")}
              />
            </div>

            {auth && (
              <AuthDialog
                provider={auth}
                user={state.user}
                busy={busy}
                onCancel={() => setAuth(null)}
                onApprove={() => {
                  setBusy(true);
                  window.location.href = `/api/${auth}/authorize`;
                }}
              />
            )}

            <button
              onClick={() => setStep(3)}
              disabled={!canContinue}
              className="btn-primary"
              style={{ ...primaryButton, opacity: canContinue ? 1 : 0.45 }}
            >
              Continue
            </button>
            {!bothConnected && (
              <div style={{ marginTop: 14, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                {!garmin.configured || !strava.configured
                  ? "One of the providers has no API credentials configured on this server — see the README for the Strava and Garmin developer setup."
                  : "Connect both providers to continue. The plan needs Strava for what you run and Garmin for how you recover."}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1
              style={{
                fontFamily: "Spectral, serif",
                fontWeight: 500,
                fontSize: 40,
                lineHeight: 1.15,
                margin: "0 0 16px",
              }}
            >
              Your heart rate zones.
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: C.text2, margin: "0 0 36px" }}>
              {state.profile.estimatedZones
                ? "Estimated for now — these calibrate automatically as soon as your watch starts sending heart rate."
                : `Anchored on a threshold of ${state.profile.lthr} bpm (max ${state.profile.maxHr}), measured from your own watch data. They recalibrate as your fitness moves.`}{" "}
              Most of your training will sit in Zone 2.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 36 }}>
              {state.zones.map((z) => (
                <div
                  key={z.key}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div style={{ width: 10, height: 34, borderRadius: 5, background: z.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{z.name}</div>
                    <div style={{ fontSize: 13, color: C.muted }}>{z.purpose}</div>
                  </div>
                  <div
                    style={{ fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                  >
                    {z.range}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={finish}
              disabled={building}
              className="btn-primary"
              style={{ ...primaryButton, opacity: building ? 0.6 : 1 }}
            >
              {building ? "Building your plan…" : "Build my plan"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StepGoal({ state, onNext }: { state: AppState; onNext: () => void }) {
  const [editing, setEditing] = useState(false);
  const [raceDate, setRaceDate] = useState(state.profile.raceDate);
  const [goal, setGoal] = useState(state.profile.goalTime);
  const [saving, setSaving] = useState(false);

  const best = state.race.factors[0];

  async function save() {
    setSaving(true);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceDate, goalTime: goal }),
    });
    window.location.reload();
  }

  return (
    <>
      <h1
        style={{
          fontFamily: "Spectral, serif",
          fontWeight: 500,
          fontSize: 40,
          lineHeight: 1.15,
          margin: "0 0 16px",
        }}
      >
        Let&apos;s get you to {state.profile.raceName.replace(/ Marathon$/, "")}.
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: C.text2, margin: "0 0 36px" }}>
        Your coach builds a plan around your goal and your real training data, then adjusts it after
        every run you post.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "18px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Race</div>
            <div style={{ fontWeight: 600 }}>{state.profile.raceName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Date</div>
            {editing ? (
              <input
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                style={inputStyle}
              />
            ) : (
              <div style={{ fontWeight: 600 }}>{state.profile.raceDateLabel}</div>
            )}
          </div>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "18px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Goal time</div>
            {editing ? (
              <input value={goal} onChange={(e) => setGoal(e.target.value)} style={inputStyle} />
            ) : (
              <div style={{ fontWeight: 600 }}>
                {state.profile.goalTime} &nbsp;·&nbsp; {state.profile.goalPace}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Recent result</div>
            <div style={{ fontWeight: 600 }}>
              {state.connections.strava.connected ? best?.value ?? "—" : "Connect Strava"}
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={() => (editing ? save() : setEditing(true))}
        disabled={saving}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          marginBottom: 28,
          color: C.mint,
          fontFamily: "inherit",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {editing ? (saving ? "Saving…" : "Save goal") : "Not right? Adjust the goal"}
      </button>
      <button onClick={onNext} className="btn-primary" style={primaryButton}>
        This looks right
      </button>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "6px 10px",
  color: C.text,
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 600,
  textAlign: "right",
};

function ProviderRow({
  provider,
  title,
  subtitle,
  connected,
  configured,
  onConnect,
}: {
  provider: "strava" | "garmin";
  title: string;
  subtitle: string;
  connected: boolean;
  configured: boolean;
  onConnect: () => void;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: provider === "strava" ? C.strava : C.garmin,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {provider === "strava" ? "S" : "G"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.muted }}>{subtitle}</div>
      </div>
      {connected ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: C.mint }}>✓ Connected</div>
      ) : configured ? (
        <button
          onClick={onConnect}
          className="btn-ghost"
          style={{
            background: C.raised,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "9px 18px",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            color: C.text,
          }}
        >
          Connect
        </button>
      ) : (
        <div style={{ fontSize: 13, fontWeight: 600, color: C.warn }}>Not configured</div>
      )}
    </div>
  );
}
