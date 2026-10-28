import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { isWeekStart } from "@/lib/plan/week";
import { getRealtime, planLiveQuery } from "@/lib/realtime";

const Body = z.object({ weekStart: z.string().refine(isWeekStart) });

// Seals (and renews) the live query for one week's plan. The user comes from
// the session cookie, never from the request body.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "weekStart must be a Monday (YYYY-MM-DD)" }, { status: 400 });

  const sealed = await getRealtime().seal({ query: planLiveQuery(user.id, parsed.data.weekStart) });
  return Response.json(sealed);
}
