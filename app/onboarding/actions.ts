"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import {
  getMembership,
  isUniqueViolation,
  MAX_HOUSEHOLD_MEMBERS,
  requireUser,
  withNewInviteCode,
} from "@/lib/household";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite-code";

const { households, householdMembers } = schema;

export type OnboardingState = { error?: string; fieldErrors?: Record<string, string> } | null;

const CreateHousehold = z.object({
  name: z.string().trim().min(1, "Give your household a name").max(80, "Keep the name under 80 characters"),
});

const JoinHousehold = z.object({
  code: z
    .string()
    .transform(normalizeInviteCode)
    .refine(isInviteCode, "Codes are 6 letters and numbers, like K7MP2Q"),
});

function displayName(user: { name: string; email: string }): string {
  return user.name.trim() || user.email.split("@")[0];
}

export async function createHouseholdAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  const parsed = CreateHousehold.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0].message } };
  if (await getMembership(user.id)) redirect("/recipes");

  const db = getDb();
  const householdId = await withNewInviteCode(async (inviteCode, inviteExpiresAt) => {
    const [row] = await db
      .insert(households)
      .values({ name: parsed.data.name, inviteCode, inviteExpiresAt })
      .returning({ id: households.id });
    return row.id;
  });

  try {
    await db
      .insert(householdMembers)
      .values({ householdId, userId: user.id, displayName: displayName(user), role: "owner" });
  } catch (err) {
    // Already in a household (e.g. a double submit won the race): drop this one.
    await db.delete(households).where(eq(households.id, householdId));
    if (!isUniqueViolation(err)) throw err;
  }
  redirect("/recipes");
}

export async function joinHouseholdAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  const parsed = JoinHousehold.safeParse({ code: formData.get("code") ?? "" });
  if (!parsed.success) return { fieldErrors: { code: parsed.error.issues[0].message } };
  if (await getMembership(user.id)) redirect("/recipes");

  const db = getDb();
  const [household] = await db
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.inviteCode, parsed.data.code), gt(households.inviteExpiresAt, new Date())))
    .limit(1);
  if (!household) {
    return { fieldErrors: { code: "That code isn't valid or has expired. Ask for a new one from Settings." } };
  }

  const [{ members }] = await db
    .select({ members: count() })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, household.id));
  if (members >= MAX_HOUSEHOLD_MEMBERS) {
    return { error: `This household already has ${MAX_HOUSEHOLD_MEMBERS} members.` };
  }

  try {
    await db
      .insert(householdMembers)
      .values({ householdId: household.id, userId: user.id, displayName: displayName(user), role: "member" });
  } catch (err) {
    // A unique violation means this user joined a household meanwhile.
    if (!isUniqueViolation(err)) throw err;
  }
  redirect("/recipes");
}
