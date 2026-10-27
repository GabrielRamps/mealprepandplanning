import "server-only";
import { neon } from "@neondatabase/serverless";
import { attachDatabasePool } from "@vercel/functions";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle as drizzleHttp, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

// On Vercel (Fluid compute) the Neon guidance is node-postgres with a pooled
// DATABASE_URL and attachDatabasePool, so idle clients close before the
// instance suspends. DATABASE_DRIVER=neon-http switches to the HTTP driver for
// sandboxes with no outbound TCP (such as the Claude Code cloud container);
// that driver has no interactive transactions.
function createDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (process.env.DATABASE_DRIVER === "neon-http") {
    return drizzleHttp(neon(url), { schema }) as unknown as Database;
  }

  // Neon URLs say sslmode=require; verify-full keeps the same checks without pg's warning.
  const connectionString = url.replace("sslmode=require", "sslmode=verify-full");
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 5_000 });
  // An idle client error (e.g. the compute scaling to zero) must not crash the function.
  pool.on("error", (err) => console.error("pg pool error", err));
  attachDatabasePool(pool);
  return drizzlePg(pool, { schema });
}

const globalForDb = globalThis as unknown as { __db?: Database };

export function getDb(): Database {
  globalForDb.__db ??= createDb();
  return globalForDb.__db;
}

/** A write statement built from the handle `atomic` passes in. */
export type Statement = BatchItem<"pg">;

/**
 * Runs writes all-or-nothing: one transaction over TCP, or one batch request
 * over Neon HTTP (which has no interactive transactions). `build` gets the
 * handle to write through and returns the statements in order, so the writes
 * can't depend on each other's results; generate ids up front instead.
 */
export async function atomic(build: (q: Database) => Statement[]): Promise<void> {
  const db = getDb();
  if (process.env.DATABASE_DRIVER === "neon-http") {
    const statements = build(db);
    if (statements.length === 0) return;
    await (db as unknown as NeonHttpDatabase<typeof schema>).batch(statements as [Statement, ...Statement[]]);
    return;
  }
  await db.transaction(async (tx) => {
    for (const statement of build(tx as unknown as Database)) await (statement as unknown as PromiseLike<unknown>);
  });
}

export { schema };
