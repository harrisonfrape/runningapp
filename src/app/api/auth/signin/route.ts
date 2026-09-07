import { setSession, upsertUser } from "@/lib/session";
import { handleError, json } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; name?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Enter a valid email address" }, { status: 400 });
    }
    const name = (body.name ?? "").trim() || email.split("@")[0];
    const user = await upsertUser(email, name);
    await setSession(user.id);
    return json({ ok: true, user });
  } catch (err) {
    return handleError(err);
  }
}
