import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { handleError, json } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { id } = (await req.json()) as { id?: number };
    await getDb()
      .prepare("UPDATE adaptations SET dismissed = 1 WHERE user_id = ? AND (? IS NULL OR id = ?)")
      .run(user.id, id ?? null, id ?? null);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
