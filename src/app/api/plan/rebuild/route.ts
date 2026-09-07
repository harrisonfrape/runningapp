import { requireUser } from "@/lib/session";
import { buildPlan } from "@/lib/onboard";
import { runAdaptation } from "@/lib/adapt";
import { handleError, json } from "@/lib/api";

export async function POST() {
  try {
    const user = await requireUser();
    const days = await buildPlan(user.id);
    const result = await runAdaptation(user.id, "activity");
    return json({ ok: true, days, changes: result.changes.length });
  } catch (err) {
    return handleError(err);
  }
}
