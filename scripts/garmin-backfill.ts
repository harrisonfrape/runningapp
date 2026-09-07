/**
 * Ask Garmin to replay historic summaries for one athlete.
 *   npm run garmin:backfill -- <userId> [resource] [days]
 * Data arrives asynchronously on the push webhook (or the next pull).
 */
import { requestBackfill } from "../src/lib/garmin";

const userId = Number(process.argv[2]);
const resource = process.argv[3] ?? "dailies";
const days = Number(process.argv[4] ?? 90);

if (!userId) {
  console.error("Usage: npm run garmin:backfill -- <userId> [dailies|sleeps|userMetrics] [days]");
  process.exit(1);
}

requestBackfill(userId, resource, days)
  .then((r) => console.log(r))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
