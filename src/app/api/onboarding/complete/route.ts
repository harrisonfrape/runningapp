import { requireUser } from "@/lib/session";
import { completeOnboarding } from "@/lib/onboard";
import { handleError, json } from "@/lib/api";

export async function POST() {
  try {
    const user = await requireUser();
    completeOnboarding(user.id);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
