import { getDb } from "./db";
import type { TuneUpRace } from "./types";

interface Row {
  id: number;
  name: string;
  date: string;
  distance_km: number;
  goal_seconds: number | null;
}

export async function listRaces(userId: number): Promise<TuneUpRace[]> {
  const rows = (await getDb()
    .prepare(
      "SELECT id, name, date, distance_km, goal_seconds FROM tune_up_races WHERE user_id = ? ORDER BY date",
    )
    .all(userId)) as Row[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    date: r.date,
    distanceKm: r.distance_km,
    goalSeconds: r.goal_seconds,
  }));
}

export async function addRace(
  userId: number,
  race: { name: string; date: string; distanceKm: number; goalSeconds: number | null },
): Promise<void> {
  // One race per date: entering the same day twice is a correction, not a
  // second race, and the plan can only taper into one of them.
  await getDb()
    .prepare(
      `INSERT INTO tune_up_races (user_id, name, date, distance_km, goal_seconds)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
         name = excluded.name,
         distance_km = excluded.distance_km,
         goal_seconds = excluded.goal_seconds`,
    )
    .run(userId, race.name, race.date, race.distanceKm, race.goalSeconds);
}

export async function deleteRace(userId: number, id: number): Promise<void> {
  await getDb().prepare("DELETE FROM tune_up_races WHERE user_id = ? AND id = ?").run(userId, id);
}
