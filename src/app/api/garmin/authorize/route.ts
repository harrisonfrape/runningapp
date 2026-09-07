import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { garminAuthorizeUrl, garminConfig, pkcePair } from "@/lib/garmin";
import { handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const cfg = garminConfig();
    if (!cfg) {
      return NextResponse.json(
        { error: "Garmin is not configured — set GARMIN_CLIENT_ID and GARMIN_CLIENT_SECRET" },
        { status: 503 },
      );
    }
    const state = crypto.randomBytes(16).toString("hex");
    const { verifier, challenge } = pkcePair();
    getDb()
      .prepare(
        "INSERT INTO oauth_states (state, provider, user_id, code_verifier, created_at) VALUES (?, 'garmin', ?, ?, ?)",
      )
      .run(state, user.id, verifier, Date.now());
    return NextResponse.redirect(garminAuthorizeUrl(cfg, state, challenge));
  } catch (err) {
    return handleError(err);
  }
}
