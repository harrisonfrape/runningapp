import { NextResponse, after } from "next/server";
import { getDb } from "@/lib/db";
import { getActivity, importActivity, isRun } from "@/lib/strava";
import { recalibrateZones, runAdaptation } from "@/lib/adapt";

/** Strava's subscription validation handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  // The verify token is all Strava echoes here, so the handshake does not
  // depend on the rest of the app being configured.
  const expected = process.env.STRAVA_VERIFY_TOKEN ?? "stride-verify";
  if (mode === "subscribe" && token === expected && challenge) {
    return NextResponse.json({ "hub.challenge": challenge });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface StravaEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, string>;
}

/**
 * Event delivery. Strava expects a 200 within two seconds, so the event is
 * stored, acknowledged, and processed after the response is sent.
 */
export async function POST(req: Request) {
  let event: StravaEvent;
  try {
    event = (await req.json()) as StravaEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const d = getDb();
  const info = d
    .prepare("INSERT INTO webhook_events (provider, payload) VALUES ('strava', ?)")
    .run(JSON.stringify(event));
  const eventId = Number(info.lastInsertRowid);

  after(async () => {
    try {
      await processEvent(event);
      d.prepare("UPDATE webhook_events SET processed = 1 WHERE id = ?").run(eventId);
    } catch (err) {
      d.prepare("UPDATE webhook_events SET error = ? WHERE id = ?").run(
        err instanceof Error ? err.message : "unknown",
        eventId,
      );
      console.error("[stride] strava webhook", err);
    }
  });

  return NextResponse.json({ ok: true });
}

async function processEvent(event: StravaEvent) {
  if (event.object_type !== "activity") return;
  const d = getDb();
  const row = d
    .prepare(
      "SELECT user_id FROM oauth_tokens WHERE provider = 'strava' AND external_user_id = ?",
    )
    .get(String(event.owner_id)) as { user_id: number } | undefined;
  if (!row) return; // an athlete we don't have connected

  if (event.aspect_type === "delete") {
    d.prepare(
      "DELETE FROM activities WHERE user_id = ? AND provider = 'strava' AND external_id = ?",
    ).run(row.user_id, String(event.object_id));
    return;
  }

  const activity = await getActivity(row.user_id, event.object_id);
  if (!isRun(activity)) return;
  const imported = await importActivity(row.user_id, activity);
  recalibrateZones(row.user_id);
  if (imported !== null || event.aspect_type === "update") {
    runAdaptation(row.user_id, "activity");
  }
}
