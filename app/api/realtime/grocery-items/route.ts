import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { getRealtime, groceryItemsLiveQuery } from "@/lib/realtime";

const Body = z.object({ listId: z.uuid() });

// Seals (and renews) the live query for one grocery list. The user comes from
// the session cookie, never from the request body.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "listId must be a UUID" }, { status: 400 });

  const sealed = await getRealtime().seal({ query: groceryItemsLiveQuery(user.id, parsed.data.listId) });
  return Response.json(sealed);
}
