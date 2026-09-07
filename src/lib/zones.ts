import type { Zone } from "./types";

export const ZONE_COLORS = ["#B9C7BE", "#7FB89A", "#E3B34C", "#D97B4F", "#C24A3D"] as const;

/** % of LTHR boundaries — Friel's 5-zone model, the one the design's copy describes. */
const BOUNDS: Array<{ lo: number; hi: number }> = [
  { lo: 0, hi: 0.68 },
  { lo: 0.68, hi: 0.83 },
  { lo: 0.84, hi: 0.94 },
  { lo: 0.95, hi: 1.05 },
  { lo: 1.06, hi: 1.25 },
];

const META = [
  {
    name: "Z1 · Recovery",
    pct: "< 68% LTHR",
    purpose: "Warm-ups, cool-downs, recovery days",
  },
  {
    name: "Z2 · Endurance",
    pct: "68–83% LTHR",
    purpose: "Aerobic base — where most of your kilometres live",
  },
  {
    name: "Z3 · Tempo",
    pct: "84–94% LTHR",
    purpose: "Steady comfortably-hard running, marathon effort",
  },
  {
    name: "Z4 · Threshold",
    pct: "95–105% LTHR",
    purpose: "Lactate threshold — tempo and cruise intervals",
  },
  {
    name: "Z5 · VO2 max",
    pct: "> 105% LTHR",
    purpose: "Short hard repeats, top-end speed",
  },
];

export function paceString(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Zone pace bands, anchored on threshold pace (the pace an athlete can hold for
 * roughly an hour). Multipliers are the standard Daniels/Friel equivalents.
 */
const PACE_FACTORS: Array<[number, number]> = [
  [1.35, 1.7],
  [1.19, 1.34],
  [1.05, 1.18],
  [0.96, 1.04],
  [0.8, 0.95],
];

export function buildZones(lthr: number, maxHr: number, thresholdPaceSecPerKm: number): Zone[] {
  // Upper bound of each zone in bpm, then each zone starts one beat above the
  // one below it — so the bands are contiguous with no unassigned heart rates.
  const highs = BOUNDS.map((b, i) => (i === 4 ? Math.max(maxHr, Math.round(lthr * b.hi)) : Math.round(lthr * b.hi)));

  return BOUNDS.map((b, i) => {
    const lowHr = i === 0 ? 0 : highs[i - 1] + 1;
    const highHr = highs[i];
    const range =
      i === 0
        ? `< ${highHr + 1} bpm`
        : i === 4
          ? `${lowHr}+ bpm`
          : `${lowHr}–${highHr} bpm`;
    const [fastF, slowF] = PACE_FACTORS[i];
    const fast = thresholdPaceSecPerKm * fastF;
    const slow = thresholdPaceSecPerKm * slowF;
    const pace =
      i === 0
        ? `> ${paceString(fast)} /km`
        : i === 4
          ? `< ${paceString(slow)} /km`
          : `${paceString(fast)}–${paceString(slow)} /km`;
    return {
      key: (i + 1) as Zone["key"],
      name: META[i].name,
      pct: META[i].pct,
      purpose: META[i].purpose,
      range,
      pace,
      color: ZONE_COLORS[i],
      lowHr,
      highHr,
    };
  });
}

/** Which zone a heart rate falls in (1–5). */
export function zoneForHr(hr: number, zones: Zone[]): number {
  for (const z of zones) if (hr <= z.highHr) return z.key;
  return 5;
}

/** Seconds spent in each zone from a heart-rate stream sampled at `times`. */
export function zoneSeconds(
  hrStream: number[],
  timeStream: number[],
  zones: Zone[],
): Record<string, number> {
  const out: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (let i = 1; i < hrStream.length && i < timeStream.length; i++) {
    const dt = timeStream[i] - timeStream[i - 1];
    if (dt <= 0 || dt > 60) continue;
    const z = zoneForHr(hrStream[i], zones);
    out[String(z)] += dt;
  }
  return out;
}

/**
 * Estimate LTHR from a hard effort's max HR when no lab/field test exists.
 * Garmin's own threshold estimate is preferred when available.
 */
export function estimateLthrFromMax(maxHr: number): number {
  return Math.round(maxHr * 0.875);
}

export function estimateMaxHr(age: number): number {
  return Math.round(211 - 0.64 * age);
}
