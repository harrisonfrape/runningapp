import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { stravaAuthorizeUrl, stravaConfig } from "@/lib/strava";
import { handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const cfg = stravaConfig();
    if (!cfg) {
      return NextResponse.json(
        { error: "Strava is not configured — set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET" },
        { status: 503 },
      );
    }
    const state = crypto.randomBytes(16).toString("hex");
    getDb()
      .prepare(
        "INSERT INTO oauth_states (state, provider, user_id, created_at) VALUES (?, 'strava', ?, ?)",
      )
      .run(state, user.id, Date.now());
    return NextResponse.redirect(stravaAuthorizeUrl(cfg, state));
  } catch (err) {
    return handleError(err);
  }
}
