import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/api";
import { exchangeCode, saveTokens, stravaConfig, syncActivities } from "@/lib/strava";
import { buildPlan, estimateZoneAnchors } from "@/lib/onboard";
import { getProfile, recalibrateZones, runAdaptation } from "@/lib/adapt";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const scope = url.searchParams.get("scope") ?? "";

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(`${appUrl()}/?${new URLSearchParams(params)}`);

  if (error) return back({ connect: "strava", status: "denied" });
  if (!code || !state) return back({ connect: "strava", status: "invalid" });

  const d = getDb();
  const row = await d
    .prepare("SELECT user_id FROM oauth_states WHERE state = ? AND provider = 'strava'")
    .get(state) as { user_id: number } | undefined;
  await d.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  if (!row) return back({ connect: "strava", status: "expired" });

  const cfg = stravaConfig();
  if (!cfg) return back({ connect: "strava", status: "unconfigured" });

  try {
    const tokens = await exchangeCode(cfg, code);
    await saveTokens(row.user_id, tokens, scope);
    if (!scope.includes("activity:read")) {
      return back({ connect: "strava", status: "scope" });
    }
    // Import the athlete's history — this is what the first plan is built from.
    await syncActivities(row.user_id);
    await estimateZoneAnchors(row.user_id);
    await recalibrateZones(row.user_id);
    // During onboarding the plan is generated at the end of the flow. An
    // athlete connecting Strava later already has one, and it was built from a
    // baseline that has just been replaced by their real history — so rebuild
    // the weeks ahead and let the engine re-apply its adjustments.
    if ((await getProfile(row.user_id)).onboarded === 1) {
      await buildPlan(row.user_id);
      await runAdaptation(row.user_id, "activity");
    }
    return back({ connect: "strava", status: "ok" });
  } catch (err) {
    console.error("[stride] strava callback", err);
    await d.prepare(
      `INSERT INTO sync_state (user_id, provider, last_error) VALUES (?, 'strava', ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET last_error = excluded.last_error`,
    ).run(row.user_id, err instanceof Error ? err.message : "unknown");
    return back({ connect: "strava", status: "failed" });
  }
}
