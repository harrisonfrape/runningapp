import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { runAdaptation } from "@/lib/adapt";
import { handleError, json } from "@/lib/api";

const FEELS = ["Great", "Good", "OK", "Rough"];

/** Post-run survey. Feedback weighs into the adaptation engine alongside HR. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const activityId = Number(id);
    const body = (await req.json()) as { feel?: string; rpe?: number; notes?: string };

    if (!body.feel || !FEELS.includes(body.feel)) {
      return json({ error: "Pick how the run felt" }, { status: 400 });
    }
    const rpe = Number(body.rpe);
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
      return json({ error: "RPE must be 1–10" }, { status: 400 });
    }
    const d = getDb();
    const owns = await d
      .prepare("SELECT id FROM activities WHERE id = ? AND user_id = ?")
      .get(activityId, user.id);
    if (!owns) return json({ error: "Run not found" }, { status: 404 });

    await d.prepare(
      `INSERT INTO surveys (activity_id, user_id, feel, rpe, notes) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(activity_id) DO UPDATE SET feel = excluded.feel, rpe = excluded.rpe,
         notes = excluded.notes, created_at = datetime('now')`,
    ).run(activityId, user.id, body.feel, rpe, body.notes ?? "");

    const adaptation = await runAdaptation(user.id, "survey");
    return json({ ok: true, changes: adaptation.changes, summary: adaptation.summary });
  } catch (err) {
    return handleError(err);
  }
}
