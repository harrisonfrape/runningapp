import { requireUser } from "@/lib/session";
import { requestBackfill } from "@/lib/garmin";
import { handleError, json } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { resource = "dailies", days = 90 } = (await req.json().catch(() => ({}))) as {
      resource?: string;
      days?: number;
    };
    const results = await requestBackfill(user.id, resource, days);
    return json({ ok: true, results });
  } catch (err) {
    return handleError(err);
  }
}
