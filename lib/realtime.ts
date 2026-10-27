import "server-only";
import { createRealtime, rawSql, type RawSqlQuery, type RealtimeServer } from "@neon/realtime/server";

// Server-side Realtime: seals live queries for the browser. The secret never
// leaves the server; the browser only gets NEXT_PUBLIC_NEON_REALTIME_URL.
let instance: RealtimeServer<RawSqlQuery<unknown>> | undefined;

function databaseName(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

export function getRealtime(): RealtimeServer<RawSqlQuery<unknown>> {
  if (!instance) {
    const secret = process.env.NEON_REALTIME_SECRET;
    if (!secret) throw new Error("NEON_REALTIME_SECRET is not set");
    instance = createRealtime({
      secret,
      db: databaseName(),
      debugMode: process.env.NODE_ENV !== "production",
    });
  }
  return instance;
}

/** Row shape of a live grocery item. numeric and timestamptz arrive as strings. */
export type LiveGroceryItem = {
  id: string;
  list_id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  aisle: string;
  is_pantry: boolean;
  is_manual: boolean;
  is_checked: boolean;
  checked_by: string | null;
  position: number;
  updated_at: string;
};

/**
 * Items on one list, authorized live through household membership: if the
 * user leaves the household, the rows drop out of the subscription.
 */
export function groceryItemsLiveQuery(userId: string, listId: string) {
  return rawSql<LiveGroceryItem>(
    `SELECT gi.id, gi.list_id, gi.name, gi.quantity, gi.unit, gi.aisle, gi.is_pantry,
       gi.is_manual, gi.is_checked, gi.checked_by, gi.position, gi.updated_at
     FROM grocery_items gi
     INNER JOIN grocery_lists gl ON gl.id = gi.list_id
     INNER JOIN household_members hm ON hm.household_id = gl.household_id
     WHERE hm.user_id = $1 AND gi.list_id = $2::uuid
     ORDER BY gi.position, gi.id`,
    [userId, listId],
  );
}
