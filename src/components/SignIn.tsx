"use client";

import { useState } from "react";

const CARD: React.CSSProperties = {
  background: "#1C2620",
  border: "1px solid #2E3B33",
  borderRadius: 12,
  padding: "18px 20px",
};

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not sign in");
      setBusy(false);
      return;
    }
    window.location.href = "/";
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
      <div style={{ width: 460, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#1F4D3A",
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
        </div>

        <h1
          style={{
            fontFamily: "Spectral, serif",
            fontWeight: 500,
            fontSize: 40,
            lineHeight: 1.15,
            margin: "0 0 16px",
          }}
        >
          Your coach is waiting.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#A9B7AE", margin: "0 0 36px" }}>
          Sign in to build your plan. Stride connects to your Garmin and Strava accounts and reshapes
          the weeks ahead around every run you post.
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={CARD}>
            <label style={{ fontSize: 13, color: "#8A968D", display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                border: "1px solid #2E3B33",
                borderRadius: 8,
                padding: "11px 14px",
                fontFamily: "inherit",
                fontSize: 14,
                outline: "none",
                background: "#121814",
                color: "#E8EDE9",
              }}
            />
          </div>
          <div style={CARD}>
            <label style={{ fontSize: 13, color: "#8A968D", display: "block", marginBottom: 6 }}>
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Runner"
              style={{
                width: "100%",
                border: "1px solid #2E3B33",
                borderRadius: 8,
                padding: "11px 14px",
                fontFamily: "inherit",
                fontSize: 14,
                outline: "none",
                background: "#121814",
                color: "#E8EDE9",
              }}
            />
          </div>
          {error && <div style={{ color: "#E3B34C", fontSize: 13.5 }}>{error}</div>}
          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            style={{
              width: "100%",
              background: "#1F4D3A",
              color: "#F7F5F0",
              border: "none",
              borderRadius: 10,
              padding: 16,
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 12,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
