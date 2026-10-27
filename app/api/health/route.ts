import { sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getRealtime, groceryItemsLiveQuery } from "@/lib/realtime";
import {
  BUCKETS,
  deleteObjects,
  getObjectBytes,
  presignedGetUrl,
  publicPhotoUrl,
  putObject,
} from "@/lib/storage";

type Check = { ok: boolean; detail?: unknown; error?: string };

async function run(fn: () => Promise<unknown>): Promise<Check> {
  try {
    return { ok: true, detail: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Signed-in smoke test for every Neon service the app uses. Writes and then
// deletes one small object in each bucket.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });

  const stamp = `${Date.now()}-${crypto.randomUUID()}`;

  const postgres = await run(async () => {
    const db = getDb();
    const now = await db.execute(sql`select now() as now, current_database() as db`);
    const tables = await db.execute(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    const authUsers = await db.execute(sql`select count(*)::int as n from neon_auth."user"`);
    return { ...now.rows[0], publicTables: tables.rows[0]?.n, neonAuthUsers: authUsers.rows[0]?.n };
  });

  const auth: Check = { ok: true, detail: { userId: user.id, email: user.email } };

  const privateBucket = await run(async () => {
    const key = `healthchecks/${user.id}/${stamp}.txt`;
    const body = `private ${stamp}`;
    await putObject(BUCKETS.imports, key, body, "text/plain");
    const readBack = new TextDecoder().decode(await getObjectBytes(BUCKETS.imports, key));
    const signed = await presignedGetUrl(BUCKETS.imports, key, 60);
    const viaPresigned = await fetch(signed).then((r) => r.text());
    const anonymous = await fetch(signed.split("?")[0]).then((r) => r.status);
    await deleteObjects(BUCKETS.imports, [key]);
    if (readBack !== body || viaPresigned !== body) throw new Error("Read-back mismatch");
    if (anonymous < 400) throw new Error(`Private object readable anonymously (${anonymous})`);
    return { bucket: BUCKETS.imports, roundTrip: true, presignedRead: true, anonymousStatus: anonymous };
  });

  const publicBucket = await run(async () => {
    const key = `healthchecks/${user.id}/${stamp}.txt`;
    const body = `public ${stamp}`;
    await putObject(BUCKETS.photos, key, body, "text/plain");
    const res = await fetch(publicPhotoUrl(key));
    const text = await res.text();
    await deleteObjects(BUCKETS.photos, [key]);
    if (!res.ok || text !== body) throw new Error(`Anonymous read failed (${res.status})`);
    return { bucket: BUCKETS.photos, anonymousRead: true };
  });

  const realtime = await run(async () => {
    const sealed = await getRealtime().seal({
      query: groceryItemsLiveQuery(user.id, crypto.randomUUID()),
    });
    return {
      sealed: typeof sealed.capability === "string" && sealed.capability.length > 0,
      expiresInSec: Math.round((sealed.expiresAt - Date.now()) / 1000),
      browserUrlConfigured: Boolean(process.env.NEXT_PUBLIC_NEON_REALTIME_URL),
    };
  });

  const checks = { postgres, auth, privateBucket, publicBucket, realtime };
  const ok = Object.values(checks).every((c) => c.ok);
  return Response.json({ ok, checks }, { status: ok ? 200 : 500 });
}
