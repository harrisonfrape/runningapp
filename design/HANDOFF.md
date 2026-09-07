[Uploading README.md…]()
# Handoff: Stride — AI Marathon Coach (real Garmin + Strava integrations)

## Overview
Stride is an AI marathon coach for a runner training for the London Marathon (26 Apr 2027, goal 3:30, recent half 1:45). It builds a personalised plan, adapts it after every synced run, and includes HR zones, workout details, progress tracking, recovery monitoring, race readiness, a post-run survey, and an AI coach chat. The bundled prototype simulates all data; this handoff describes building the real product with live Garmin and Strava integrations.

## About the Design Files
`Marathon Coach.dc.html` is a **design reference created in HTML** — a working prototype showing intended look and behavior, not production code. Recreate it in the target codebase's environment (or pick the most appropriate stack if none exists — a React/Next.js web app with a Node backend is a natural fit given OAuth requirements). The `.dc.html` file contains the full template (inline-styled HTML) and a logic class with all demo data, copy, and interaction handlers — treat it as the source of truth for layout, copy, and colors.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interactions are final. Recreate pixel-perfectly.

## Design Tokens (dark theme)
- Page background: #121814 · Card: #1C2620 · Card border: #2E3B33 · Raised/hover: #26302A
- Text primary: #E8EDE9 · Secondary: #A9B7AE · Muted: #8A968D
- Accent green (buttons/brand): #1F4D3A (hover #16382A) · Accent text/mint: #7FB89A · User chat bubble: #2E6B4F
- Success surface: #1F3A2D (border #2E5240) · Warning: #E3B34C on #3A311A / card #332B18 (border #4D3F1E)
- Zone colors: Z1 #B9C7BE, Z2 #7FB89A, Z3 #E3B34C, Z4 #D97B4F, Z5 #C24A3D
- Brand chips: Garmin #0A2540, Strava #FC4C02 (Strava badge bg #3A241A)
- Today-card highlight: bg #243129, border #7FB89A
- Fonts: 'Spectral' (serif, headings, weight 500) + 'Public Sans' (UI). Radii: cards 12–16px, buttons 8–10px.

## Screens
All screens live in one app shell: sticky header with logo, tab nav (Plan, Today's workout, HR zones, Progress, Recovery, Race readiness, Run log, Coach) and a "Sync Strava" button.

1. **Onboarding (3 steps)** — goal confirmation; connect Garmin + Strava (OAuth dialogs); HR zone review. Continue is disabled until both providers connect.
2. **Plan** — 7-day week grid with prev/next week navigation (arrows), phase label, and a block-overview table (Base → Build → Strength → Sharpen → Peak 90–100 km → Taper). Adapted sessions carry an amber ADAPTED badge; every day card is clickable.
3. **Today's workout / day detail** — segments list (warm-up, reps, recoveries, cool-down) with per-segment pace/zone targets, plus a dark SESSION TARGETS panel (distance, duration, zone, HR, pace) and a coach note. Upcoming days are labeled "UPCOMING".
4. **HR zones** — 5 zones anchored to LTHR (prototype: 168 bpm, max 192) with bpm ranges, pace ranges, purpose. Must recalibrate from real watch data.
5. **Progress** — 8 stat cards (weekly volume, avg easy-run HR, threshold pace, plan adherence, resting HR, VO2 max, 7-day training load, cadence), weekly-volume bar chart, recent runs table with STRAVA badges.
6. **Recovery** — recovery score panel, 4 metric cards (sleep, sleep score, HRV, body battery), 7-night sleep chart, and an auto-adjustment card: poor recovery softens the next day's session (injury prevention).
7. **Race readiness** — projected finish time, readiness % bar, days to race, factors table (recent half, threshold pace, this week's + 4-week volume, long-run endurance, goal pace vs threshold), milestone cards (10K time trial, tune-up half, 32 km dress rehearsal).
8. **Run log** — list of past runs with feedback status; run detail shows watch data plus a survey: overall feel (Great/Good/OK/Rough), RPE 1–10, free-text notes. Survey answers feed the adaptation algorithm.
9. **Coach chat** — chat UI with typing indicator; user bubbles right/green, coach bubbles left/grey.

## Integrations to build (the core of this handoff)

### Strava (activity ingest — drives plan adaptation)
- OAuth 2.0 authorization code flow (`https://www.strava.com/oauth/authorize`, scopes `activity:read_all`). Store refresh tokens server-side; refresh access tokens on expiry.
- Subscribe to Strava **webhook events** so every posted run arrives immediately; fall back to polling `/athlete/activities`.
- On each new run: pull distance, moving time, splits, average/max HR, cadence; run the adaptation engine; surface changes as ADAPTED badges + a coach explanation message (see Behavior below).

### Garmin (physiology + recovery)
- Garmin Health API / Connect Developer Program (requires an approved developer account). Pull: workouts, HR time series, resting HR, HRV (overnight), sleep duration + sleep score, body battery, VO2 max.
- Recompute HR zones when LTHR/max HR estimates move.
- Nightly recovery check: if HRV is meaningfully below baseline or sleep is short (prototype heuristic: HRV −14 ms vs baseline, sleep < ~6.5h), soften the next day's session (cap HR, trim volume) and show the amber "Tomorrow's session softened" card.

### AI coach
- The prototype calls an LLM with a rich system prompt (see `coachSystem()` in the logic class — reuse it verbatim as a starting point). Persona: 30-year veteran coach; one clear recommendation; no hedging; precise physiology. Inject live athlete state (current week, recent runs, recovery, survey feedback) into the prompt.
- Production: server-side Anthropic API call; keep chat history per user.

## Interactions & Behavior
- **Sync flow**: new Strava run → adaptation engine compares actual vs planned (e.g. avg HR 152 on a Z2 day) → adjusts upcoming sessions (trim reps, cap HR, extend long run when aerobic load is absorbed well) → green banner ("Plan updated…"), ADAPTED badges on changed days, and an auto coach chat message explaining each change.
- **Week navigation**: future weeks are projections labeled "Projected — will adjust to how the weeks before actually go."
- **Day cards**: click → that day's full workout detail. "Today's workout" tab resets to today.
- **Survey**: saving marks the run "LOGGED ✓" and the feedback weighs into adaptation (e.g. high RPE on an easy run → same signal as elevated HR).
- **OAuth dialogs** (prototype simulates): branded header, signed-in account row, scope list, Cancel/Authorize, busy state ~1.3s.
- Chat: Enter sends; typing indicator pulses while awaiting the model.

## State Management
Per-user server state: athlete profile (goal race/time, LTHR, max HR), plan (36 weeks, phase structure), per-day workouts with adapted flags + reasons, activities (from Strava/Garmin), recovery metrics history, surveys keyed by activity, chat history, OAuth tokens. Client state mirrors the prototype's logic class: active tab, selected week/day, selected run, survey draft, chat input/thinking.

## Assets
No image assets. Fonts via Google Fonts (Spectral, Public Sans). Provider marks (Garmin/Strava) are lettermark placeholders in the prototype — use official brand assets per each API's brand guidelines in production.

## Files
- `Marathon Coach.dc.html` — the full prototype: template (all screens, inline styles, exact copy) + logic class (demo data, zone tables, plan generator `futureWeek()`, adaptation examples `adaptedWeek()`, workout builder `workoutFromDay()`, coach system prompt `coachSystem()`).
