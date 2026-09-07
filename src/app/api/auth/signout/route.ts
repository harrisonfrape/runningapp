import { clearSession } from "@/lib/session";
import { json } from "@/lib/api";

export async function POST() {
  await clearSession();
  return json({ ok: true });
}
