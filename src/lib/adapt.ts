import { getDb } from "./db";
import { addDays, kmForReps, mondayOf } from "./plan";
import {
  ActivityRow,
  activitiesSince,
  assessRecovery,
  avgEasyHr,
  formatPace,
  km,
  thresholdPace,
  today as todayIso,
} from "./metrics";
import { buildZones, estimateLthrFromMax } from "./zones";
import {
  segmentsFor as viewSegments,
  sessionTargets as viewTargets,
  type SessionContext,
  type ViewDay,
} from "./session-view";
import type { SessionType } from "./types";

export interface PlanDayRow {
  id: number;
  date: string;
  week: number;
  day_idx: number;
  phase: string;
  type: SessionType;
  title: string;
  sub: string;
  km: number;
  zone: string;
  adapted: number;
  adapt_reason: string | null;
  hr_cap: number | null;
  completed_activity_id: number | null;
}

export interface ProfileRow {
  user_id: number;
  race_name: string;
  race_date: string;
  goal_seconds: number;
  lthr: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  vo2max: number | null;
  plan_start: string | null;
  onboarded: number;
}

export function getProfile(userId: number): ProfileRow {
  const row = getDb().prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as
    | ProfileRow
    | undefined;
  if (!row) throw new Error("No athlete profile");
  return row;
}

export function zonesFor(userId: number, profile?: ProfileRow) {
  const p = profile ?? getProfile(userId);
  const lthr = p.lthr ?? 168;
  const maxHr = p.max_hr ?? 192;
  const tp = thresholdPace(userId, todayIso(), p.goal_seconds);
  return buildZones(lthr, maxHr, tp);
}

function upcoming(userId: number, fromIso: string): PlanDayRow[] {
  return getDb()
    .prepare("SELECT * FROM plan_days WHERE user_id = ? AND date >= ? ORDER BY date ASC")
    .all(userId, fromIso) as PlanDayRow[];
}

function applyChange(
  day: PlanDayRow,
  patch: Partial<Pick<PlanDayRow, "title" | "sub" | "km" | "zone" | "type" | "hr_cap">>,
  reason: string,
) {
  const d = getDb();
  d.prepare(
    `UPDATE plan_days SET title = ?, sub = ?, km = ?, zone = ?, type = ?, hr_cap = ?,
       adapted = 1, adapt_reason = ? WHERE id = ?`,
  ).run(
    patch.title ?? day.title,
    patch.sub ?? day.sub,
    patch.km ?? day.km,
    patch.zone ?? day.zone,
    patch.type ?? day.type,
    patch.hr_cap ?? day.hr_cap,
    reason,
    day.id,
  );
}

/** Link finished runs to the day they were planned for. */
export function matchActivitiesToPlan(userId: number) {
  const d = getDb();
  const rows = activitiesSince(userId, addDays(todayIso(), -60));
  for (const a of rows) {
    const date = a.start_date.slice(0, 10);
    d.prepare(
      `UPDATE plan_days SET completed_activity_id = ?
       WHERE user_id = ? AND date = ? AND type != 'rest' AND completed_activity_id IS NULL`,
    ).run(a.id, userId, date);
  }
}

export interface AdaptationChange {
  date: string;
  reason: string;
  before: string;
  after: string;
}

export interface AdaptationResult {
  changes: AdaptationChange[];
  summary: string;
  coachMessage: string | null;
}

/**
 * The adaptation engine. Compares what the athlete actually ran (and how they
 * slept and felt) against what was planned, then reshapes the sessions ahead.
 * Every change carries the reason that produced it, which is what the ADAPTED
 * badges and the coach's chat message are built from.
 */
export function runAdaptation(
  userId: number,
  trigger: "activity" | "recovery" | "survey",
): AdaptationResult {
  const d = getDb();
  const profile = getProfile(userId);
  const t = todayIso();
  matchActivitiesToPlan(userId);

  const zones = zonesFor(userId, profile);
  const z2 = zones[1];
  const days = upcoming(userId, t);
  const changes: AdaptationChange[] = [];
  const notes: Array<{ cause: "run" | "recovery" | "adherence"; text: string }> = [];
  // One session gets changed by at most one rule per pass — otherwise the
  // coach's explanation contradicts itself.
  const touched = new Set<string>();

  const nextOfType = (types: SessionType[], skipToday = false) =>
    days.find(
      (x) => types.includes(x.type) && !touched.has(x.date) && (!skipToday || x.date > t),
    );

  /* Rule 1 — poor overnight recovery softens tomorrow's session (strongest signal). */
  const rec = assessRecovery(userId, t);
  if (rec.hasData && rec.poor) {
    const tomorrow = days.find((x) => x.date === addDays(t, 1) && x.type !== "rest");
    if (tomorrow && !isAlreadyAdapted(tomorrow, "softened")) {
      touched.add(tomorrow.date);
      const cap = z2.highHr - 10;
      const detail =
        rec.hrvDelta !== null && rec.hrvDelta <= -10
          ? `HRV is ${Math.abs(rec.hrvDelta)} ms under baseline`
          : `sleep came up short at ${rec.sleepHours?.toFixed(1)} h`;
      if (tomorrow.type === "hard" || tomorrow.type === "tempo") {
        const newKm = Math.round(tomorrow.km * 0.7 * 2) / 2;
        applyChange(
          tomorrow,
          {
            title: "Easy run — session softened",
            sub: `Quality moved: ${detail}. Keep it conversational and capped at ${cap} bpm.`,
            km: newKm,
            type: "easy",
            zone: "Z2",
            hr_cap: cap,
          },
          `softened — ${detail}`,
        );
        notes.push({ cause: "recovery", text: `swapped ${dayLabel(tomorrow.date)}'s quality session for an easy run` });
      } else {
        const newKm = Math.round(tomorrow.km * 0.75 * 2) / 2;
        applyChange(
          tomorrow,
          {
            title: `${tomorrow.title} — softened`,
            sub: `${detail}, so this is trimmed to ${newKm} km and capped at ${cap} bpm.`,
            km: newKm,
            hr_cap: cap,
          },
          `softened — ${detail}`,
        );
        notes.push({ cause: "recovery", text: `trimmed ${dayLabel(tomorrow.date)} to ${newKm} km and capped it at ${cap} bpm` });
      }
      changes.push({
        date: tomorrow.date,
        reason: `softened — ${detail}`,
        before: `${tomorrow.title} ${tomorrow.km} km`,
        after: "softened session",
      });
    }
  }

  /* Rule 2 — the last easy run came in hot (heart rate or perceived effort). */
  const recent = activitiesSince(userId, addDays(t, -4)).filter((a) => km(a) >= 3);
  const last = recent[0];
  if (last) {
    const survey = d
      .prepare("SELECT feel, rpe, notes FROM surveys WHERE activity_id = ?")
      .get(last.id) as { feel: string; rpe: number; notes: string } | undefined;
    const plannedDay = d
      .prepare("SELECT * FROM plan_days WHERE user_id = ? AND date = ?")
      .get(userId, last.start_date.slice(0, 10)) as PlanDayRow | undefined;
    const wasEasyDay = plannedDay ? ["easy", "long", "recovery"].includes(plannedDay.type) : true;
    const ranHot = last.average_hr !== null && last.average_hr > z2.highHr + 5;
    const feltHard = survey ? survey.rpe >= 7 || survey.feel === "Rough" : false;

    if (wasEasyDay && (ranHot || feltHard)) {
      const evidence = ranHot
        ? `avg HR ${Math.round(last.average_hr!)} bpm on what should have been a Zone 2 day`
        : `RPE ${survey?.rpe}/10 on an easy day`;

      const hard = nextOfType(["hard", "tempo"]);
      if (hard && !isAlreadyAdapted(hard, "trimmed")) {
        touched.add(hard.date);
        const reps = Number((hard.sub.match(/^(\d+)\s*×/) || [])[1] ?? 0);
        if (reps > 2) {
          const newReps = reps - 1;
          const newKm = kmForReps(newReps);
          applyChange(
            hard,
            {
              title: `${hard.title} — trimmed`,
              sub: `${newReps} × 1 km at 5K effort. One rep dropped: ${evidence}.`,
              km: newKm,
            },
            `trimmed after ${evidence}`,
          );
          changes.push({
            date: hard.date,
            reason: `trimmed after ${evidence}`,
            before: `${reps} × 1 km`,
            after: `${newReps} × 1 km`,
          });
          notes.push({ cause: "run", text: `trimmed ${dayLabel(hard.date)}'s intervals to ${newReps} × 1 km` });
        } else {
          const newKm = Math.round(hard.km * 0.8 * 2) / 2;
          applyChange(
            hard,
            { title: `${hard.title} — shortened`, km: newKm, sub: `${hard.sub} Volume trimmed: ${evidence}.` },
            `shortened after ${evidence}`,
          );
          changes.push({
            date: hard.date,
            reason: `shortened after ${evidence}`,
            before: `${hard.km} km`,
            after: `${newKm} km`,
          });
          notes.push({ cause: "run", text: `shortened ${dayLabel(hard.date)}'s quality session` });
        }
      }

      const easy = nextOfType(["easy", "recovery"]);
      if (easy && !easy.hr_cap) {
        touched.add(easy.date);
        const cap = easy.type === "recovery" ? zones[0].highHr : z2.highHr;
        applyChange(
          easy,
          { sub: `${easy.sub} Cap at ${cap} bpm — keep it genuinely easy.`, hr_cap: cap },
          `HR-capped at ${cap} after ${evidence}`,
        );
        changes.push({
          date: easy.date,
          reason: `HR-capped at ${cap}`,
          before: easy.sub,
          after: `capped at ${cap} bpm`,
        });
        notes.push({ cause: "run", text: `capped ${dayLabel(easy.date)} at ${cap} bpm` });
      }
    }
  }

  /* Rule 3 — aerobic load absorbed well: pull the long-run progression forward. */
  if (absorbedWell(userId, t, z2.highHr, rec.poor)) {
    const long = nextOfType(["long"], true);
    if (long && !isAlreadyAdapted(long, "extended")) {
      touched.add(long.date);
      const newKm = Math.round(Math.min(long.km * 1.1, long.km + 2) * 2) / 2;
      if (newKm > long.km) {
        applyChange(
          long,
          {
            title: `${long.title} — extended`,
            sub: "Progression pulled forward: recent aerobic load was absorbed well. Steady and relaxed.",
            km: newKm,
          },
          "extended — aerobic load absorbed well",
        );
        changes.push({
          date: long.date,
          reason: "extended — aerobic load absorbed well",
          before: `${long.km} km`,
          after: `${newKm} km`,
        });
        notes.push({ cause: "run", text: `extended ${dayLabel(long.date)}'s long run to ${newKm} km` });
      }
    }
  }

  /* Rule 4 — last week's adherence was low: ease next week's volume back. */
  const adherence = weekAdherence(userId, addDays(mondayOf(t), -7));
  if (adherence !== null && adherence < 0.6) {
    const nextWeekStart = addDays(mondayOf(t), 7);
    const nextWeek = days.filter(
      (x) => x.date >= nextWeekStart && x.date < addDays(nextWeekStart, 7) && x.km > 0,
    );
    const alreadyEased = nextWeek.some((x) => (x.adapt_reason ?? "").includes("eased"));
    if (nextWeek.length && !alreadyEased) {
      for (const day of nextWeek) {
        const newKm = Math.round(day.km * 0.9 * 2) / 2;
        applyChange(
          day,
          { km: newKm },
          `eased — only ${Math.round(adherence * 100)}% of last week's planned volume was run`,
        );
      }
      changes.push({
        date: nextWeekStart,
        reason: "next week eased back",
        before: "planned volume",
        after: "−10%",
      });
      notes.push({
        cause: "adherence",
        text: `eased next week's volume by 10% — only ${Math.round(adherence * 100)}% of last week got run`,
      });
    }
  }

  if (!changes.length) {
    return { changes: [], summary: "", coachMessage: null };
  }

  const summary =
    changes.length === 1
      ? `One session adjusted — ${changes[0].reason}.`
      : `${changes.length} sessions adjusted — the coach explains why in chat.`;

  // Adaptation runs on every sync, every survey and every night, so the same
  // run can drive changes more than once. Announce a given run only the first
  // time it produces a change — after that the coach speaks about the change,
  // not about the upload.
  const announced =
    last !== undefined &&
    (d
      .prepare(
        "SELECT 1 FROM adaptations WHERE user_id = ? AND announced_activity_id = ? LIMIT 1",
      )
      .get(userId, last.id) as unknown) !== undefined;

  const coachMessage = buildCoachMessage(trigger, last, notes, rec, announced);

  d.prepare(
    "INSERT INTO adaptations (user_id, summary, detail, announced_activity_id) VALUES (?, ?, ?, ?)",
  ).run(
    userId,
    summary,
    JSON.stringify(changes),
    notes.some((n) => n.cause === "run") && last ? last.id : null,
  );
  if (coachMessage) {
    d.prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'coach', ?)").run(
      userId,
      coachMessage,
    );
  }
  return { changes, summary, coachMessage };
}

function isAlreadyAdapted(day: PlanDayRow, keyword: string): boolean {
  return day.adapted === 1 && (day.adapt_reason ?? "").includes(keyword);
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

function buildCoachMessage(
  trigger: "activity" | "recovery" | "survey",
  last: ActivityRow | undefined,
  notes: Array<{ cause: "run" | "recovery" | "adherence"; text: string }>,
  recovery: { hrvDelta: number | null; sleepHours: number | null },
  alreadyAnnounced = false,
): string {
  const join = (items: string[]) =>
    items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

  const parts: string[] = [];

  const runNotes = notes.filter((n) => n.cause === "run").map((n) => n.text);
  if (runNotes.length && last && !alreadyAnnounced) {
    const hr = last.average_hr
      ? `, and your heart rate averaged ${Math.round(last.average_hr)} bpm`
      : "";
    parts.push(
      `Just pulled in ${last.name} from Strava — ${km(last).toFixed(1)} km at ${formatPace(last)}${hr}. I've ${join(runNotes)}.`,
    );
  } else if (runNotes.length) {
    parts.push(`Your last run changed the picture, so I've ${join(runNotes)}.`);
  }

  const recNotes = notes.filter((n) => n.cause === "recovery").map((n) => n.text);
  if (recNotes.length) {
    const evidence =
      recovery.hrvDelta !== null && recovery.hrvDelta <= -10
        ? `HRV is ${Math.abs(recovery.hrvDelta)} ms under your baseline`
        : recovery.sleepHours !== null
          ? `you only got ${recovery.sleepHours.toFixed(1)} hours of sleep`
          : "recovery is down on your baseline";
    parts.push(
      `Garmin says ${evidence}, so I've ${join(recNotes)}. Nothing to worry about — this is the cheap insurance that keeps you off the physio's table.`,
    );
  }

  const adherenceNotes = notes.filter((n) => n.cause === "adherence").map((n) => n.text);
  if (adherenceNotes.length) parts.push(`I've also ${join(adherenceNotes)}.`);

  if (!parts.length) return "";
  if (trigger === "survey") {
    parts.unshift("Thanks for logging that one — your feedback is part of the picture now.");
  }
  return `${parts.join(" ")} The adjusted sessions are marked on your calendar.`;
}

/** Share of last week's planned kilometres that were actually run. */
export function weekAdherence(userId: number, weekStart: string): number | null {
  const d = getDb();
  const planned = d
    .prepare(
      "SELECT COALESCE(SUM(km), 0) AS km FROM plan_days WHERE user_id = ? AND date >= ? AND date < ?",
    )
    .get(userId, weekStart, addDays(weekStart, 7)) as { km: number };
  if (!planned.km) return null;
  const done = d
    .prepare(
      `SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km FROM activities
       WHERE user_id = ? AND date(start_date) >= ? AND date(start_date) < ?`,
    )
    .get(userId, weekStart, addDays(weekStart, 7)) as { km: number };
  return done.km / planned.km;
}

function absorbedWell(userId: number, t: string, z2High: number, recoveryPoor: boolean): boolean {
  if (recoveryPoor) return false;
  const lastWeek = weekAdherence(userId, addDays(mondayOf(t), -7));
  if (lastWeek === null || lastWeek < 0.9) return false;
  const easyHr = avgEasyHr(userId, t);
  if (easyHr !== null && easyHr > z2High) return false;
  return true;
}

/**
 * Recalibrate LTHR and max HR from real watch data. Called after each sync —
 * the zones screen is only as good as the numbers behind it.
 */
export function recalibrateZones(userId: number): boolean {
  const d = getDb();
  const profile = getProfile(userId);
  const row = d
    .prepare(
      `SELECT MAX(max_hr) AS max_hr FROM activities
       WHERE user_id = ? AND max_hr IS NOT NULL AND date(start_date) >= ?`,
    )
    .get(userId, addDays(todayIso(), -120)) as { max_hr: number | null };
  if (!row.max_hr) return false;

  const observedMax = Math.round(row.max_hr);
  const newMax = Math.max(observedMax, profile.max_hr ?? 0);
  const newLthr = estimateLthrFromMax(newMax);
  const changed =
    Math.abs((profile.max_hr ?? 0) - newMax) >= 2 || Math.abs((profile.lthr ?? 0) - newLthr) >= 2;
  if (!changed) return false;
  d.prepare("UPDATE profiles SET max_hr = ?, lthr = ? WHERE user_id = ?").run(
    newMax,
    newLthr,
    userId,
  );
  return true;
}

/* ---------- server-side wrappers over the pure session view ---------- */

/**
 * Bundles the three things every session description depends on — zones,
 * threshold pace and the goal — so a whole plan can be described without
 * re-querying per day. Also sent to the browser, which renders day detail
 * with the very same functions.
 */
export function sessionContext(userId: number, profile?: ProfileRow): SessionContext {
  const p = profile ?? getProfile(userId);
  return {
    zones: zonesFor(userId, p),
    thresholdPaceSecPerKm: thresholdPace(userId, todayIso(), p.goal_seconds),
    goalSeconds: p.goal_seconds,
  };
}

export function toViewDay(day: PlanDayRow): ViewDay {
  return {
    date: day.date,
    week: day.week,
    dayIdx: day.day_idx,
    phase: day.phase,
    type: day.type,
    title: day.title,
    sub: day.sub,
    km: day.km,
    zone: day.zone,
    adapted: day.adapted === 1,
    adaptReason: day.adapt_reason,
    hrCap: day.hr_cap,
    done: day.completed_activity_id !== null,
  };
}

export function sessionTargets(userId: number, day: PlanDayRow) {
  return viewTargets(sessionContext(userId), toViewDay(day));
}

export function segmentsFor(userId: number, day: PlanDayRow) {
  return viewSegments(sessionContext(userId), toViewDay(day));
}

export { coachNoteFor } from "./session-view";
