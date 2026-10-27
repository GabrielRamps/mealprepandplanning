import "server-only";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser, type SessionUser } from "@/lib/auth/server";
import { getDb, schema } from "@/lib/db";
import { generateInviteCode, inviteExpiry } from "@/lib/invite-code";

const { households, householdMembers } = schema;

export const MAX_HOUSEHOLD_MEMBERS = 6;

export type Membership = {
  householdId: string;
  householdName: string;
  role: "owner" | "member";
  inviteCode: string | null;
  inviteExpiresAt: Date | null;
};

export type Member = {
  userId: string;
  displayName: string;
  role: "owner" | "member";
};

/** The signed-in user; redirects to sign-in when there is no session. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) redirect("/auth/sign-in");
  return user;
});

/** The user's household, or null before onboarding. A user has at most one. */
export const getMembership = cache(async (userId: string): Promise<Membership | null> => {
  const [row] = await getDb()
    .select({
      householdId: households.id,
      householdName: households.name,
      role: householdMembers.role,
      inviteCode: households.inviteCode,
      inviteExpiresAt: households.inviteExpiresAt,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  return row ? { ...row, role: row.role as Membership["role"] } : null;
});

/** The signed-in user and their household; sends anyone without one to /onboarding. */
export async function requireHousehold(): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await requireUser();
  const membership = await getMembership(user.id);
  if (!membership) redirect("/onboarding");
  return { user, membership };
}

export async function getMembers(householdId: string): Promise<Member[]> {
  const rows = await getDb()
    .select({
      userId: householdMembers.userId,
      displayName: householdMembers.displayName,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(asc(householdMembers.joinedAt));
  return rows.map((r) => ({ ...r, role: r.role as Member["role"] }));
}

/** True for Postgres unique_violation, whether thrown directly or wrapped by Drizzle. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/** Runs `write` with a fresh invite code, retrying if the code is already taken. */
export async function withNewInviteCode<T>(write: (code: string, expiresAt: Date) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write(generateInviteCode(), inviteExpiry());
    } catch (err) {
      if (attempt >= 5 || !isUniqueViolation(err)) throw err;
    }
  }
}
