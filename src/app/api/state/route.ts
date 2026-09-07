import { requireUser } from "@/lib/session";
import { buildState } from "@/lib/state";
import { handleError, json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return json(buildState(user.id, { name: user.name, email: user.email }));
  } catch (err) {
    return handleError(err);
  }
}
