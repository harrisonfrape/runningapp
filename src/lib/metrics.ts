import { getDb } from "./db";
import { addDays, daysBetween, isoDate, mondayOf, paceString, peakVolume } from "./plan";
import { thresholdPaceFromGoal } from "./plan";

export interface ActivityRow {
  id: number;
  provider: string;
  external_id: string;
  name: string;
  start_date: string;
  distance_m: number;
  moving_time_s: number;
  average_hr: number | null;
  max_hr: number | null;
  average_cadence: number | null;
  zone_seconds_json: string | null;
  type: string;
}

export async function activitiesSince(userId: number, sinceIso: string): Promise<ActivityRow[]> {
  return await getDb()
    .prepare(
      `SELECT id, provider, external_id, name, start_date, distance_m, moving_time_s,
              average_hr, max_hr, average_cadence, zone_seconds_json, type
       FROM activities WHERE user_id = ? AND date(start_date) >= ? ORDER BY start_date DESC`,
    )
    .all(userId, sinceIso) as ActivityRow[];
}

export async function recentActivities(userId: number, limit = 20): Promise<ActivityRow[]> {
  return await getDb()
    .prepare(
      `SELECT id, provider, external_id, name, start_date, distance_m, moving_time_s,
              average_hr, max_hr, average_cadence, zone_seconds_json, type
       FROM activities WHERE user_id = ? ORDER BY start_date DESC LIMIT ?`,
    )
    .all(userId, limit) as ActivityRow[];
}

export function paceSecPerKm(a: ActivityRow): number | null {
  if (!a.distance_m) return null;
  return a.moving_time_s / (a.distance_m / 1000);
}

export function formatPace(a: ActivityRow): string {
  const p = paceSecPerKm(a);
  return p ? `${paceString(p)} /km` : "—";
}

export function km(a: ActivityRow): number {
  return a.distance_m / 1000;
}

/** Weekly kilometres for the last `weeks` calendar weeks, oldest first. */
export async function weeklyVolumes(userId: number, weeks: number, todayIso: string) {
  const thisMonday = mondayOf(todayIso);
  const out: Array<{ weekStart: string; km: number; runs: number }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    const end = addDays(start, 7);
    const row = await getDb()
      .prepare(
        `SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km, COUNT(*) AS runs
         FROM activities WHERE user_id = ? AND date(start_date) >= ? AND date(start_date) < ?`,
      )
      .get(userId, start, end) as { km: number; runs: number };
    out.push({ weekStart: start, km: Math.round(row.km * 10) / 10, runs: row.runs });
  }
  return out;
}

export async function fourWeekAverage(userId: number, todayIso: string): Promise<{ km: number; runs: number }> {
  const weeks = (await weeklyVolumes(userId, 5, todayIso)).slice(0, 4); // completed weeks only
  if (!weeks.length) return { km: 0, runs: 0 };
  const km = weeks.reduce((a, w) => a + w.km, 0) / weeks.length;
  const runs = weeks.reduce((a, w) => a + w.runs, 0) / weeks.length;
  return { km: Math.round(km * 10) / 10, runs: Math.round(runs * 10) / 10 };
}

/** Average HR on easy-paced runs over the window — the aerobic-drift signal. */
export async function avgEasyHr(userId: number, todayIso: string, days = 28): Promise<number | null> {
  const rows = (await activitiesSince(userId, addDays(todayIso, -days))).filter(
    (a) => a.average_hr && km(a) >= 3,
  );
  if (!rows.length) return null;
  const easy = rows.filter((a) => {
    const p = paceSecPerKm(a);
    return p !== null && p > 330; // slower than 5:30/km — an easy-effort proxy
  });
  const pool = easy.length ? easy : rows;
  return Math.round(pool.reduce((a, r) => a + (r.average_hr ?? 0), 0) / pool.length);
}

export async function avgCadence(userId: number, todayIso: string, days = 28): Promise<number | null> {
  const rows = (await activitiesSince(userId, addDays(todayIso, -days))).filter((a) => a.average_cadence);
  if (!rows.length) return null;
  return Math.round(rows.reduce((a, r) => a + (r.average_cadence ?? 0), 0) / rows.length);
}

/** Training load: distance-weighted effort over the last 7 days (arbitrary but consistent units). */
export async function trainingLoad(userId: number, todayIso: string): Promise<number> {
  const rows = await activitiesSince(userId, addDays(todayIso, -7));
  return Math.round(
    rows.reduce((a, r) => {
      const p = paceSecPerKm(r);
      const intensity = p ? Math.max(0.6, Math.min(2.2, 360 / p)) : 1;
      return a + km(r) * intensity * 10;
    }, 0),
  );
}

/** Best recent performance, used as the Riegel anchor for the finish projection. */
export async function bestEffort(userId: number, todayIso: string, days = 120): Promise<ActivityRow | null> {
  const rows = (await activitiesSince(userId, addDays(todayIso, -days))).filter((a) => km(a) >= 5);
  if (!rows.length) return null;
  // Riegel-equivalent marathon time; the smallest wins.
  let best: ActivityRow | null = null;
  let bestProj = Infinity;
  for (const r of rows) {
    const proj = riegel(r.moving_time_s, km(r), 42.195);
    if (proj < bestProj) {
      bestProj = proj;
      best = r;
    }
  }
  return best;
}

export function riegel(timeS: number, fromKm: number, toKm: number): number {
  if (fromKm <= 0) return Infinity;
  return timeS * Math.pow(toKm / fromKm, 1.06);
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Threshold pace measured from the athlete's own best sustained effort. */
export async function thresholdPace(userId: number, todayIso: string, goalSeconds: number): Promise<number> {
  const best = await bestEffort(userId, todayIso);
  if (!best) return thresholdPaceFromGoal(goalSeconds);
  const distKm = km(best);
  const pace = best.moving_time_s / distKm;
  // Scale the effort's pace to a one-hour effort: shorter races are run faster.
  const factor = distKm < 10 ? 1.06 : distKm < 16 ? 1.03 : distKm < 25 ? 1.0 : 0.97;
  return pace * factor;
}

export async function longestRun(userId: number, todayIso: string, days = 120): Promise<ActivityRow | null> {
  const rows = await activitiesSince(userId, addDays(todayIso, -days));
  if (!rows.length) return null;
  return rows.reduce((a, b) => (a.distance_m > b.distance_m ? a : b));
}

/* ---------- recovery ---------- */

export interface RecoveryRow {
  date: string;
  sleep_seconds: number | null;
  sleep_score: number | null;
  hrv_ms: number | null;
  body_battery: number | null;
  resting_hr: number | null;
}

export async function recoveryRows(userId: number, days: number, todayIso: string): Promise<RecoveryRow[]> {
  return await getDb()
    .prepare(
      `SELECT date, sleep_seconds, sleep_score, hrv_ms, body_battery, resting_hr
       FROM recovery WHERE user_id = ? AND date >= ? ORDER BY date ASC`,
    )
    .all(userId, addDays(todayIso, -days)) as RecoveryRow[];
}

export async function hrvBaseline(userId: number, todayIso: string): Promise<number | null> {
  const row = await getDb()
    .prepare(
      `SELECT AVG(hrv_ms) AS avg FROM recovery
       WHERE user_id = ? AND hrv_ms IS NOT NULL AND date >= ? AND date < ?`,
    )
    .get(userId, addDays(todayIso, -30), todayIso) as { avg: number | null };
  return row.avg;
}

export interface RecoveryAssessment {
  hasData: boolean;
  date: string | null;
  score: number | null;
  status: string;
  summary: string;
  hrvDelta: number | null;
  sleepHours: number | null;
  sleepScore: number | null;
  bodyBattery: number | null;
  restingHr: number | null;
  poor: boolean;
}

/**
 * Recovery score out of 100: sleep duration, Garmin's own sleep score, overnight
 * HRV against the athlete's 30-day baseline, and body battery.
 */
export async function assessRecovery(userId: number, todayIso: string): Promise<RecoveryAssessment> {
  const rows = await recoveryRows(userId, 3, todayIso);
  const latest = rows.length ? rows[rows.length - 1] : null;
  if (!latest || (latest.sleep_seconds === null && latest.hrv_ms === null)) {
    return {
      hasData: false,
      date: latest?.date ?? null,
      score: null,
      status: "No Garmin data yet",
      summary:
        "Connect Garmin and wear the watch overnight — sleep, HRV and body battery drive the recovery score and the automatic session softening.",
      hrvDelta: null,
      sleepHours: null,
      sleepScore: null,
      bodyBattery: null,
      restingHr: null,
      poor: false,
    };
  }

  const baseline = await hrvBaseline(userId, todayIso);
  const hrvDelta = latest.hrv_ms !== null && baseline !== null ? latest.hrv_ms - baseline : null;
  const sleepHours = latest.sleep_seconds !== null ? latest.sleep_seconds / 3600 : null;

  const parts: Array<{ value: number; weight: number }> = [];
  if (sleepHours !== null) {
    parts.push({ value: clamp01((sleepHours - 4.5) / 3) * 100, weight: 0.3 });
  }
  if (latest.sleep_score !== null) parts.push({ value: latest.sleep_score, weight: 0.25 });
  if (hrvDelta !== null) parts.push({ value: clamp01((hrvDelta + 20) / 30) * 100, weight: 0.3 });
  if (latest.body_battery !== null) parts.push({ value: latest.body_battery, weight: 0.15 });

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0) || 1;
  const score = Math.round(parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight);

  const poor =
    (hrvDelta !== null && hrvDelta <= -10) ||
    (sleepHours !== null && sleepHours < 6.5) ||
    score < 65;

  return {
    hasData: true,
    date: latest.date,
    score,
    status: poor
      ? "Compromised — take it easy"
      : score >= 80
        ? "Good — ready to train"
        : "Fair — train, but keep easy days easy",
    summary: poor
      ? `${sleepHours !== null && sleepHours < 6.5 ? "Short sleep" : "Suppressed HRV"} against your baseline. Today is about absorbing training, not adding to it.`
      : "Sleep and HRV are both in your normal range. The body is absorbing the load well.",
    hrvDelta: hrvDelta === null ? null : Math.round(hrvDelta),
    sleepHours,
    sleepScore: latest.sleep_score,
    bodyBattery: latest.body_battery,
    restingHr: latest.resting_hr,
    poor,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/* ---------- race readiness ---------- */

export interface Readiness {
  projectedFinish: string;
  projectedSeconds: number | null;
  readinessPct: number;
  daysToRace: number;
  factors: Array<{ label: string; value: string }>;
  note: string;
}

export async function assessReadiness(
  userId: number,
  todayIso: string,
  profile: { race_date: string; goal_seconds: number },
): Promise<Readiness> {
  const best = await bestEffort(userId, todayIso);
  const four = await fourWeekAverage(userId, todayIso);
  const longest = await longestRun(userId, todayIso);
  const peak = peakVolume(profile.goal_seconds, four.km || 10);
  const daysToRace = Math.max(0, daysBetween(todayIso, profile.race_date));

  const projectedSeconds = best ? riegel(best.moving_time_s, km(best), 42.195) : null;

  // Readiness blends speed evidence, volume, long-run endurance and consistency.
  const speed =
    projectedSeconds === null ? 0 : clamp01(profile.goal_seconds / projectedSeconds) * 100;
  const volume = clamp01(four.km / peak) * 100;
  const endurance = clamp01((longest ? km(longest) : 0) / 32) * 100;
  const consistency = clamp01(four.runs / 4) * 100;
  const readinessPct = Math.round(
    speed * 0.25 + volume * 0.35 + endurance * 0.25 + consistency * 0.15,
  );

  const factors: Array<{ label: string; value: string }> = [];
  if (best) {
    factors.push({
      label: `${best.name}, ${formatShortDate(best.start_date)}`,
      value: `${km(best).toFixed(1)} km — ${formatDuration(best.moving_time_s)} (${formatPace(best)})`,
    });
    factors.push({
      label: "Riegel projection from that effort",
      value: `${formatDuration(projectedSeconds!)} marathon`,
    });
  } else {
    factors.push({ label: "Recent race effort", value: "No run long enough yet" });
  }
  factors.push({
    label: "4-week average volume",
    value: `${four.km} km/week${four.km < peak * 0.6 ? " — the limiter" : ""}`,
  });
  factors.push({
    label: "Longest recent run",
    value: longest ? `${km(longest).toFixed(1)} km (${formatShortDate(longest.start_date)})` : "—",
  });
  factors.push({
    label: "Goal pace vs threshold pace",
    value: `${paceString(profile.goal_seconds / 42.195)} vs ${paceString(
      await thresholdPace(userId, todayIso, profile.goal_seconds),
    )}`,
  });

  // "Speed is there" is a question about pace, not about the finish time: an
  // athlete whose race pace already beats goal pace is short of endurance, not
  // of speed, even when the projection lands a couple of minutes over target.
  const goalPace = profile.goal_seconds / 42.195;
  const speedIsThere =
    projectedSeconds !== null &&
    (projectedSeconds <= profile.goal_seconds * 1.05 ||
      await thresholdPace(userId, todayIso, profile.goal_seconds) < goalPace);
  const note = speedIsThere
    ? `Your speed already projects ${formatDuration(projectedSeconds!)} — the whole game is volume. Get to four runs a week and hold it, and this projection will firm up fast.`
    : "Speed and endurance both still have room. Volume first, then the sharper sessions do their work.";

  return {
    projectedFinish: projectedSeconds === null ? "—" : formatDuration(projectedSeconds),
    projectedSeconds,
    readinessPct: Math.max(0, Math.min(100, readinessPct)),
    daysToRace,
    factors,
    note,
  };
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function relativeDate(iso: string, todayIso: string): string {
  const day = iso.slice(0, 10);
  if (day === todayIso) return "Today";
  if (day === addDays(todayIso, -1)) return "Yesterday";
  return formatShortDate(iso);
}

export function today(): string {
  return isoDate(new Date());
}
