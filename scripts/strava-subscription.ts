/**
 * Manage the Strava push subscription (one per application).
 *   npm run strava:subscribe     — create it, pointing at APP_URL/api/strava/webhook
 *   npm run strava:subscription  — show the current one
 *   npm run strava:unsubscribe   — delete it (pass the id as an argument)
 *
 * Strava calls the callback URL immediately to validate it, so the app must be
 * running and publicly reachable at APP_URL before creating a subscription.
 */
import { createSubscription, deleteSubscription, viewSubscription } from "../src/lib/strava";

const command = process.argv[2] ?? "view";
const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function main() {
  if (command === "create") {
    const callback = `${base}/api/strava/webhook`;
    console.log(`Creating subscription with callback ${callback}`);
    console.log(await createSubscription(callback));
    return;
  }
  if (command === "delete") {
    const id = Number(process.argv[3]);
    if (!id) throw new Error("Usage: npm run strava:unsubscribe -- <subscription id>");
    await deleteSubscription(id);
    console.log(`Deleted subscription ${id}`);
    return;
  }
  console.log(await viewSubscription());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
