import { requireUser } from "@/lib/session";
import { addRace, deleteRace, listRaces } from "@/lib/races";
import { buildPlan } from "@/lib/onboard";
import { handleError, json } from "@/lib/api";

/** Parses "1:35:00" / "1:35" into seconds. Blank means "no target yet". */
function parseTime(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const parts = value.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export async function GET() {
  try {
    const user = await requireUser();
    return json({ races: await listRaces(user.id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      name?: string;
      date?: string;
      distanceKm?: number;
      goalTime?: string;
    };
    const name = (body.name ?? "").trim();
    if (!name) return json({ error: "Give the race a name" }, { status: 400 });
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return json({ error: "Race date must be YYYY-MM-DD" }, { status: 400 });
    }
    const distanceKm = Number(body.distanceKm);
    if (!Number.isFinite(distanceKm) || distanceKm < 1 || distanceKm > 100) {
      return json({ error: "Distance must be between 1 and 100 km" }, { status: 400 });
    }
    const goalSeconds = body.goalTime?.trim() ? parseTime(body.goalTime) : null;
    if (body.goalTime?.trim() && goalSeconds === null) {
      return json({ error: "Target time must look like 1:35:00" }, { status: 400 });
    }

    await addRace(user.id, { name, date: body.date, distanceKm, goalSeconds });
    // The block has to taper into the race and recover out of it, which only
    // happens when the plan is regenerated.
    await buildPlan(user.id);
    return json({ ok: true, races: await listRaces(user.id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return json({ error: "Which race?" }, { status: 400 });
    await deleteRace(user.id, id);
    await buildPlan(user.id);
    return json({ ok: true, races: await listRaces(user.id) });
  } catch (err) {
    return handleError(err);
  }
}
