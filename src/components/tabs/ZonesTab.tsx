"use client";

import type { AppState } from "@/lib/state";
import { C, h1 } from "../ui";

export default function ZonesTab({ state }: { state: AppState }) {
  const { lthr, maxHr, estimatedZones } = state.profile;
  return (
    <>
      <h1 style={{ ...h1, marginBottom: 8 }}>Heart rate zones</h1>
      <p style={{ color: C.text2, fontSize: 14.5, margin: "0 0 28px", maxWidth: 640 }}>
        {estimatedZones
          ? "Estimated for now — your uploads carry no heart rate, so these are provisional and will recalibrate as soon as your watch sends HR again."
          : `Lactate threshold ${lthr} bpm (max ${maxHr}), measured from your own watch data. Zones recalibrate automatically after every sync as your fitness moves.`}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
        {state.zones.map((z) => (
          <div
            key={z.key}
            className="grid-zone"
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "18px 22px",
            }}
          >
            <div className="zone-bar" style={{ background: z.color }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{z.name}</div>
              <div style={{ fontSize: 12.5, color: C.muted }}>{z.pct}</div>
            </div>
            <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.5 }}>{z.purpose}</div>
            <div style={{ fontWeight: 600, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
              {z.range}
            </div>
            <div style={{ fontSize: 13, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
              {z.pace}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
