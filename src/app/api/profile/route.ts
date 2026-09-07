import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { buildPlan } from "@/lib/onboard";
import { handleError, json } from "@/lib/api";

/** Parses "3:30:00" / "3:30" / "210m" style goal times into seconds. */
function parseGoal(value: string): number | null {
  const parts = value.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      raceName?: string;
      raceDate?: string;
      goalTime?: string;
      lthr?: number;
      maxHr?: number;
    };
    const d = getDb();

    if (body.raceDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.raceDate)) {
        return json({ error: "Race date must be YYYY-MM-DD" }, { status: 400 });
      }
      d.prepare("UPDATE profiles SET race_date = ? WHERE user_id = ?").run(body.raceDate, user.id);
    }
    if (body.raceName) {
      d.prepare("UPDATE profiles SET race_name = ? WHERE user_id = ?").run(body.raceName, user.id);
    }
    if (body.goalTime) {
      const seconds = parseGoal(body.goalTime);
      if (!seconds || seconds < 2 * 3600 || seconds > 8 * 3600) {
        return json({ error: "Goal time must look like 3:30:00" }, { status: 400 });
      }
      d.prepare("UPDATE profiles SET goal_seconds = ? WHERE user_id = ?").run(seconds, user.id);
    }
    if (body.lthr) d.prepare("UPDATE profiles SET lthr = ? WHERE user_id = ?").run(body.lthr, user.id);
    if (body.maxHr) d.prepare("UPDATE profiles SET max_hr = ? WHERE user_id = ?").run(body.maxHr, user.id);

    const onboarded = d
      .prepare("SELECT onboarded FROM profiles WHERE user_id = ?")
      .get(user.id) as { onboarded: number };
    if (onboarded.onboarded === 1) buildPlan(user.id);

    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
