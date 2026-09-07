import { requireUser } from "@/lib/session";
import { createSubscription, deleteSubscription, viewSubscription } from "@/lib/strava";
import { appUrl, handleError, json } from "@/lib/api";

export async function GET() {
  try {
    await requireUser();
    return json({ subscriptions: await viewSubscription(), callback: `${appUrl()}/api/strava/webhook` });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST() {
  try {
    await requireUser();
    return json(await createSubscription(`${appUrl()}/api/strava/webhook`));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireUser();
    const { id } = (await req.json()) as { id: number };
    await deleteSubscription(id);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
