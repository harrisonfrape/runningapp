import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db";
import { getProfile, zonesFor, weekAdherence, PlanDayRow } from "./adapt";
import {
  assessReadiness,
  assessRecovery,
  fourWeekAverage,
  formatDuration,
  formatPace,
  km,
  longestRun,
  recentActivities,
  relativeDate,
  today as todayIso,
  thresholdPace,
} from "./metrics";
import { addDays, daysBetween, mondayOf, paceString, weeksBetween } from "./plan";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * The coach's system prompt. The persona is fixed; everything after it is the
 * athlete's live state, refreshed on every message so the coach always answers
 * against today's plan, today's runs and last night's recovery.
 */
export async function coachSystem(userId: number): Promise<string> {
  const d = getDb();
  const t = todayIso();
  const profile = await getProfile(userId);
  const zones = await zonesFor(userId, profile);
  const weeksToRace = Math.max(0, weeksBetween(t, profile.race_date));
  const four = await fourWeekAverage(userId, t);
  const longest = await longestRun(userId, t);
  const readiness = await assessReadiness(userId, t, profile);
  const rec = await assessRecovery(userId, t);
  const tp = await thresholdPace(userId, t, profile.goal_seconds);

  const weekStart = mondayOf(t);
  const week = await d
    .prepare("SELECT * FROM plan_days WHERE user_id = ? AND date >= ? AND date < ? ORDER BY date")
    .all(userId, weekStart, addDays(weekStart, 7)) as PlanDayRow[];
  const weekLine = week
    .map((x) => {
      const day = new Date(`${x.date}T00:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "short",
        timeZone: "UTC",
      });
      const done = x.completed_activity_id ? " (done)" : "";
      const adapted = x.adapted ? ` [ADAPTED: ${x.adapt_reason}]` : "";
      return `${day} ${x.title}${x.km ? ` ${x.km} km ${x.zone}` : ""}${done}${adapted}`;
    })
    .join("; ");

  const runs = (
    await Promise.all(
      (await recentActivities(userId, 8)).map(async (a) => {
      const survey = await d
        .prepare("SELECT feel, rpe, notes FROM surveys WHERE activity_id = ?")
        .get(a.id) as { feel: string; rpe: number; notes: string } | undefined;
      const hr = a.average_hr ? `${Math.round(a.average_hr)} bpm avg` : "no HR";
      const fb = survey
        ? `; athlete said: ${survey.feel}, RPE ${survey.rpe}${survey.notes ? ` — "${survey.notes}"` : ""}`
        : "";
      return `${relativeDate(a.start_date, t)}: ${a.name}, ${km(a).toFixed(1)} km at ${formatPace(a)}, ${hr}${fb}`;
      }),
    )
  ).join(" | ");

  const zoneLine = zones
    .map((z) =>
      z.key === 1 ? `Z1 <${z.highHr}` : z.key === 5 ? `Z5 ${z.lowHr}+` : `Z${z.key} ${z.lowHr}-${z.highHr}`,
    )
    .join(", ");

  const adherence = await weekAdherence(userId, addDays(weekStart, -7));

  const recLine = rec.hasData
    ? `Recovery score ${rec.score}/100 (${rec.status}). Sleep ${rec.sleepHours?.toFixed(1) ?? "?"} h, sleep score ${rec.sleepScore ?? "?"}, overnight HRV ${rec.hrvDelta === null ? "no baseline yet" : `${rec.hrvDelta >= 0 ? "+" : ""}${rec.hrvDelta} ms vs baseline`}, body battery ${rec.bodyBattery ?? "?"}.`
    : "No Garmin recovery data connected yet.";

  return `You are a calm, experienced marathon coach inside a training app called Stride.

ATHLETE STATE (live, as of ${t}):
- Goal race: ${profile.race_name} on ${profile.race_date} — ${weeksToRace} weeks out, ${daysBetween(t, profile.race_date)} days. Goal time ${formatDuration(profile.goal_seconds)} (${paceString(profile.goal_seconds / 42.195)}/km).
- Current training: ${four.km} km/week over the last 4 weeks, ${four.runs} runs/week. Longest recent run ${longest ? `${km(longest).toFixed(1)} km` : "none recorded"}. Estimated threshold pace ${paceString(tp)}/km.
- Heart rate zones (LTHR ${profile.lthr ?? "estimated"}, max ${profile.max_hr ?? "estimated"}): ${zoneLine}.
- This week's plan: ${weekLine || "not generated yet"}.
- Last week's adherence: ${adherence === null ? "no plan data" : `${Math.round(adherence * 100)}% of planned volume`}.
- ${recLine}
- Recent runs: ${runs || "none synced yet"}.
- Projected finish ${readiness.projectedFinish}, readiness ${readiness.readinessPct}%.

You have coached marathoners for 30 years, from first-timers to sub-2:20 athletes, and you know exercise physiology, periodisation, fuelling, pacing and injury prevention inside out. Answer with the quiet confidence of deep experience: give ONE clear recommendation, never a menu of options, no hedging ("maybe", "it depends", "you could try"), no disclaimers about consulting others. Be precise and correct with physiology and numbers, and use the athlete's real figures above rather than generic advice — if something is genuinely unknowable from the data, say exactly what you'd need to know and what you'd do in the meantime. Warm but direct, 2-4 short paragraphs max. Prioritise consistency and injury prevention over heroics, and state that as a decision, not a suggestion.`;
}

export interface StoredMessage {
  role: "user" | "coach";
  text: string;
}

export async function chatHistory(userId: number, limit = 20): Promise<StoredMessage[]> {
  const rows = await getDb()
    .prepare(
      "SELECT role, text FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(userId, limit) as StoredMessage[];
  return rows.reverse();
}

export async function appendMessage(userId: number, role: "user" | "coach", text: string) {
  await getDb()
    .prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?, ?, ?)")
    .run(userId, role, text);
}

export async function askCoach(userId: number, question: string): Promise<string> {
  if (!anthropicConfigured()) {
    throw new Error("The coaching engine is not configured (set ANTHROPIC_API_KEY)");
  }
  const client = new Anthropic();
  const history = await chatHistory(userId, 12);

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
    content: m.text,
  }));
  messages.push({ role: "user", content: question });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: await coachSystem(userId),
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages,
  });

  if (response.stop_reason === "refusal") {
    return "I can't answer that one. Ask me about your training and I'm all yours.";
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text || "I didn't get that — say it again?";
}

/** The coach's opening message, written once the plan exists. */
export async function welcomeMessage(userId: number): Promise<string> {
  const t = todayIso();
  const profile = await getProfile(userId);
  const four = await fourWeekAverage(userId, t);
  const readiness = await assessReadiness(userId, t, profile);
  const first = await getDb()
    .prepare(
      "SELECT * FROM plan_days WHERE user_id = ? AND date >= ? AND type != 'rest' ORDER BY date LIMIT 1",
    )
    .get(userId, t) as PlanDayRow | undefined;

  const historyLine = four.km
    ? `I've been through your Strava history — ${four.km} km a week across ${four.runs} runs, and ${readiness.projectedSeconds ? `your speed already projects ${readiness.projectedFinish}` : "some real work in there"}.`
    : "Your plan is built and ready — post your first run and I'll start shaping the weeks around it.";
  const nextLine = first
    ? ` Next up: ${first.title.toLowerCase()}${first.km ? `, ${first.km} km` : ""}.`
    : "";
  return `${historyLine}${nextLine} The bigger goal for now is simply consistency — four runs a week. Anything you want to go over?`;
}
