import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/api";
import {
  exchangeCode,
  garminConfig,
  garminUserId,
  pullRecovery,
  requestBackfill,
  saveTokens,
} from "@/lib/garmin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(`${appUrl()}/?${new URLSearchParams(params)}`);

  if (error) return back({ connect: "garmin", status: "denied" });
  if (!code || !state) return back({ connect: "garmin", status: "invalid" });

  const d = getDb();
  const row = d
    .prepare(
      "SELECT user_id, code_verifier FROM oauth_states WHERE state = ? AND provider = 'garmin'",
    )
    .get(state) as { user_id: number; code_verifier: string } | undefined;
  d.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  if (!row) return back({ connect: "garmin", status: "expired" });

  const cfg = garminConfig();
  if (!cfg) return back({ connect: "garmin", status: "unconfigured" });

  try {
    const tokens = await exchangeCode(cfg, code, row.code_verifier);
    saveTokens(row.user_id, tokens);
    const { userId: garminId } = await garminUserId(row.user_id);
    saveTokens(row.user_id, tokens, garminId);
    // Historic summaries arrive asynchronously on the push webhook; the pull
    // below fills in whatever Garmin already holds (the last seven days).
    await requestBackfill(row.user_id, "dailies", 90).catch(() => []);
    await requestBackfill(row.user_id, "sleeps", 90).catch(() => []);
    await pullRecovery(row.user_id, 7).catch(() => null);
    return back({ connect: "garmin", status: "ok" });
  } catch (err) {
    console.error("[stride] garmin callback", err);
    d.prepare(
      `INSERT INTO sync_state (user_id, provider, last_error) VALUES (?, 'garmin', ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET last_error = excluded.last_error`,
    ).run(row.user_id, err instanceof Error ? err.message : "unknown");
    return back({ connect: "garmin", status: "failed" });
  }
}
