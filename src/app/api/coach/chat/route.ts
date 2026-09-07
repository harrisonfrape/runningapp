import { requireUser } from "@/lib/session";
import { appendMessage, askCoach } from "@/lib/coach";
import { handleError, json } from "@/lib/api";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { message } = (await req.json()) as { message?: string };
    const question = (message ?? "").trim();
    if (!question) return json({ error: "Say something first" }, { status: 400 });

    await appendMessage(user.id, "user", question);
    try {
      const reply = await askCoach(user.id, question);
      await appendMessage(user.id, "coach", reply);
      return json({ ok: true, reply });
    } catch (err) {
      const reply =
        err instanceof Error && err.message.includes("not configured")
          ? "The coaching engine isn't connected yet — add an ANTHROPIC_API_KEY and I'll be right here."
          : "I couldn't reach the coaching engine just now — try again in a moment.";
      await appendMessage(user.id, "coach", reply);
      console.error("[stride] coach", err);
      return json({ ok: false, reply });
    }
  } catch (err) {
    return handleError(err);
  }
}
