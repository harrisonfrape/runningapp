import { currentUserId } from "@/lib/session";
import { getDb } from "@/lib/db";
import { buildState } from "@/lib/state";
import App from "@/components/App";
import SignIn from "@/components/SignIn";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await currentUserId();
  if (userId === null) return <SignIn />;

  const user = getDb()
    .prepare("SELECT id, email, name FROM users WHERE id = ?")
    .get(userId) as { id: number; email: string; name: string } | undefined;
  if (!user) return <SignIn />;

  const state = buildState(user.id, { name: user.name, email: user.email });
  return <App initialState={state} />;
}
