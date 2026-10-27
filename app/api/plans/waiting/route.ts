import { getSessionUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/household";
import { waitingForUser } from "@/lib/plan/plans";

/** The Plan tab badge (PRD D2): plans waiting for this person's answer. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  const membership = await getMembership(user.id);
  const waiting = membership ? await waitingForUser(membership.householdId, user.id) : { count: 0, weekStart: null };
  return Response.json(waiting, { headers: { "Cache-Control": "no-store" } });
}
