import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { zonesFor } from "@/lib/adapt";
import { formatPace, km, paceSecPerKm, type ActivityRow } from "@/lib/metrics";
import { paceString } from "@/lib/zones";
import { handleError, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Watch data for one run, plus any survey already saved against it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = getDb();
    const a = d
      .prepare(
        `SELECT id, provider, external_id, name, start_date, distance_m, moving_time_s,
                average_hr, max_hr, average_cadence, zone_seconds_json, type
         FROM activities WHERE id = ? AND user_id = ?`,
      )
      .get(Number(id), user.id) as ActivityRow | undefined;
    if (!a) return json({ error: "Run not found" }, { status: 404 });

    const survey = d
      .prepare("SELECT feel, rpe, notes FROM surveys WHERE activity_id = ?")
      .get(a.id) as { feel: string; rpe: number; notes: string } | undefined;

    const zones = zonesFor(user.id);
    let z2 = "—";
    if (a.zone_seconds_json) {
      const seconds = JSON.parse(a.zone_seconds_json) as Record<string, number>;
      const inZ2 = seconds["2"] ?? 0;
      const total = Object.values(seconds).reduce((x, y) => x + y, 0);
      if (total > 0) {
        const mins = Math.round(inZ2 / 60);
        z2 = `${mins} min (${Math.round((inZ2 / total) * 100)}%)`;
      }
    }

    const pace = paceSecPerKm(a);
    const watchNote = buildWatchNote(a, pace, zones[1].highHr);

    return json({
      km: km(a).toFixed(1),
      pace: formatPace(a),
      hr: a.average_hr ? `${Math.round(a.average_hr)} bpm` : "no HR recorded",
      z2,
      cadence: a.average_cadence ? `${Math.round(a.average_cadence)} spm` : "—",
      watchNote,
      survey: survey ?? null,
    });
  } catch (err) {
    return handleError(err);
  }
}

function buildWatchNote(a: ActivityRow, pace: number | null, z2High: number): string {
  const paceLabel = pace ? `${paceString(pace)}/km` : "an unrecorded pace";
  if (!a.average_hr) {
    return `No heart rate recorded — the watch didn't send HR for this run. Pace looked ${
      pace && pace > 330 ? "controlled" : "quick"
    } at ${paceLabel}.`;
  }
  if (a.average_hr > z2High + 5) {
    return `Average HR ${Math.round(a.average_hr)} bpm at ${paceLabel} — above Zone 2. That's a real cost on an easy day, and the plan accounts for it.`;
  }
  return `Average HR ${Math.round(a.average_hr)} bpm at ${paceLabel} — sitting inside Zone 2. Textbook aerobic running.`;
}
