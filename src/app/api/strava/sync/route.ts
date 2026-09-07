import { requireUser } from "@/lib/session";
import { syncActivities } from "@/lib/strava";
import { recalibrateZones, runAdaptation } from "@/lib/adapt";
import { handleError, json } from "@/lib/api";

/** Manual "Sync Strava" — the polling fallback to the webhook. */
export async function POST() {
  try {
    const user = await requireUser();
    const result = await syncActivities(user.id);
    await recalibrateZones(user.id);
    const adaptation = result.imported > 0 ? await runAdaptation(user.id, "activity") : null;
    return json({
      ok: true,
      imported: result.imported,
      scanned: result.scanned,
      changes: adaptation?.changes ?? [],
      summary: adaptation?.summary ?? null,
    });
  } catch (err) {
    return handleError(err);
  }
}
