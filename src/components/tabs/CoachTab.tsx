"use client";

import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/state";
import { C, h1 } from "../ui";

interface Msg {
  id: number;
  role: "user" | "coach";
  text: string;
}

export default function CoachTab({
  state,
  onRefresh,
}: {
  state: AppState;
  onRefresh: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<Msg[]>(state.chat);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(state.chat);
  }, [state.chat]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  async function send() {
    const q = input.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m, { id: Date.now(), role: "user", text: q }]);
    setInput("");
    setThinking(true);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const body = await res.json();
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "coach",
          text: body.reply ?? "I couldn't reach the coaching engine just now — try again in a moment.",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "coach",
          text: "I couldn't reach the coaching engine just now — try again in a moment.",
        },
      ]);
    } finally {
      setThinking(false);
      void onRefresh();
    }
  }

  return (
    <>
      <h1 style={{ ...h1, marginBottom: 8 }}>Coach</h1>
      <p style={{ color: C.text2, fontSize: 14.5, margin: "0 0 24px" }}>
        Knows your plan, your zones, and every synced run. Ask anything.
      </p>
      {!state.connections.coach.configured && (
        <div
          style={{
            background: C.warnCard,
            border: `1px solid ${C.warnBorder}`,
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 16,
            fontSize: 13.5,
            color: C.warn,
            maxWidth: 780,
          }}
        >
          The coaching engine has no API key configured — set <code>ANTHROPIC_API_KEY</code> on the
          server to bring the coach online.
        </div>
      )}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          height: 560,
          maxWidth: 780,
        }}
      >
        <div
          ref={scrollRef}
          className="chat-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}
            >
              <div
                style={{
                  maxWidth: "78%",
                  background: m.role === "user" ? C.bubble : C.raised,
                  color: m.role === "user" ? "#F7F5F0" : C.text,
                  borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  padding: "13px 17px",
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ display: "flex" }}>
              <div
                className="pulse-slow"
                style={{
                  background: C.raised,
                  borderRadius: "14px 14px 14px 4px",
                  padding: "13px 17px",
                  fontSize: 14,
                  color: C.muted,
                }}
              >
                Coach is thinking…
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            borderTop: `1px solid ${C.raised}`,
            padding: 14,
            display: "flex",
            gap: 10,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="e.g. I'm feeling tired — should I still do tomorrow's intervals?"
            style={{
              flex: 1,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "13px 16px",
              fontFamily: "inherit",
              fontSize: 14,
              outline: "none",
              background: C.bg,
              color: C.text,
            }}
          />
          <button
            onClick={() => void send()}
            className="btn-primary"
            style={{
              background: C.accent,
              color: "#F7F5F0",
              border: "none",
              borderRadius: 10,
              padding: "0 22px",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}
