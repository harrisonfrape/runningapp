import { getDb } from "./db";
import { generatePlan, mondayOf, PlanInput } from "./plan";
import { fourWeekAverage, km, longestRun, today as todayIso } from "./metrics";
import { getProfile, matchActivitiesToPlan, recalibrateZones } from "./adapt";
import { estimateLthrFromMax } from "./zones";
import { appendMessage, welcomeMessage } from "./coach";

/** Inputs for the generator, measured from the athlete's real Strava history. */
export async function planInputFor(userId: number): Promise<PlanInput> {
  const t = todayIso();
  const profile = await getProfile(userId);
  const four = await fourWeekAverage(userId, t);
  const longest = await longestRun(userId, t);
  return {
    planStart: profile.plan_start ?? mondayOf(t),
    raceDate: profile.race_date,
    baselineKm: four.km || 10,
    baselineRunsPerWeek: Math.max(1, Math.round(four.runs) || 2),
    goalSeconds: profile.goal_seconds,
    longestRecentKm: longest ? km(longest) : 0,
  };
}

/**
 * (Re)builds the plan. Days already in the past keep whatever actually happened;
 * everything from today forward is regenerated from current fitness, then the
 * adaptation engine layers its changes back on top.
 */
export async function buildPlan(userId: number, { fresh = false } = {}): Promise<number> {
  const d = getDb();
  const t = todayIso();
  const profile = await getProfile(userId);
  if (!profile.plan_start) {
    await d.prepare("UPDATE profiles SET plan_start = ? WHERE user_id = ?").run(mondayOf(t), userId);
  }
  const input = await planInputFor(userId);
  const days = generatePlan(input);

  const INSERT = `INSERT INTO plan_days (user_id, date, week, day_idx, phase, type, title, sub, km, zone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       week = excluded.week, day_idx = excluded.day_idx, phase = excluded.phase,
       type = excluded.type, title = excluded.title, sub = excluded.sub,
       km = excluded.km, zone = excluded.zone, adapted = 0, adapt_reason = NULL, hr_cap = NULL`;

  // One atomic batch: the delete and every insert land together, so a failure
  // part-way through can never leave the athlete with half a plan.
  await d.batch([
    fresh
      ? { sql: "DELETE FROM plan_days WHERE user_id = ?", args: [userId] }
      : { sql: "DELETE FROM plan_days WHERE user_id = ? AND date >= ?", args: [userId, t] },
    ...days
      .filter((day) => fresh || day.date >= t)
      .map((day) => ({
        sql: INSERT,
        args: [
          userId,
          day.date,
          day.week,
          day.dayIdx,
          day.phase,
          day.type,
          day.title,
          day.sub,
          day.km,
          day.zone,
        ],
      })),
  ]);
  await matchActivitiesToPlan(userId);
  return days.length;
}

/**
 * Estimate zone anchors from watch data. Real max HR from recent activities is
 * the best signal available before a field test; LTHR follows from it.
 */
export async function estimateZoneAnchors(
  userId: number,
): Promise<{ lthr: number; maxHr: number; estimated: boolean }> {
  const d = getDb();
  const profile = await getProfile(userId);
  if (profile.lthr && profile.max_hr) {
    return { lthr: profile.lthr, maxHr: profile.max_hr, estimated: false };
  }
  const row = await d
    .prepare("SELECT MAX(max_hr) AS max_hr FROM activities WHERE user_id = ? AND max_hr IS NOT NULL")
    .get(userId) as { max_hr: number | null };
  // The highest beat ever recorded is only a max if the athlete actually went
  // there. Easy runs top out well under it, so an observed peak can raise the
  // population estimate but must never drag it down — anchoring zones to an
  // easy run's peak would cap every session tens of beats too low.
  const estimate = Number(process.env.DEFAULT_MAX_HR ?? 192);
  const observed = row.max_hr ? Math.round(row.max_hr) : null;
  const maxHr = Math.max(observed ?? 0, estimate);
  const lthr = estimateLthrFromMax(maxHr);
  await d.prepare("UPDATE profiles SET lthr = COALESCE(lthr, ?), max_hr = COALESCE(max_hr, ?) WHERE user_id = ?").run(
    lthr,
    maxHr,
    userId,
  );
  return { lthr, maxHr, estimated: observed === null || observed < estimate };
}

/** Marks onboarding complete: build the plan, set zones, greet the athlete. */
export async function completeOnboarding(userId: number) {
  const d = getDb();
  await estimateZoneAnchors(userId);
  await recalibrateZones(userId);
  await buildPlan(userId, { fresh: true });
  await d.prepare("UPDATE profiles SET onboarded = 1 WHERE user_id = ?").run(userId);
  const hasChat = await d
    .prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?")
    .get(userId) as { n: number };
  if (hasChat.n === 0) await appendMessage(userId, "coach", await welcomeMessage(userId));
}
