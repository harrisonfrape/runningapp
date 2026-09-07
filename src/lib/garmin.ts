import crypto from "node:crypto";
import { getDb } from "./db";

/**
 * Garmin Connect Developer Program — Health API, OAuth 2.0 + PKCE.
 * Authorization: connect.garmin.com/oauth2Confirm
 * Token:         diauth.garmin.com/di-oauth2-service/oauth/token
 * Data:          apis.garmin.com/wellness-api/rest/*
 */
const AUTH_URL = "https://connect.garmin.com/oauth2Confirm";
const TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const API = "https://apis.garmin.com/wellness-api/rest";

export interface GarminConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function garminConfig(): GarminConfig | null {
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    clientId,
    clientSecret,
    redirectUri: `${base.replace(/\/$/, "")}/api/garmin/callback`,
  };
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function garminAuthorizeUrl(cfg: GarminConfig, state: string, challenge: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${p}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) throw new Error(`Garmin token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(
  cfg: GarminConfig,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  return await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: cfg.redirectUri,
    }),
  );
}

async function refresh(cfg: GarminConfig, refreshToken: string): Promise<TokenResponse> {
  return await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
    }),
  );
}

export async function saveTokens(userId: number, t: TokenResponse, garminUserId?: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + t.expires_in;
  await getDb()
    .prepare(
      `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at, scope, external_user_id)
       VALUES (?, 'garmin', ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         scope = excluded.scope,
         external_user_id = COALESCE(excluded.external_user_id, oauth_tokens.external_user_id)`,
    )
    .run(userId, t.access_token, t.refresh_token, expiresAt, t.scope ?? null, garminUserId ?? null);
}

export async function accessToken(userId: number): Promise<string> {
  const cfg = garminConfig();
  if (!cfg) throw new Error("Garmin is not configured (GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET)");
  const row = await getDb()
    .prepare(
      "SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = ? AND provider = 'garmin'",
    )
    .get(userId) as
    | { access_token: string; refresh_token: string; expires_at: number }
    | undefined;
  if (!row) throw new Error("Garmin is not connected for this athlete");
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at > now + 120) return row.access_token;
  const t = await refresh(cfg, row.refresh_token);
  await saveTokens(userId, t);
  return t.access_token;
}

async function api<T>(userId: number, path: string): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Garmin GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function garminUserId(userId: number): Promise<{ userId: string }> {
  return api<{ userId: string }>(userId, "/user/id");
}

/** Disconnects the athlete's Garmin account at Garmin's end as well as ours. */
export async function deregister(userId: number): Promise<void> {
  const token = await accessToken(userId);
  await fetch(`${API}/user/registration`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  await getDb()
    .prepare("DELETE FROM oauth_tokens WHERE user_id = ? AND provider = 'garmin'")
    .run(userId);
}

/* ---------- summary shapes (only the fields we use) ---------- */

export interface DailySummary {
  calendarDate?: string;
  startTimeInSeconds?: number;
  restingHeartRateInBeats?: number;
  restingHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  bodyBatteryChargedValue?: number;
  bodyBatteryHighestValue?: number;
  bodyBatteryMostRecentValue?: number;
}

export interface SleepSummary {
  calendarDate?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  overallSleepScore?: { value?: number; qualifierKey?: string };
  sleepScores?: { overall?: { value?: number } };
  avgOvernightHrv?: number;
}

export interface HrvSummary {
  calendarDate?: string;
  lastNightAvg?: number;
  lastNight5MinHigh?: number;
}

export interface UserMetricsSummary {
  calendarDate?: string;
  vo2Max?: number;
  vo2MaxRunning?: number;
  enhancedVo2Max?: number;
  fitnessAge?: number;
}

function dateOf(s: { calendarDate?: string; startTimeInSeconds?: number }): string | null {
  if (s.calendarDate) return s.calendarDate;
  if (s.startTimeInSeconds) return new Date(s.startTimeInSeconds * 1000).toISOString().slice(0, 10);
  return null;
}

/** Merge one field-set into the recovery row for a date, leaving other fields intact. */
async function upsertRecovery(
  userId: number,
  date: string,
  fields: Partial<{
    sleep_seconds: number;
    sleep_score: number;
    hrv_ms: number;
    body_battery: number;
    resting_hr: number;
    vo2max: number;
  }>,
) {
  const d = getDb();
  await d.prepare("INSERT OR IGNORE INTO recovery (user_id, date) VALUES (?, ?)").run(userId, date);
  const keys = Object.keys(fields).filter(
    (k) => fields[k as keyof typeof fields] !== undefined && fields[k as keyof typeof fields] !== null,
  );
  if (!keys.length) return;
  const setSql = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k as keyof typeof fields] ?? null);
  await d.prepare(`UPDATE recovery SET ${setSql} WHERE user_id = ? AND date = ?`).run(
    ...values,
    userId,
    date,
  );
}

export async function ingestDailies(userId: number, rows: DailySummary[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const date = dateOf(r);
    if (!date) continue;
    await upsertRecovery(userId, date, {
      resting_hr: r.restingHeartRateInBeats ?? r.restingHeartRateInBeatsPerMinute,
      body_battery:
        r.bodyBatteryHighestValue ?? r.bodyBatteryChargedValue ?? r.bodyBatteryMostRecentValue,
    });
    n++;
  }
  return n;
}

export async function ingestSleeps(userId: number, rows: SleepSummary[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const date = dateOf(r);
    if (!date) continue;
    await upsertRecovery(userId, date, {
      sleep_seconds: r.durationInSeconds,
      sleep_score: r.overallSleepScore?.value ?? r.sleepScores?.overall?.value,
      hrv_ms: r.avgOvernightHrv,
    });
    n++;
  }
  return n;
}

export async function ingestHrv(userId: number, rows: HrvSummary[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const date = dateOf(r);
    if (!date || r.lastNightAvg == null) continue;
    await upsertRecovery(userId, date, { hrv_ms: r.lastNightAvg });
    n++;
  }
  return n;
}

export async function ingestUserMetrics(userId: number, rows: UserMetricsSummary[]): Promise<number> {
  let n = 0;
  const d = getDb();
  for (const r of rows) {
    const date = dateOf(r);
    const vo2 = r.vo2MaxRunning ?? r.enhancedVo2Max ?? r.vo2Max;
    if (!date || vo2 == null) continue;
    await upsertRecovery(userId, date, { vo2max: vo2 });
    await d.prepare("UPDATE profiles SET vo2max = ? WHERE user_id = ?").run(vo2, userId);
    n++;
  }
  return n;
}

/* ---------- pull (ping/pull integrations and manual refresh) ---------- */

/**
 * The Health API only serves 24 hours per request, so a range is walked one day
 * at a time. Times are upload times, per the Health API spec.
 */
async function pullWindow<T>(
  userId: number,
  resource: string,
  startEpoch: number,
  endEpoch: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let s = startEpoch; s < endEpoch; s += 86400) {
    const e = Math.min(s + 86400, endEpoch);
    const rows = await api<T[]>(
      userId,
      `/${resource}?uploadStartTimeInSeconds=${s}&uploadEndTimeInSeconds=${e}`,
    );
    out.push(...rows);
  }
  return out;
}

export async function pullRecovery(
  userId: number,
  days = 7,
): Promise<{ dailies: number; sleeps: number; metrics: number }> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const dailies = await ingestDailies(userId, await pullWindow<DailySummary>(userId, "dailies", start, end));
  const sleeps = await ingestSleeps(userId, await pullWindow<SleepSummary>(userId, "sleeps", start, end));
  let metrics = 0;
  try {
    metrics = await ingestUserMetrics(
      userId,
      await pullWindow<UserMetricsSummary>(userId, "userMetrics", start, end),
    );
  } catch {
    // userMetrics requires the Health API "user metrics" permission; skip if absent.
  }
  await getDb()
    .prepare(
      `INSERT INTO sync_state (user_id, provider, last_sync, last_error) VALUES (?, 'garmin', datetime('now'), NULL)
       ON CONFLICT(user_id, provider) DO UPDATE SET last_sync = excluded.last_sync, last_error = NULL`,
    )
    .run(userId);
  return { dailies, sleeps, metrics };
}

/**
 * Ask Garmin to replay historic summaries. The call returns 202 and the data
 * arrives later on the push webhook (or via pull once processed).
 */
export async function requestBackfill(userId: number, resource: string, days: number) {
  const token = await accessToken(userId);
  const end = Math.floor(Date.now() / 1000);
  const results: Array<{ from: number; to: number; status: number }> = [];
  // Garmin accepts at most 90 days per backfill request.
  for (let s = end - days * 86400; s < end; s += 90 * 86400) {
    const e = Math.min(s + 90 * 86400, end);
    const res = await fetch(
      `${API}/backfill/${resource}?summaryStartTimeInSeconds=${s}&summaryEndTimeInSeconds=${e}`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    );
    results.push({ from: s, to: e, status: res.status });
  }
  return results;
}

/** Maps a Garmin user id back to the local athlete (push notifications key on it). */
export async function userIdForGarminUser(garminUserId: string): Promise<number | null> {
  const row = await getDb()
    .prepare(
      "SELECT user_id FROM oauth_tokens WHERE provider = 'garmin' AND external_user_id = ?",
    )
    .get(garminUserId) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}
