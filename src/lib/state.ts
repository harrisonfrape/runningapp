import { getDb } from "./db";
import { getProfile, PlanDayRow, weekAdherence, zonesFor } from "./adapt";
import {
  assessReadiness,
  assessRecovery,
  avgCadence,
  avgEasyHr,
  fourWeekAverage,
  formatDuration,
  formatPace,
  km,
  longestRun,
  recentActivities,
  recoveryRows,
  relativeDate,
  thresholdPace,
  today as todayIso,
  trainingLoad,
  weeklyVolumes,
} from "./metrics";
import {
  addDays,
  blockOverview,
  daysBetween,
  mondayOf,
  paceString,
  peakVolume,
  phaseFor,
  weeksBetween,
  typeColor,
} from "./plan";
import { anthropicConfigured } from "./coach";
import { stravaConfig } from "./strava";
import { garminConfig } from "./garmin";
import type { Zone } from "./types";

export interface AppState {
  user: { name: string; email: string };
  today: string;
  onboarded: boolean;
  connections: {
    strava: { connected: boolean; configured: boolean; lastSync: string | null };
    garmin: { connected: boolean; configured: boolean; lastSync: string | null };
    coach: { configured: boolean };
    allowSkipConnect: boolean;
  };
  profile: {
    raceName: string;
    raceDate: string;
    raceDateLabel: string;
    goalTime: string;
    goalPace: string;
    weeksToRace: number;
    daysToRace: number;
    lthr: number | null;
    maxHr: number | null;
    estimatedZones: boolean;
  };
  zones: Zone[];
  plan: {
    totalWeeks: number;
    currentWeek: number;
    weeks: Array<{
      week: number;
      phase: string;
      days: PlanDayView[];
    }>;
    block: ReturnType<typeof blockOverview>;
    summary: string;
  };
  banner: { id: number; summary: string } | null;
  progress: {
    stats: Array<{ label: string; value: string; trend: string; trendColor: string }>;
    volumeBars: Array<{ km: number; label: string; current: boolean }>;
    recentRuns: Array<{
      id: number;
      date: string;
      name: string;
      km: string;
      pace: string;
      hr: string;
      fromStrava: boolean;
    }>;
  };
  recovery: {
    hasData: boolean;
    score: number | null;
    status: string;
    statusColor: string;
    summary: string;
    metrics: Array<{ label: string; value: string; note: string; noteColor: string }>;
    sleepBars: Array<{ label: string; hours: string; score: number | null }>;
    adjusted: { date: string; text: string } | null;
  };
  race: {
    projectedFinish: string;
    readinessPct: number;
    daysToRace: number;
    factors: Array<{ label: string; value: string }>;
    note: string;
    milestones: Array<{ when: string; title: string; desc: string }>;
  };
  log: Array<{
    id: number;
    date: string;
    name: string;
    km: string;
    pace: string;
    hr: string;
    logged: boolean;
  }>;
  chat: Array<{ id: number; role: "user" | "coach"; text: string }>;
}

export interface PlanDayView {
  id: number;
  date: string;
  day: string;
  dayIdx: number;
  week: number;
  title: string;
  sub: string;
  load: string;
  type: string;
  color: string;
  adapted: boolean;
  adaptReason: string | null;
  done: boolean;
  isToday: boolean;
  isPast: boolean;
}

const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export async function buildState(userId: number, user: { name: string; email: string }): Promise<AppState> {
  const d = getDb();
  const t = todayIso();
  const profile = await getProfile(userId);
  const zones = await zonesFor(userId, profile);
  const four = await fourWeekAverage(userId, t);

  const tokens = await d
    .prepare("SELECT provider FROM oauth_tokens WHERE user_id = ?")
    .all(userId) as Array<{ provider: string }>;
  const connected = new Set(tokens.map((x) => x.provider));
  const syncRows = await d
    .prepare("SELECT provider, last_sync FROM sync_state WHERE user_id = ?")
    .all(userId) as Array<{ provider: string; last_sync: string | null }>;
  const lastSync = Object.fromEntries(syncRows.map((r) => [r.provider, r.last_sync]));

  const planDays = await d
    .prepare("SELECT * FROM plan_days WHERE user_id = ? ORDER BY date")
    .all(userId) as PlanDayRow[];

  const weeksMap = new Map<number, PlanDayView[]>();
  for (const day of planDays) {
    const view: PlanDayView = {
      id: day.id,
      date: day.date,
      day: DAY_SHORT[day.day_idx],
      dayIdx: day.day_idx,
      week: day.week,
      title: day.title,
      sub: day.sub,
      load: day.km ? `${day.km} km · ${day.zone}` : "—",
      type: day.type,
      color: typeColor(day.type),
      adapted: day.adapted === 1,
      adaptReason: day.adapt_reason,
      done: day.completed_activity_id !== null,
      isToday: day.date === t,
      isPast: day.date < t,
    };
    const list = weeksMap.get(day.week) ?? [];
    list.push(view);
    weeksMap.set(day.week, list);
  }

  const totalWeeks = planDays.length ? planDays[planDays.length - 1].week : 0;
  const currentWeek =
    planDays.find((x) => x.date === t)?.week ??
    planDays.find((x) => x.date >= t)?.week ??
    Math.max(1, totalWeeks);

  const planInput = {
    planStart: profile.plan_start ?? mondayOf(t),
    raceDate: profile.race_date,
    baselineKm: four.km || 10,
    baselineRunsPerWeek: Math.max(1, Math.round(four.runs)),
    goalSeconds: profile.goal_seconds,
    longestRecentKm: await (async () => {
      const l = await longestRun(userId, t);
      return l ? km(l) : 0;
    })(),
  };

  const banner = await d
    .prepare(
      "SELECT id, summary FROM adaptations WHERE user_id = ? AND dismissed = 0 ORDER BY id DESC LIMIT 1",
    )
    .get(userId) as { id: number; summary: string } | undefined;

  /* ---- progress ---- */
  const vols = await weeklyVolumes(userId, 9, t);
  const easyHr = await avgEasyHr(userId, t);
  const cadence = await avgCadence(userId, t);
  const tp = await thresholdPace(userId, t, profile.goal_seconds);
  const adherence = await weekAdherence(userId, addDays(mondayOf(t), -7));
  const rec = await assessRecovery(userId, t);
  const peak = peakVolume(profile.goal_seconds, four.km || 10);
  const readiness = await assessReadiness(userId, t, profile);
  const longest = await longestRun(userId, t);

  const stats = [
    {
      label: "Weekly volume (4-wk avg)",
      value: `${four.km} km`,
      trend: four.km < peak * 0.6 ? "The limiter — keep building" : "Tracking to plan",
      trendColor: four.km < peak * 0.6 ? "#E3B34C" : "#7FB89A",
    },
    {
      label: "Runs per week",
      value: `${four.runs}`,
      trend: four.runs >= 4 ? "Habit is holding" : "Target: 4 a week",
      trendColor: four.runs >= 4 ? "#7FB89A" : "#E3B34C",
    },
    {
      label: "Avg easy-run HR",
      value: easyHr ? `${easyHr} bpm` : "No HR data",
      trend: easyHr
        ? easyHr <= zones[1].highHr
          ? "Inside Zone 2 — right where it should be"
          : "Drifting above Zone 2"
        : "Watch isn't sending HR — fix the link",
      trendColor: easyHr ? (easyHr <= zones[1].highHr ? "#7FB89A" : "#E3B34C") : "#E3B34C",
    },
    {
      label: "Threshold pace",
      value: `${paceString(tp)} /km`,
      trend: `Goal pace ${paceString(profile.goal_seconds / 42.195)} /km`,
      trendColor: "#8A968D",
    },
    {
      label: "Plan adherence",
      value: adherence === null ? "—" : `${Math.round(adherence * 100)}%`,
      trend: adherence === null ? "Last week had no plan yet" : "Of last week's planned volume",
      trendColor: adherence !== null && adherence >= 0.85 ? "#7FB89A" : "#E3B34C",
    },
    {
      label: "Resting HR",
      value: rec.restingHr ? `${rec.restingHr} bpm` : "—",
      trend: rec.restingHr ? "From Garmin overnight" : "Connect Garmin for this",
      trendColor: "#8A968D",
    },
    {
      label: "VO2 max",
      value: profile.vo2max ? `${profile.vo2max}` : "—",
      trend: profile.vo2max ? "Garmin estimate" : "Connect Garmin for this",
      trendColor: "#8A968D",
    },
    {
      label: "7-day training load",
      value: `${await trainingLoad(userId, t)}`,
      trend: cadence ? `Cadence ${cadence} spm` : "Cadence not recorded",
      trendColor: "#8A968D",
    },
  ];

  const runs = await recentActivities(userId, 12);
  const surveyed = new Set(
    (await d.prepare("SELECT activity_id FROM surveys WHERE user_id = ?").all(userId) as Array<{
      activity_id: number;
    }>).map((r) => r.activity_id),
  );

  const recentRuns = runs.slice(0, 6).map((a) => ({
    id: a.id,
    date: relativeDate(a.start_date, t),
    name: a.name,
    km: km(a).toFixed(1),
    pace: formatPace(a),
    hr: a.average_hr ? `${Math.round(a.average_hr)} bpm avg` : "no HR",
    fromStrava: a.provider === "strava",
  }));

  /* ---- recovery ---- */
  const nights = await recoveryRows(userId, 7, t);
  const tomorrow = await d
    .prepare("SELECT * FROM plan_days WHERE user_id = ? AND date = ?")
    .get(userId, addDays(t, 1)) as PlanDayRow | undefined;

  const recovery: AppState["recovery"] = {
    hasData: rec.hasData,
    score: rec.score,
    status: rec.status,
    statusColor: rec.poor ? "#E3B34C" : rec.hasData ? "#7FB89A" : "#8A968D",
    summary: rec.summary,
    metrics: [
      {
        label: "Sleep",
        value: rec.sleepHours
          ? `${Math.floor(rec.sleepHours)}h ${String(Math.round((rec.sleepHours % 1) * 60)).padStart(2, "0")}m`
          : "—",
        note: rec.sleepHours ? (rec.sleepHours < 6.5 ? "Below your average" : "On your average") : "No data",
        noteColor: rec.sleepHours && rec.sleepHours < 6.5 ? "#E3B34C" : "#7FB89A",
      },
      {
        label: "Sleep score (Garmin)",
        value: rec.sleepScore !== null ? `${rec.sleepScore}` : "—",
        note:
          rec.sleepScore === null
            ? "No data"
            : rec.sleepScore >= 80
              ? "Good — solid deep sleep"
              : "Fair — restless night",
        noteColor: rec.sleepScore !== null && rec.sleepScore >= 80 ? "#7FB89A" : "#E3B34C",
      },
      {
        label: "HRV overnight",
        value: rec.hrvDelta !== null || rec.score !== null ? await hrvValue(userId, t) : "—",
        note:
          rec.hrvDelta === null
            ? "Baseline still building"
            : `${rec.hrvDelta >= 0 ? "+" : ""}${rec.hrvDelta} ms vs baseline`,
        noteColor: rec.hrvDelta !== null && rec.hrvDelta <= -10 ? "#C24A3D" : "#8A968D",
      },
      {
        label: "Body battery",
        value: rec.bodyBattery !== null ? `${rec.bodyBattery}` : "—",
        note: rec.bodyBattery !== null ? `Charged to ${rec.bodyBattery} of 100` : "No data",
        noteColor: rec.bodyBattery !== null && rec.bodyBattery >= 75 ? "#7FB89A" : "#E3B34C",
      },
    ],
    sleepBars: lastSevenNights(nights, t),
    adjusted:
      tomorrow && tomorrow.adapted === 1 && (tomorrow.adapt_reason ?? "").includes("softened")
        ? {
            date: tomorrow.date,
            text: `${tomorrow.sub} This is the cheap insurance that keeps you off the physio's table.`,
          }
        : null,
  };

  /* ---- milestones ---- */
  const milestones = buildMilestones(profile.race_date, planInput.planStart, totalWeeks);

  return {
    user,
    today: t,
    onboarded: profile.onboarded === 1,
    connections: {
      strava: {
        connected: connected.has("strava"),
        configured: stravaConfig() !== null,
        lastSync: lastSync["strava"] ?? null,
      },
      garmin: {
        connected: connected.has("garmin"),
        configured: garminConfig() !== null,
        lastSync: lastSync["garmin"] ?? null,
      },
      coach: { configured: anthropicConfigured() },
      allowSkipConnect: process.env.ALLOW_SKIP_CONNECT === "true",
    },
    profile: {
      raceName: profile.race_name,
      raceDate: profile.race_date,
      raceDateLabel: new Date(`${profile.race_date}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      goalTime: formatDuration(profile.goal_seconds),
      goalPace: `${paceString(profile.goal_seconds / 42.195)} /km`,
      weeksToRace: Math.max(0, weeksBetween(t, profile.race_date)),
      daysToRace: Math.max(0, daysBetween(t, profile.race_date)),
      lthr: profile.lthr,
      maxHr: profile.max_hr,
      estimatedZones: profile.lthr === null,
    },
    zones,
    plan: {
      totalWeeks,
      currentWeek,
      weeks: Array.from(weeksMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([week, days]) => ({
          week,
          phase: totalWeeks ? phaseFor(week, totalWeeks) : "Prep",
          days,
        })),
      block: totalWeeks ? blockOverview(planInput) : [],
      summary: planSummary(four, peak, profile.race_name),
    },
    banner: banner ?? null,
    progress: {
      stats,
      volumeBars: vols.map((v, i) => ({
        km: v.km,
        label: i === vols.length - 1 ? "Now" : `W-${vols.length - 1 - i}`,
        current: i === vols.length - 1,
      })),
      recentRuns,
    },
    recovery,
    race: {
      projectedFinish: readiness.projectedFinish,
      readinessPct: readiness.readinessPct,
      daysToRace: readiness.daysToRace,
      factors: readiness.factors,
      note: readiness.note,
      milestones,
    },
    log: runs.map((a) => ({
      id: a.id,
      date: relativeDate(a.start_date, t),
      name: a.name,
      km: km(a).toFixed(1),
      pace: formatPace(a),
      hr: a.average_hr ? `${Math.round(a.average_hr)} bpm` : "no HR",
      logged: surveyed.has(a.id),
    })),
    chat: await getDb()
      .prepare("SELECT id, role, text FROM chat_messages WHERE user_id = ? ORDER BY id")
      .all(userId) as Array<{ id: number; role: "user" | "coach"; text: string }>,
  };
}

async function hrvValue(userId: number, t: string): Promise<string> {
  const row = await getDb()
    .prepare(
      "SELECT hrv_ms FROM recovery WHERE user_id = ? AND hrv_ms IS NOT NULL AND date <= ? ORDER BY date DESC LIMIT 1",
    )
    .get(userId, t) as { hrv_ms: number } | undefined;
  return row ? `${Math.round(row.hrv_ms)} ms` : "—";
}

function lastSevenNights(rows: Array<{ date: string; sleep_seconds: number | null; sleep_score: number | null }>, t: string) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: Array<{ label: string; hours: string; score: number | null }> = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(t, -i);
    const row = byDate.get(date);
    const label =
      i === 0
        ? "Last night"
        : new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
            weekday: "short",
            timeZone: "UTC",
          });
    out.push({
      label,
      hours: row?.sleep_seconds ? (row.sleep_seconds / 3600).toFixed(1) : "—",
      score: row?.sleep_score ?? null,
    });
  }
  return out;
}

function planSummary(
  four: { km: number; runs: number },
  peak: number,
  raceName: string,
): string {
  if (!four.km) {
    return `Built for ${raceName}. Sync Strava and the plan rebuilds around what you actually run — volume climbs gently to keep injury risk down, and every session ahead reshapes after each run you post.`;
  }
  return `Built from your Strava history — you average ~${four.km} km a week across ${four.runs} runs, so the early weeks are about making that a habit before the volume climbs toward ${peak} km. The plan rebuilds after every synced run.`;
}

function buildMilestones(raceDate: string, planStart: string, totalWeeks: number) {
  if (!totalWeeks) return [];
  const at = (weekFrac: number) => {
    const week = Math.max(1, Math.round(totalWeeks * weekFrac));
    const date = addDays(planStart, (week - 1) * 7 + 5);
    const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    return { when: `${label} · Week ${week}`, week };
  };
  const a = at(0.28);
  const b = at(0.66);
  const c = at(0.89);
  return [
    {
      when: a.when,
      title: "10K time trial",
      desc: "A hard 10K to recalibrate zones and check the projection against real racing.",
    },
    {
      when: b.when,
      title: "Tune-up half marathon",
      desc: "Raced at marathon effort + 10 s/km — the sharpest read on whether the goal is on.",
    },
    {
      when: c.when,
      title: "32 km dress rehearsal",
      desc: "Longest run of the block, final 10 km at goal pace, full race-day fuelling.",
    },
  ];
}

export { addDays, mondayOf };
