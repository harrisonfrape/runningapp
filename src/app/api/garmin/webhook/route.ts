import { NextResponse, after } from "next/server";
import { getDb } from "@/lib/db";
import {
  DailySummary,
  HrvSummary,
  SleepSummary,
  UserMetricsSummary,
  ingestDailies,
  ingestHrv,
  ingestSleeps,
  ingestUserMetrics,
  userIdForGarminUser,
} from "@/lib/garmin";
import { runAdaptation } from "@/lib/adapt";

type Summary = { userId?: string };

interface PushBody {
  dailies?: Array<DailySummary & Summary>;
  sleeps?: Array<SleepSummary & Summary>;
  hrv?: Array<HrvSummary & Summary>;
  hrvSummaries?: Array<HrvSummary & Summary>;
  userMetrics?: Array<UserMetricsSummary & Summary>;
  deregistrations?: Array<Summary>;
  userPermissionsChange?: Array<Summary>;
}

/**
 * Garmin Health API push notifications. Garmin retries on non-2xx, so the body
 * is stored and acknowledged immediately, then ingested after the response.
 */
export async function POST(req: Request) {
  let body: PushBody;
  try {
    body = (await req.json()) as PushBody;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const d = getDb();
  const info = d
    .prepare("INSERT INTO webhook_events (provider, payload) VALUES ('garmin', ?)")
    .run(JSON.stringify(body));
  const eventId = Number(info.lastInsertRowid);

  after(() => {
    try {
      const touched = ingest(body);
      for (const userId of touched) runAdaptation(userId, "recovery");
      d.prepare("UPDATE webhook_events SET processed = 1 WHERE id = ?").run(eventId);
    } catch (err) {
      d.prepare("UPDATE webhook_events SET error = ? WHERE id = ?").run(
        err instanceof Error ? err.message : "unknown",
        eventId,
      );
      console.error("[stride] garmin webhook", err);
    }
  });

  return NextResponse.json({ ok: true });
}

/** Group each summary type by athlete, then ingest per athlete. */
function ingest(body: PushBody): Set<number> {
  const touched = new Set<number>();
  const d = getDb();

  const byUser = <T extends Summary>(rows: T[] | undefined) => {
    const map = new Map<number, T[]>();
    for (const row of rows ?? []) {
      if (!row.userId) continue;
      const userId = userIdForGarminUser(row.userId);
      if (userId === null) continue;
      map.set(userId, [...(map.get(userId) ?? []), row]);
    }
    return map;
  };

  for (const [userId, rows] of byUser(body.dailies)) {
    ingestDailies(userId, rows);
    touched.add(userId);
  }
  for (const [userId, rows] of byUser(body.sleeps)) {
    ingestSleeps(userId, rows);
    touched.add(userId);
  }
  for (const [userId, rows] of byUser(body.hrv ?? body.hrvSummaries)) {
    ingestHrv(userId, rows);
    touched.add(userId);
  }
  for (const [userId, rows] of byUser(body.userMetrics)) {
    ingestUserMetrics(userId, rows);
    touched.add(userId);
  }
  for (const [userId] of byUser(body.deregistrations)) {
    d.prepare("DELETE FROM oauth_tokens WHERE user_id = ? AND provider = 'garmin'").run(userId);
  }
  for (const userId of touched) {
    d.prepare(
      `INSERT INTO sync_state (user_id, provider, last_sync, last_error) VALUES (?, 'garmin', datetime('now'), NULL)
       ON CONFLICT(user_id, provider) DO UPDATE SET last_sync = excluded.last_sync, last_error = NULL`,
    ).run(userId);
  }
  return touched;
}
