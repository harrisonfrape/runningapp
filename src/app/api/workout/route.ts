import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import {
  PlanDayRow,
  coachNoteFor,
  segmentsFor,
  sessionTargets,
} from "@/lib/adapt";
import { today as todayIso } from "@/lib/metrics";
import { DAY_NAMES_FULL } from "@/lib/plan";
import { handleError, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Full detail for one planned day — the "Today's workout" / day-detail screen. */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const t = todayIso();
    const date = url.searchParams.get("date") ?? t;
    const day = await getDb()
      .prepare("SELECT * FROM plan_days WHERE user_id = ? AND date = ?")
      .get(user.id, date) as PlanDayRow | undefined;
    if (!day) return json({ error: "No session planned for that day" }, { status: 404 });

    const targets = await sessionTargets(user.id, day);
    return json({
      date: day.date,
      dateLabel: `${DAY_NAMES_FULL[day.day_idx]} · WEEK ${day.week} · ${day.phase.toUpperCase()} PHASE · ${
        day.date === t ? "TODAY" : day.date < t ? "COMPLETED" : "UPCOMING"
      }`,
      title: day.title,
      adapted: day.adapted === 1,
      adaptReason: day.adapt_reason,
      km: day.km ? day.km.toFixed(1) : "—",
      duration: targets.duration,
      zone: targets.zone,
      hr: targets.hr,
      pace: targets.pace,
      coachNote: coachNoteFor(day.type),
      segments: await segmentsFor(user.id, day),
    });
  } catch (err) {
    return handleError(err);
  }
}
