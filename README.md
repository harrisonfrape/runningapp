# Stride — AI marathon coach

A marathon coach that builds a plan from your real training history, reshapes it after every
run you post to Strava, softens sessions when Garmin says you haven't recovered, and explains
every change in the coach's own words.

Built to the design in [`design/Marathon Coach.dc.html`](design/Marathon%20Coach.dc.html); the
original handoff brief is kept at [`design/HANDOFF.md`](design/HANDOFF.md).

## Stack

- **Next.js 15** (App Router) + React 19, TypeScript
- **SQLite** via `better-sqlite3` — per-user plans, activities, recovery, surveys, chat, tokens
- **Strava API** — OAuth 2.0, webhook event subscription, activity + stream ingest
- **Garmin Health API** — OAuth 2.0 with PKCE, push notifications, backfill, pull fallback
- **Anthropic API** (`claude-opus-5`) — the coach chat, with live athlete state in the prompt

No demo data anywhere: every number on every screen is computed from what the providers return.

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in the values below
npm run dev                    # http://localhost:3000
```

Sign in with an email address, then work through onboarding: confirm the goal, connect Garmin
and Strava, review the heart-rate zones, and the plan is generated from your Strava history.

For local work without provider credentials, set `ALLOW_SKIP_CONNECT=true` to let onboarding
past the connect step. The app then runs with an empty history until you connect something.

## Provider setup

### Strava

1. Create an application at <https://www.strava.com/settings/api>.
2. Set **Authorization Callback Domain** to the host of your `APP_URL` (e.g. `stride.example.com`,
   or `localhost` in development).
3. Put the client id and secret in `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`.
4. Stride requests the `activity:read_all` scope — the athlete must leave every box ticked, or
   private runs never arrive. The callback checks this and says so if a scope is missing.
5. Create the webhook subscription once the app is deployed and publicly reachable:

   ```bash
   npm run strava:subscribe      # POSTs the callback URL to Strava
   npm run strava:subscription   # shows the current subscription
   npm run strava:unsubscribe -- <id>
   ```

   Strava immediately GETs `APP_URL/api/strava/webhook` with a `hub.challenge`, which the route
   echoes back when `hub.verify_token` matches `STRAVA_VERIFY_TOKEN`. From then on every posted
   run arrives as a POST within seconds: the event is stored, acknowledged inside Strava's
   two-second window, then the activity is fetched, imported, and run through the adaptation
   engine. `POST /api/strava/sync` (the "Sync Strava" button) is the polling fallback and the
   path used for the initial history import.

### Garmin

Garmin Health API access requires an approved account in the
[Connect Developer Program](https://developer.garmin.com/gc-developer-program/) — apply first;
there is no self-serve key.

1. Register `APP_URL/api/garmin/callback` as the OAuth redirect URI.
2. Register `APP_URL/api/garmin/webhook` as the push notification endpoint for the summary types
   you are granted (dailies, sleeps, HRV, user metrics).
3. Put the consumer key and secret in `GARMIN_CLIENT_ID` / `GARMIN_CLIENT_SECRET`.

The connect flow is OAuth 2.0 with PKCE (`connect.garmin.com/oauth2Confirm` →
`diauth.garmin.com/di-oauth2-service/oauth/token`), after which Stride reads the athlete's Garmin
user id and keys push notifications on it. On connect it requests a 90-day backfill of dailies and
sleeps and pulls whatever Garmin already holds. Access tokens refresh automatically.

Garmin only retains seven days of data, so `scripts/nightly.ts` should run daily.

### The coach

Set `ANTHROPIC_API_KEY`. The coach runs `claude-opus-5` with adaptive thinking, and the persona
prompt is regenerated on every message with the athlete's live state — this week's sessions and
which were adapted and why, the last eight runs with heart rate and survey feedback, last night's
sleep and HRV against baseline, adherence, zones, and the current finish projection. Without a key
the chat says so plainly rather than pretending.

## How the plan works

**Generation** (`src/lib/plan.ts`). Weeks are counted back from race day and mapped onto the
canonical phase shape (Prep → Base → Build → Strength → Sharpen → Peak → Taper), scaled to
however many weeks the athlete actually has. Volume starts at their real four-week Strava average
and ramps to a peak that is the lower of what the goal time needs and what a safe ~5.5%/week build
can reach, with a down week every fourth week and a three-week taper. The long run's share of the
week climbs through the block and is capped at 32 km. Interval sessions carry a whole number of
reps, and the session distance is whatever those reps plus warm-up and cool-down come to.

**Adaptation** (`src/lib/adapt.ts`) runs after every new activity, every recovery update, and every
survey. Four rules, in priority order, each of which records the reason that produced it:

1. **Poor overnight recovery** (HRV ≥10 ms below the 30-day baseline, or under 6.5 h sleep, or a
   recovery score below 65) softens tomorrow — a quality session becomes an easy run, an easy run
   is trimmed and heart-rate capped.
2. **A run that came in hot** — average heart rate above the Zone 2 ceiling on an easy day, or
   RPE ≥7 / "Rough" in the survey — drops a rep from the next quality session and puts a heart-rate
   cap on the next easy run.
3. **Load absorbed well** — last week's adherence ≥90%, easy heart rate inside Zone 2, recovery
   fine — pulls the long-run progression forward by up to 10%.
4. **Adherence under 60%** eases next week's volume by 10%.

No session is changed by more than one rule per pass. Each pass writes an `adaptations` row (the
green banner), sets the ADAPTED badge and reason on each changed day, and posts a coach message
that attributes each change to the signal that caused it.

**Zones** (`src/lib/zones.ts`) are a five-zone LTHR model with contiguous bpm bands and pace bands
anchored on the athlete's measured threshold pace. Max HR is recalibrated from watch data after
every sync, and LTHR follows it.

**Race readiness** (`src/lib/metrics.ts`) projects the finish with Riegel from the best recent
effort, and blends speed evidence, four-week volume, long-run endurance and consistency into the
readiness percentage.

## Scheduled work

```
0 5 * * *   cd /srv/stride && npm run nightly
```

Pulls Garmin recovery for every connected athlete, polls Strava as a webhook fallback,
recalibrates zones, and runs the adaptation engine.

On a host with no cron shell (Vercel and friends), `POST /api/cron/nightly` does the same work.
It is guarded by `CRON_SECRET` and expects that value as a bearer token:

```
curl -X POST https://stride.example.com/api/cron/nightly \
  -H "Authorization: Bearer $CRON_SECRET"
```

The route refuses to run at all when `CRON_SECRET` is unset, so an unconfigured deployment
cannot be triggered by anyone who finds the URL.

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/auth/signin`, `/signout` | Session cookie (HMAC-signed) |
| `GET /api/state` | Everything the client renders |
| `POST /api/onboarding/complete` | Estimate zones, build the plan, greet the athlete |
| `POST /api/profile` | Change race, date, goal time, zone anchors; rebuilds the plan |
| `GET /api/strava/authorize`, `/callback` | OAuth 2.0 code flow + history import |
| `POST /api/strava/sync` | Manual/polling activity sync |
| `GET|POST /api/strava/webhook` | Subscription validation + event delivery |
| `GET|POST|DELETE /api/strava/subscription` | Manage the push subscription |
| `GET /api/garmin/authorize`, `/callback` | OAuth 2.0 + PKCE, backfill request |
| `POST /api/garmin/sync`, `/backfill` | Manual recovery pull, historic replay |
| `POST /api/garmin/webhook` | Health API push notifications |
| `GET /api/workout?date=` | Full session detail for one day |
| `GET /api/runs/[id]`, `POST /api/runs/[id]/survey` | Watch data and post-run survey |
| `POST /api/coach/chat` | The coach |
| `POST /api/plan/rebuild`, `/api/banner/dismiss` | Regenerate the plan, dismiss the banner |

## Environment

See [`.env.example`](.env.example). `APP_URL` must be the exact public origin the OAuth redirect
URIs are registered against, and must be reachable for webhooks to arrive. `APP_SECRET` (32+ random
characters) is required in production.

## Notes on fidelity

The screens, copy, colours and interactions follow the prototype. Two things deliberately differ,
because the prototype's numbers were demo data:

- **Volume numbers come from the athlete.** The prototype's block table starts prep at ~21 km/week
  for a runner averaging 10 km. Stride starts from the real four-week average and ramps within a
  safe weekly increase, so an athlete's first week is not double their current load.
- **The OAuth dialogs are real.** The branded consent sheet with its scope list is kept, but
  authorising leaves for Strava or Garmin Connect instead of simulating a 1.3-second pause.
