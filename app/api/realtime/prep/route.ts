import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { isWeekStart } from "@/lib/plan/week";
import { getRealtime, prepChecksLiveQuery, prepWeekLiveQuery } from "@/lib/realtime";

const Monday = z.string().refine(isWeekStart);
const Body = z.union([
  z.object({ kind: z.literal("week"), weekStart: Monday }),
  z.object({ kind: z.literal("checks"), from: Monday, to: Monday }),
]);

// Seals (and renews) Prep live queries: one week's edits, or task check-offs.
// The user comes from the session cookie, never from the request body.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a week (a Monday, YYYY-MM-DD)" }, { status: 400 });

  const query =
    parsed.data.kind === "week"
      ? prepWeekLiveQuery(user.id, parsed.data.weekStart)
      : prepChecksLiveQuery(user.id, parsed.data.from, parsed.data.to);
  const sealed = await getRealtime().seal({ query });
  return Response.json(sealed);
}
