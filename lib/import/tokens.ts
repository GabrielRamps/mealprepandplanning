import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isUuid } from "@/lib/library-filters";

// Personal import tokens for the iPhone Shortcut (PRD F1, 9.2): "mpt_" + 32
// random bytes (base64url). Only the SHA-256 and the first 8 characters are
// kept; the full token is shown once and never logged.

const { importTokens, householdMembers } = schema;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type TokenSummary = { id: string; name: string; prefix: string; lastUsedAt: Date | null; createdAt: Date };

export async function createToken(householdId: string, userId: string, name: string): Promise<{ token: string; summary: TokenSummary }> {
  const token = `mpt_${randomBytes(32).toString("base64url")}`;
  const [row] = await getDb()
    .insert(importTokens)
    .values({ householdId, userId, name, tokenHash: hashToken(token), tokenPrefix: token.slice(0, 8) })
    .returning();
  return {
    token,
    summary: { id: row.id, name: row.name, prefix: row.tokenPrefix, lastUsedAt: row.lastUsedAt, createdAt: row.createdAt },
  };
}

/** This person's live tokens. */
export async function listTokens(householdId: string, userId: string): Promise<TokenSummary[]> {
  const rows = await getDb()
    .select()
    .from(importTokens)
    .where(and(eq(importTokens.householdId, householdId), eq(importTokens.userId, userId), isNull(importTokens.revokedAt)))
    .orderBy(desc(importTokens.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.tokenPrefix, lastUsedAt: r.lastUsedAt, createdAt: r.createdAt }));
}

export async function revokeToken(householdId: string, userId: string, tokenId: string): Promise<void> {
  if (!isUuid(tokenId)) return;
  await getDb()
    .update(importTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(importTokens.id, tokenId), eq(importTokens.householdId, householdId), eq(importTokens.userId, userId)));
}

/**
 * Who a bearer token belongs to: live token, and its owner still a member of
 * that household. Updates last_used_at. Null for anything else (401).
 */
export async function authenticateToken(token: string): Promise<{ userId: string; householdId: string } | null> {
  if (!/^mpt_[\w-]{40,}$/.test(token)) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: importTokens.id, userId: importTokens.userId, householdId: importTokens.householdId })
    .from(importTokens)
    .innerJoin(
      householdMembers,
      and(eq(householdMembers.userId, importTokens.userId), eq(householdMembers.householdId, importTokens.householdId)),
    )
    .where(and(eq(importTokens.tokenHash, hashToken(token)), isNull(importTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db.update(importTokens).set({ lastUsedAt: new Date() }).where(eq(importTokens.id, row.id));
  return { userId: row.userId, householdId: row.householdId };
}
