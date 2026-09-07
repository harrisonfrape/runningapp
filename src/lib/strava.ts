import { getDb } from "./db";
import { buildZones, zoneSeconds } from "./zones";
import { thresholdPaceFromGoal } from "./plan";

const AUTH_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  verifyToken: string;
}

export function stravaConfig(): StravaConfig | null {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    clientId,
    clientSecret,
    redirectUri: `${base.replace(/\/$/, "")}/api/strava/callback`,
    verifyToken: process.env.STRAVA_VERIFY_TOKEN ?? "stride-verify",
  };
}

export function stravaAuthorizeUrl(cfg: StravaConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

export async function exchangeCode(cfg: StravaConfig, code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

async function refresh(cfg: StravaConfig, refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function saveTokens(userId: number, t: TokenResponse, scope = "activity:read_all") {
  await getDb()
    .prepare(
      `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at, scope, external_user_id)
       VALUES (?, 'strava', ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         scope = excluded.scope,
         external_user_id = COALESCE(excluded.external_user_id, oauth_tokens.external_user_id)`,
    )
    .run(userId, t.access_token, t.refresh_token, t.expires_at, scope, t.athlete?.id ?? null);
}

/** Returns a non-expired access token, refreshing and persisting when needed. */
export async function accessToken(userId: number): Promise<string> {
  const cfg = stravaConfig();
  if (!cfg) throw new Error("Strava is not configured (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET)");
  const row = await getDb()
    .prepare(
      "SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = ? AND provider = 'strava'",
    )
    .get(userId) as
    | { access_token: string; refresh_token: string; expires_at: number }
    | undefined;
  if (!row) throw new Error("Strava is not connected for this athlete");
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at > now + 120) return row.access_token;
  const t = await refresh(cfg, row.refresh_token);
  await saveTokens(userId, t);
  return t.access_token;
}

async function api<T>(userId: number, path: string): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new Error("Strava rate limit reached — try again shortly");
  if (!res.ok) throw new Error(`Strava GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  has_heartrate?: boolean;
}

export function listActivities(
  userId: number,
  afterEpoch: number,
  page = 1,
  perPage = 100,
): Promise<StravaActivity[]> {
  return api<StravaActivity[]>(
    userId,
    `/athlete/activities?after=${afterEpoch}&page=${page}&per_page=${perPage}`,
  );
}

export function getActivity(userId: number, id: string | number): Promise<StravaActivity> {
  return api<StravaActivity>(userId, `/activities/${id}`);
}

interface StreamSet {
  time?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
  velocity_smooth?: { data: number[] };
}

export async function getStreams(userId: number, id: string | number): Promise<StreamSet | null> {
  try {
    return await api<StreamSet>(
      userId,
      `/activities/${id}/streams?keys=time,heartrate,cadence,velocity_smooth&key_by_type=true`,
    );
  } catch {
    return null; // streams are optional — an activity without them still imports
  }
}

/** Only running-shaped activities feed the plan. */
export function isRun(a: StravaActivity): boolean {
  const t = (a.sport_type || a.type || "").toLowerCase();
  return t.includes("run");
}

/**
 * Persists one Strava activity (plus per-zone time when HR streams exist).
 * Returns the local activity id, or null when it was already stored.
 */
export async function importActivity(
  userId: number,
  a: StravaActivity,
  opts: { withStreams?: boolean } = {},
): Promise<number | null> {
  const d = getDb();
  const existing = await d
    .prepare(
      "SELECT id FROM activities WHERE user_id = ? AND provider = 'strava' AND external_id = ?",
    )
    .get(userId, String(a.id)) as { id: number } | undefined;

  let zoneJson: string | null = null;
  if (opts.withStreams !== false && a.has_heartrate) {
    const profile = await d
      .prepare("SELECT lthr, max_hr, goal_seconds FROM profiles WHERE user_id = ?")
      .get(userId) as { lthr: number | null; max_hr: number | null; goal_seconds: number } | undefined;
    if (profile?.lthr && profile.max_hr) {
      const streams = await getStreams(userId, a.id);
      if (streams?.heartrate?.data && streams.time?.data) {
        const zones = buildZones(
          profile.lthr,
          profile.max_hr,
          thresholdPaceFromGoal(profile.goal_seconds),
        );
        zoneJson = JSON.stringify(
          zoneSeconds(streams.heartrate.data, streams.time.data, zones),
        );
      }
    }
  }

  if (existing) {
    await d.prepare(
      `UPDATE activities SET name = ?, distance_m = ?, moving_time_s = ?, elapsed_time_s = ?,
         average_hr = ?, max_hr = ?, average_cadence = ?, total_elevation_m = ?,
         zone_seconds_json = COALESCE(?, zone_seconds_json), raw = ?
       WHERE id = ?`,
    ).run(
      a.name,
      a.distance,
      a.moving_time,
      a.elapsed_time,
      a.average_heartrate ?? null,
      a.max_heartrate ?? null,
      a.average_cadence ? a.average_cadence * 2 : null,
      a.total_elevation_gain ?? null,
      zoneJson,
      JSON.stringify(a),
      existing.id,
    );
    return null;
  }

  const info = await d
    .prepare(
      `INSERT INTO activities
        (user_id, provider, external_id, name, start_date, distance_m, moving_time_s, elapsed_time_s,
         average_hr, max_hr, average_cadence, total_elevation_m, type, zone_seconds_json, raw)
       VALUES (?, 'strava', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      String(a.id),
      a.name,
      a.start_date,
      a.distance,
      a.moving_time,
      a.elapsed_time,
      a.average_heartrate ?? null,
      a.max_heartrate ?? null,
      a.average_cadence ? a.average_cadence * 2 : null,
      a.total_elevation_gain ?? null,
      a.sport_type || a.type,
      zoneJson,
      JSON.stringify(a),
    );
  return Number(info.lastInsertRowid);
}

/**
 * Pull every run posted since the last sync (the polling fallback the webhook
 * makes unnecessary, and the path used for the initial history import).
 */
export async function syncActivities(
  userId: number,
  sinceEpoch?: number,
): Promise<{ imported: number; scanned: number }> {
  const d = getDb();
  const since =
    sinceEpoch ??
    (await (async () => {
      const row = await d
        .prepare(
          "SELECT MAX(start_date) AS latest FROM activities WHERE user_id = ? AND provider = 'strava'",
        )
        .get(userId) as { latest: string | null };
      if (row.latest) return Math.floor(new Date(row.latest).getTime() / 1000);
      const days = Number(process.env.STRAVA_HISTORY_DAYS ?? 180);
      return Math.floor(Date.now() / 1000) - days * 86400;
    })());

  let imported = 0;
  let scanned = 0;
  for (let page = 1; page <= 10; page++) {
    const batch = await listActivities(userId, since, page);
    scanned += batch.length;
    for (const a of batch) {
      if (!isRun(a)) continue;
      const id = await importActivity(userId, a);
      if (id !== null) imported++;
    }
    if (batch.length < 100) break;
  }
  await d.prepare(
    `INSERT INTO sync_state (user_id, provider, last_sync, last_error) VALUES (?, 'strava', datetime('now'), NULL)
     ON CONFLICT(user_id, provider) DO UPDATE SET last_sync = excluded.last_sync, last_error = NULL`,
  ).run(userId);
  return { imported, scanned };
}

/* ---------- webhook subscription management ---------- */

export async function createSubscription(callbackUrl: string) {
  const cfg = stravaConfig();
  if (!cfg) throw new Error("Strava is not configured");
  const res = await fetch(`${API}/push_subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      callback_url: callbackUrl,
      verify_token: cfg.verifyToken,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Subscription create failed: ${res.status} ${body}`);
  return JSON.parse(body);
}

export async function viewSubscription() {
  const cfg = stravaConfig();
  if (!cfg) throw new Error("Strava is not configured");
  const p = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret });
  const res = await fetch(`${API}/push_subscriptions?${p}`);
  if (!res.ok) throw new Error(`Subscription view failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function deleteSubscription(id: number) {
  const cfg = stravaConfig();
  if (!cfg) throw new Error("Strava is not configured");
  const p = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret });
  const res = await fetch(`${API}/push_subscriptions/${id}?${p}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Subscription delete failed: ${res.status} ${await res.text()}`);
  }
  return true;
}
