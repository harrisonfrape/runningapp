"use client";

import { C } from "./ui";

const SCOPES = {
  strava: [
    "See your activities as soon as you post them, including private ones",
    "Read pace, heart rate, splits and effort data from each run",
    "Feed every new run into your training algorithm automatically",
  ],
  garmin: [
    "Read workouts, heart rate and pace from your watch",
    "Read sleep, HRV, body battery and recovery scores",
    "Keep your heart rate zones calibrated as your fitness changes",
  ],
} as const;

const META = {
  strava: {
    color: C.strava,
    initial: "S",
    title: "Authorize Stride on Strava",
    subtitle: "strava.com/oauth/authorize",
    approve: "Authorize",
    busy: "Linking your Strava account…",
  },
  garmin: {
    color: C.garmin,
    initial: "G",
    title: "Garmin Connect authorization",
    subtitle: "connect.garmin.com/oauth2Confirm",
    approve: "Allow access",
    busy: "Pairing with Garmin Connect…",
  },
} as const;

export default function AuthDialog({
  provider,
  user,
  busy,
  onCancel,
  onApprove,
}: {
  provider: "strava" | "garmin";
  user: { name: string; email: string };
  busy: boolean;
  onCancel: () => void;
  onApprove: () => void;
}) {
  const meta = META[provider];
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 10, 8, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: "100%",
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: meta.color,
            padding: "22px 26px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: "rgba(255,255,255,0.18)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {meta.initial}
          </div>
          <div style={{ color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{meta.title}</div>
            <div style={{ fontSize: 12.5, opacity: 0.85 }}>{meta.subtitle}</div>
          </div>
        </div>
        <div style={{ padding: "24px 26px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: C.bubble,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{user.name}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{user.email}</div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>Signed in</div>
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: C.muted,
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            STRIDE WILL BE ABLE TO
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
            {SCOPES[provider].map((text) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  gap: 10,
                  fontSize: 13.5,
                  color: C.text2,
                  lineHeight: 1.45,
                }}
              >
                <span style={{ color: C.mint, fontWeight: 700 }}>✓</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
          {busy ? (
            <div
              className="pulse"
              style={{ textAlign: "center", padding: 12, fontSize: 13.5, color: C.muted }}
            >
              {meta.busy}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onCancel}
                className="btn-soft"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  borderRadius: 9,
                  padding: 13,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: C.text2,
                }}
              >
                Cancel
              </button>
              <button
                onClick={onApprove}
                style={{
                  flex: 2,
                  background: meta.color,
                  color: "#fff",
                  border: "none",
                  borderRadius: 9,
                  padding: 13,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {meta.approve}
              </button>
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Continuing takes you to {provider === "strava" ? "Strava" : "Garmin Connect"} to sign in
            and grant access. Stride never sees your password.
          </div>
        </div>
      </div>
    </div>
  );
}
