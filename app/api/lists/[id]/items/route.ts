import { itemsSince, listInHousehold } from "@/lib/grocery/lists";
import { getMembership } from "@/lib/household";
import { getSessionUser } from "@/lib/auth/server";

/**
 * Polling fallback (PRD 9.1): items changed since `since`, every current id
 * (so deleted items drop off), and the server time to send back next time.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/lists/[id]/items">) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  const membership = await getMembership(user.id);
  const { id } = await ctx.params;
  if (!membership || !(await listInHousehold(membership.householdId, id))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  if (since && Number.isNaN(since.getTime())) {
    return Response.json({ error: "since must be an ISO time" }, { status: 400 });
  }

  const now = new Date();
  const { items, ids } = await itemsSince(id, since);
  return Response.json({ now: now.toISOString(), items, ids }, { headers: { "Cache-Control": "no-store" } });
}
