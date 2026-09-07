/**
 * The nightly job, run in-process against the database.
 *
 *   0 5 * * *   cd /srv/stride && npx tsx scripts/nightly.ts
 *
 * Garmin's push webhook already adapts the plan the moment overnight data
 * lands; this pass is what guarantees the check still happens when a push was
 * missed, a token needed refreshing, or the athlete only ever connected Strava.
 * On a serverless host with no cron shell, POST /api/cron/nightly does the same
 * work behind the CRON_SECRET bearer token.
 */
import { getDb } from "../src/lib/db";
import { pullRecovery } from "../src/lib/garmin";
import { recalibrateZones, runAdaptation } from "../src/lib/adapt";
import { syncActivities } from "../src/lib/strava";

async function main() {
  const d = getDb();
  const users = d.prepare("SELECT id, email FROM users").all() as Array<{
    id: number;
    email: string;
  }>;
  const providers = d.prepare("SELECT provider FROM oauth_tokens WHERE user_id = ?");

  if (!users.length) {
    console.log("No athletes yet.");
    return;
  }

  for (const user of users) {
    const connected = new Set(
      (providers.all(user.id) as Array<{ provider: string }>).map((r) => r.provider),
    );
    console.log(`\n${user.email}`);

    if (connected.has("garmin")) {
      try {
        const r = await pullRecovery(user.id, 3);
        console.log(`  garmin  ${r.dailies} dailies, ${r.sleeps} sleeps, ${r.metrics} metrics`);
      } catch (err) {
        console.error(`  garmin  failed: ${message(err)}`);
        noteError(user.id, "garmin", message(err));
      }
    }

    if (connected.has("strava")) {
      try {
        const r = await syncActivities(user.id);
        console.log(`  strava  ${r.imported} new of ${r.scanned} scanned`);
      } catch (err) {
        console.error(`  strava  failed: ${message(err)}`);
        noteError(user.id, "strava", message(err));
      }
    }

    try {
      if (recalibrateZones(user.id)) console.log("  zones   recalibrated");
      const adaptation = runAdaptation(user.id, "recovery");
      console.log(
        adaptation.changes.length
          ? `  plan    ${adaptation.summary}`
          : "  plan    no changes needed",
      );
    } catch (err) {
      console.error(`  plan    failed: ${message(err)}`);
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

function noteError(userId: number, provider: string, text: string) {
  getDb()
    .prepare(
      `INSERT INTO sync_state (user_id, provider, last_error) VALUES (?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET last_error = excluded.last_error`,
    )
    .run(userId, provider, text);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(message(err));
    process.exit(1);
  });
