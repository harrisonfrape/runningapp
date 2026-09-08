export type Provider = "strava" | "garmin";

export type SessionType =
  | "rest"
  | "easy"
  | "recovery"
  | "long"
  | "marathon"
  | "hard"
  | "tempo"
  | "tuneup"
  | "race";

export type Phase = "Prep" | "Base" | "Build" | "Strength" | "Sharpen" | "Peak" | "Taper";

export interface AthleteProfile {
  userId: number;
  name: string;
  email: string;
  raceName: string;
  raceDate: string; // ISO yyyy-mm-dd
  goalSeconds: number; // marathon goal time in seconds
  lthr: number | null; // lactate threshold HR
  maxHr: number | null;
  restingHr: number | null;
  vo2max: number | null;
  planStart: string | null; // ISO Monday of week 1
  onboarded: 0 | 1;
}

export interface PlanDay {
  id: number;
  userId: number;
  date: string; // ISO yyyy-mm-dd
  week: number;
  dayIdx: number; // 0 = Monday
  phase: Phase;
  type: SessionType;
  title: string;
  sub: string;
  km: number;
  zone: string; // "Z1".."Z5" or "—"
  adapted: 0 | 1;
  adaptReason: string | null;
  completedActivityId: number | null;
}

export interface Activity {
  id: number;
  userId: number;
  provider: Provider;
  externalId: string;
  name: string;
  startDate: string; // ISO datetime
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  averageHr: number | null;
  maxHr: number | null;
  averageCadence: number | null;
  totalElevationM: number | null;
  type: string;
  zoneSecondsJson: string | null; // {"1":123,...}
  raw: string | null;
}

export interface RecoveryDay {
  userId: number;
  date: string;
  sleepSeconds: number | null;
  sleepScore: number | null;
  hrvMs: number | null;
  bodyBattery: number | null;
  restingHr: number | null;
  vo2max: number | null;
}

export interface Survey {
  activityId: number;
  feel: "Great" | "Good" | "OK" | "Rough";
  rpe: number;
  notes: string;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "coach";
  text: string;
  createdAt: string;
}

export interface Zone {
  key: 1 | 2 | 3 | 4 | 5;
  name: string;
  pct: string;
  purpose: string;
  range: string;
  pace: string;
  color: string;
  lowHr: number;
  highHr: number;
}

/**
 * A race inside the block that is not the goal race — a tune-up half, a 10K,
 * a parkrun effort. The plan tapers into it and recovers out of it, and the
 * result becomes the best anchor the finish projection has.
 */
export interface TuneUpRace {
  id: number;
  name: string;
  date: string;
  distanceKm: number;
  goalSeconds: number | null;
}

/**
 * Common race distances, so the athlete picks one rather than typing a number.
 * Lives here rather than in races.ts because the picker is a client component
 * and races.ts reaches for the database.
 */
export const RACE_DISTANCES: Array<{ label: string; km: number }> = [
  { label: "5K", km: 5 },
  { label: "10K", km: 10 },
  { label: "10 miles", km: 16.09 },
  { label: "Half marathon", km: 21.0975 },
  { label: "20 miles", km: 32.19 },
];
