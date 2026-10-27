import { getSessionUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/household";
import { getJob } from "@/lib/import/jobs";

/** Job status and draft for the review screen's polling (PRD 7.1, 9.1). */
export async function GET(_request: Request, ctx: RouteContext<"/api/import/[id]">) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  const membership = await getMembership(user.id);
  const { id } = await ctx.params;
  const job = membership ? await getJob(membership.householdId, id) : null;
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(
    { id: job.id, status: job.status, error: job.error, attempts: job.attempts, draft: job.status === "ready" ? job.draft : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
