import { getDb } from "@/lib/db";
import { pullRecovery } from "@/lib/garmin";
import { recalibrateZones, runAdaptation } from "@/lib/adapt";
import { syncActivities } from "@/lib/strava";
import { handleError, json } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The nightly job. Garmin's push webhook already adapts the plan the moment
 * overnight data lands, but a scheduled pass is what guarantees the check
 * happens even when a push is missed, a token needed refreshing, or the athlete
 * has only ever connected Strava.
 *
 * Vercel Cron invokes it with GET and sends CRON_SECRET as a bearer token
 * automatically; POST is here so a systemd timer, GitHub Action or plain curl
 * can trigger exactly the same work.
 */
export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return json({ error: "CRON_SECRET is not set — refusing to run" }, { status: 503 });
    }
    const auth = req.headers.get("authorization") ?? "";
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-cron-secret");
    if (presented !== secret) return json({ error: "Unauthorized" }, { status: 401 });

    const d = getDb();
    const users = await d.prepare("SELECT id, email FROM users").all() as Array<{
      id: number;
      email: string;
    }>;
    const providersFor = d.prepare("SELECT provider FROM oauth_tokens WHERE user_id = ?");

    const report: Array<Record<string, unknown>> = [];

    for (const user of users) {
      const connected = new Set(
        (((await providersFor.all(user.id)) as Array<{ provider: string }>)).map((r) => r.provider),
      );
      const row: Record<string, unknown> = { user: user.email };

      if (connected.has("garmin")) {
        try {
          row.recovery = await pullRecovery(user.id, 3);
        } catch (err) {
          row.garminError = err instanceof Error ? err.message : "unknown";
          noteError(user.id, "garmin", row.garminError as string);
        }
      }

      // Strava's webhook is the fast path; this catches anything it missed.
      if (connected.has("strava")) {
        try {
          row.strava = await syncActivities(user.id);
        } catch (err) {
          row.stravaError = err instanceof Error ? err.message : "unknown";
          noteError(user.id, "strava", row.stravaError as string);
        }
      }

      try {
        row.zonesRecalibrated = await recalibrateZones(user.id);
        const adaptation = await runAdaptation(user.id, "recovery");
        row.changes = adaptation.changes.length;
        if (adaptation.summary) row.summary = adaptation.summary;
      } catch (err) {
        row.adaptError = err instanceof Error ? err.message : "unknown";
      }

      report.push(row);
    }

    return json({ ok: true, ran: new Date().toISOString(), athletes: report });
  } catch (err) {
    return handleError(err);
  }
}

async function noteError(userId: number, provider: string, message: string) {
  await getDb()
    .prepare(
      `INSERT INTO sync_state (user_id, provider, last_error) VALUES (?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET last_error = excluded.last_error`,
    )
    .run(userId, provider, message);
}
