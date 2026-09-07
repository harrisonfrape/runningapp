import { requireUser } from "@/lib/session";
import { pullRecovery } from "@/lib/garmin";
import { runAdaptation } from "@/lib/adapt";
import { handleError, json } from "@/lib/api";

/** Manual recovery refresh — the nightly job and the push webhook do this too. */
export async function POST() {
  try {
    const user = await requireUser();
    const result = await pullRecovery(user.id, 7);
    const adaptation = runAdaptation(user.id, "recovery");
    return json({ ok: true, ...result, changes: adaptation.changes });
  } catch (err) {
    return handleError(err);
  }
}
