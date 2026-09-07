import type { Phase, SessionType } from "./types";
import { paceString } from "./zones";

export interface PlanInput {
  planStart: string; // ISO Monday of week 1
  raceDate: string; // ISO race day
  baselineKm: number; // athlete's current 4-week average weekly volume
  baselineRunsPerWeek: number;
  goalSeconds: number; // marathon goal
  longestRecentKm: number;
}

export interface GeneratedDay {
  date: string;
  week: number;
  dayIdx: number; // 0 = Monday
  phase: Phase;
  type: SessionType;
  title: string;
  sub: string;
  km: number;
  zone: string;
}

export const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const DAY_NAMES_FULL = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export const PHASE_COLORS: Record<Phase, string> = {
  Prep: "#8A968D",
  Base: "#7FB89A",
  Build: "#E3B34C",
  Strength: "#D97B4F",
  Sharpen: "#C24A3D",
  Peak: "#7FB89A",
  Taper: "#8A968D",
};

export { typeColor } from "./session-view";
export { paceString } from "./zones";

/* ---------- date helpers (UTC-safe, date-only) ---------- */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/** Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const d = parseDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(iso, -dow);
}

export function weeksBetween(fromIso: string, toIso: string): number {
  const ms = parseDate(toIso).getTime() - parseDate(fromIso).getTime();
  return Math.round(ms / (7 * 86400000));
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = parseDate(toIso).getTime() - parseDate(fromIso).getTime();
  return Math.round(ms / 86400000);
}

/* ---------- phases ---------- */

/** Canonical 36-week shape, scaled to however many weeks the athlete actually has. */
const CANON: Array<[Phase, number]> = [
  ["Prep", 7],
  ["Base", 13],
  ["Build", 19],
  ["Strength", 25],
  ["Sharpen", 30],
  ["Peak", 33],
  ["Taper", 36],
];

export function phaseFor(week: number, totalWeeks: number): Phase {
  const build = totalWeeks - 3; // the taper is always the last three weeks
  if (week > build) return "Taper";
  for (const [phase, endWeek] of CANON) {
    if (phase === "Taper") break;
    if (week <= Math.round((endWeek / 33) * build)) return phase;
  }
  return "Peak";
}

export function phaseRanges(totalWeeks: number): Array<{ phase: Phase; from: number; to: number }> {
  const out: Array<{ phase: Phase; from: number; to: number }> = [];
  let from = 1;
  for (let w = 1; w <= totalWeeks; w++) {
    const p = phaseFor(w, totalWeeks);
    const next = w === totalWeeks ? null : phaseFor(w + 1, totalWeeks);
    if (p !== next) {
      out.push({ phase: p, from, to: w });
      from = w + 1;
    }
  }
  return out;
}

/* ---------- volume ---------- */

/**
 * Where the weekly volume starts. Slightly above the athlete's current base —
 * prep adds a run or two a week, not distance — with a floor that keeps the
 * individual sessions meaningful rather than 2 km token efforts.
 */
export function startVolume(baselineKm: number): number {
  return Math.max(Math.round(baselineKm * 1.15), 16);
}

/**
 * Peak weekly volume. A faster goal needs more aerobic volume, but the athlete
 * can only be built up so fast — roughly 5.5% a week is the ceiling that keeps
 * injury risk down — so the peak is whichever of the two is lower.
 */
export function peakVolume(goalSeconds: number, baselineKm: number, buildWeeks = 30): number {
  const goalHours = goalSeconds / 3600;
  const byGoal = goalHours <= 3 ? 85 : goalHours <= 3.5 ? 62 : goalHours <= 4 ? 52 : 45;
  const byRamp = startVolume(baselineKm) * Math.pow(1.055, Math.max(1, buildWeeks - 1));
  return Math.round(Math.max(Math.min(byGoal, byRamp), startVolume(baselineKm) * 1.5));
}

/**
 * Weekly planned volume: a gentle progression from the athlete's real base to
 * peak, with a down week every 4th week and a three-week taper.
 */
export function weekVolume(
  week: number,
  totalWeeks: number,
  input: PlanInput,
  { withDownWeek = true } = {},
): number {
  const start = startVolume(input.baselineKm);
  const peakWeek = totalWeeks - 3;
  const peak = peakVolume(input.goalSeconds, input.baselineKm, peakWeek);
  if (week > peakWeek) {
    const taperFactor = [0.75, 0.55, 0.4][week - peakWeek - 1] ?? 0.4;
    return Math.round(peak * taperFactor);
  }
  const t = peakWeek <= 1 ? 1 : (week - 1) / (peakWeek - 1);
  // Slightly concave ramp — most of the build happens in the middle third.
  const eased = Math.pow(t, 0.85);
  let km = start + (peak - start) * eased;
  if (withDownWeek && week % 4 === 0 && week < peakWeek) km *= 0.8; // recovery week
  return Math.round(km);
}

/**
 * The long run's share of the week, which climbs through the block. Early on
 * the week is spread evenly to build the habit; by the peak the long run is
 * half of it, which is what gets a 32 km dress rehearsal out of a ~57 km week
 * without inflating every other day.
 */
const LONG_SHARE: Record<Phase, number> = {
  Prep: 0.36,
  Base: 0.34,
  Build: 0.38,
  Strength: 0.42,
  Sharpen: 0.46,
  Peak: 0.54,
  Taper: 0.3,
};

/** Nobody needs to run further than this in training for a marathon. */
export const MAX_LONG_RUN_KM = 32;

/* ---------- weekly structure ---------- */

interface DaySlot {
  type: SessionType;
  weight: number; // share of weekly volume
}

function runsPerWeekFor(phase: Phase, week: number, baselineRuns: number): number {
  // Prep exists to establish a four-run week — that is the habit the whole
  // block rests on — so it starts there even if the athlete runs less today.
  if (phase === "Prep") return Math.max(4, Math.min(baselineRuns, 5));
  if (phase === "Base" || phase === "Taper") return 4;
  return 5;
}

/**
 * Day slots for a week. Monday always rests; Saturday is always the long run.
 * Quality lands midweek so there are two easy days on either side of it.
 */
function weekSlots(phase: Phase, runs: number): DaySlot[] {
  const rest: DaySlot = { type: "rest", weight: 0 };
  const slots: DaySlot[] = [rest, rest, rest, rest, rest, rest, rest];
  const longWeight = LONG_SHARE[phase];
  slots[5] = { type: "long", weight: longWeight };
  const quality: SessionType =
    phase === "Prep" || phase === "Base" ? "hard" : phase === "Build" ? "tempo" : "hard";
  slots[2] = { type: quality, weight: 0.22 };
  const remaining = 1 - longWeight - 0.22;
  if (runs >= 3) slots[1] = { type: "easy", weight: remaining * (runs >= 4 ? 0.45 : 1) };
  if (runs >= 4) slots[6] = { type: "recovery", weight: remaining * 0.25 };
  if (runs >= 5) slots[4] = { type: "easy", weight: remaining * 0.3 };
  // Normalise so the week's slices sum to exactly the planned volume.
  const total = slots.reduce((a, s) => a + s.weight, 0);
  return slots.map((s) => (s.weight ? { ...s, weight: s.weight / total } : s));
}

/* ---------- copy ---------- */

export function goalPaceSecPerKm(goalSeconds: number): number {
  return goalSeconds / 42.195;
}

/** Threshold pace ≈ marathon goal pace minus ~20 s/km for a well-trained runner. */
export function thresholdPaceFromGoal(goalSeconds: number): number {
  return goalPaceSecPerKm(goalSeconds) - 20;
}

/** Warm-up plus cool-down on a quality day, in km. */
export const WARMUP_COOLDOWN_KM = 2.5;

/** How many 1 km reps fit in a session of this size, once warm-up and cool-down are paid for. */
export function repsForKm(km: number): number {
  return Math.max(3, Math.min(8, Math.round((km - WARMUP_COOLDOWN_KM) / 1.2)));
}

/** Session distance implied by a rep count — the inverse, so the two always agree. */
export function kmForReps(reps: number): number {
  return Math.round((WARMUP_COOLDOWN_KM + reps * 1.2) * 2) / 2;
}

function describe(
  type: SessionType,
  km: number,
  week: number,
  phase: Phase,
  input: PlanInput,
): { title: string; sub: string; zone: string } {
  const easyPace = paceString(thresholdPaceFromGoal(input.goalSeconds) * 1.25);
  switch (type) {
    case "rest":
      return { title: "Rest", sub: "Full rest or 20 min mobility.", zone: "—" };
    case "easy":
      return {
        title: "Easy run",
        sub: `Conversational — ${easyPace}/km or slower.`,
        zone: "Z2",
      };
    case "recovery":
      return { title: "Recovery run", sub: "Very easy shakeout.", zone: "Z1" };
    case "long":
      return {
        title: "Long run",
        sub:
          input.longestRecentKm > 0 && km > input.longestRecentKm
            ? "Longer than anything you've run recently. Relaxed and steady — fuel after 60 min."
            : "Relaxed and steady. Fuel after 60 min.",
        zone: "Z2",
      };
    case "tempo":
      return {
        title: "Tempo run",
        sub: `${Math.max(3, Math.round(km * 0.5))} km continuous at threshold effort, easy either side.`,
        zone: "Z4",
      };
    case "hard": {
      const reps = repsForKm(km);
      return {
        title: "Intervals",
        sub: `${reps} × 1 km at 5K effort, 2 min jog recovery.`,
        zone: "Z4",
      };
    }
    case "race":
      return { title: "Race day", sub: "Everything you built, on the day.", zone: "Z3" };
  }
}

/* ---------- generator ---------- */

export function generatePlan(input: PlanInput): GeneratedDay[] {
  const raceMonday = mondayOf(input.raceDate);
  const totalWeeks = Math.max(4, weeksBetween(input.planStart, raceMonday) + 1);
  const days: GeneratedDay[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = phaseFor(week, totalWeeks);
    const volume = weekVolume(week, totalWeeks, input);
    const runs = runsPerWeekFor(phase, week, input.baselineRunsPerWeek);
    const slots = weekSlots(phase, runs);
    const weekStart = addDays(input.planStart, (week - 1) * 7);

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const date = addDays(weekStart, dayIdx);
      if (date > input.raceDate) continue;
      const isRaceDay = date === input.raceDate;
      const slot = slots[dayIdx];
      const raw = slot.weight ? Math.round(volume * slot.weight * 2) / 2 : 0;
      const type: SessionType = isRaceDay ? "race" : slot.type;
      let km = raw;
      if (km > 0) {
        // A run worth lacing up for — no 1.5 km "sessions" in the early weeks.
        km = Math.max(km, type === "long" ? 5 : type === "recovery" ? 3 : 3.5);
        // Someone who has already run 14 km does not start with a 6 km long run:
        // hold the long run near the endurance they already have.
        if (type === "long" && input.longestRecentKm > 0) {
          km = Math.round(Math.max(km, Math.min(input.longestRecentKm * 0.65, volume * 0.5)) * 2) / 2;
        }
        // The long run is the one session with an absolute ceiling: past ~32 km
        // the cost in recovery outweighs anything it adds on race day.
        if (type === "long") km = Math.min(km, MAX_LONG_RUN_KM);
        // Interval sessions carry a whole number of reps, so the session
        // distance is whatever those reps plus warm-up and cool-down come to.
        if (type === "hard") km = kmForReps(repsForKm(km));
      }
      if (isRaceDay) km = 42.2;
      const copy = describe(type, km, week, phase, input);
      days.push({
        date,
        week,
        dayIdx,
        phase,
        type,
        title: copy.title,
        sub: copy.sub,
        km,
        zone: copy.zone,
      });
    }
  }
  return days;
}

/** Block-overview rows for the Plan screen. */
export function blockOverview(input: PlanInput) {
  const raceMonday = mondayOf(input.raceDate);
  const totalWeeks = Math.max(4, weeksBetween(input.planStart, raceMonday) + 1);
  const focus: Record<Phase, string> = {
    Prep: "Make running a 4-day habit. Gentle weekly bumps from your real base",
    Base: "Aerobic volume, one quality session a week",
    Build: "Threshold work, long runs stretch out",
    Strength: "Marathon-pace blocks, hills, tune-up half",
    Sharpen: "Race-specific sessions, longest quality weeks",
    Peak: "Biggest weeks, dress-rehearsal long run",
    Taper: "Volume drops, sharpness stays. Race day at the end.",
  };
  return phaseRanges(totalWeeks).map((r) => ({
    n: r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`,
    phase: r.phase,
    phaseColor: PHASE_COLORS[r.phase],
    focus: focus[r.phase],
    km: `${weekVolume(r.from, totalWeeks, input, { withDownWeek: false })} → ${weekVolume(
      r.to,
      totalWeeks,
      input,
      { withDownWeek: false },
    )}`,
  }));
}
