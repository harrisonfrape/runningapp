import type { CSSProperties } from "react";

export const C = {
  bg: "#121814",
  card: "#1C2620",
  border: "#2E3B33",
  raised: "#26302A",
  text: "#E8EDE9",
  text2: "#A9B7AE",
  muted: "#8A968D",
  accent: "#1F4D3A",
  accentHover: "#16382A",
  mint: "#7FB89A",
  bubble: "#2E6B4F",
  successBg: "#1F3A2D",
  successBorder: "#2E5240",
  warn: "#E3B34C",
  warnBg: "#3A311A",
  warnCard: "#332B18",
  warnBorder: "#4D3F1E",
  panel: "#21302A",
  panelLabel: "#9BB0A4",
  garmin: "#0A2540",
  strava: "#FC4C02",
  stravaBadge: "#3A241A",
  todayBg: "#243129",
} as const;

export const card: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
};

export const h1: CSSProperties = {
  fontFamily: "Spectral, serif",
  fontWeight: 500,
  fontSize: 32,
  margin: 0,
};

export const h2: CSSProperties = {
  fontFamily: "Spectral, serif",
  fontWeight: 500,
  fontSize: 20,
  margin: "0 0 14px",
};

export const primaryButton: CSSProperties = {
  width: "100%",
  background: C.accent,
  color: "#F7F5F0",
  border: "none",
  borderRadius: 10,
  padding: 16,
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

export const num: CSSProperties = { fontVariantNumeric: "tabular-nums" };

export const scoreColor = (score: number | null): string =>
  score === null ? C.muted : score >= 80 ? C.mint : score >= 65 ? "#B9C7BE" : C.warn;
