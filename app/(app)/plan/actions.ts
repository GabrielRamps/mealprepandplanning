"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createList } from "@/lib/grocery/lists";
import { getMembers, requireHousehold } from "@/lib/household";
import {
  addEntry,
  copyPreviousWeek,
  ensurePlan,
  getPlan,
  getWeekPlan,
  planPicks,
  removeEntry,
  reviewPlan,
  sendPlan,
  updateEntry,
  type WeekPlan,
} from "@/lib/plan/plans";
import { canEdit, canReview, canSend } from "@/lib/plan/rules";
import { inWeek, isWeekStart, MEAL_SLOTS, weekListName } from "@/lib/plan/week";
import { activeRecipe } from "@/lib/recipes";

export type PlanResult = { error?: string };

const Servings = z.number().positive("Servings must be more than 0").max(200, "At most 200 servings");
const Note = z
  .string()
  .trim()
  .max(200, "Keep the note under 200 characters")
  .transform((s) => s || null)
  .nullable();

const NewEntry = z.object({
  weekStart: z.string().refine(isWeekStart),
  day: z.string(),
  slot: z.enum(MEAL_SLOTS),
  recipeId: z.uuid(),
  servings: Servings,
  note: Note,
});

async function partnerName(householdId: string, userId: string): Promise<string> {
  const others = (await getMembers(householdId)).filter((m) => m.userId !== userId);
  return others.length === 1 ? others[0].displayName.split(/\s+/)[0] : "your partner";
}

async function lockedError(plan: WeekPlan, householdId: string, userId: string): Promise<string | null> {
  if (canEdit(plan, userId)) return null;
  return `Waiting for ${await partnerName(householdId, userId)} to review. They can change it, or answer first.`;
}

function refresh(weekStart: string) {
  revalidatePath(`/plan/${weekStart}`);
}

/** addPlanEntry (PRD 9.2). */
export async function addPlanEntryAction(input: z.input<typeof NewEntry>): Promise<PlanResult> {
  const { user, membership } = await requireHousehold();
  const parsed = NewEntry.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { weekStart, day, slot, recipeId, servings, note } = parsed.data;
  if (!inWeek(weekStart, day)) return { error: "Pick a day in this week." };
  if (!(await activeRecipe(membership.householdId, recipeId))) return { error: "That recipe isn't in your library anymore." };

  const current = await getWeekPlan(membership.householdId, weekStart);
  const locked = await lockedError(current, membership.householdId, user.id);
  if (locked) return { error: locked };

  const plan = await ensurePlan(membership.householdId, weekStart);
  await addEntry(plan.id, { day, slot, recipeId, servings, note });
  refresh(weekStart);
  return {};
}

async function requirePlan(planId: string) {
  const ctx = await requireHousehold();
  const plan = await getPlan(ctx.membership.householdId, planId);
  if (!plan) notFound();
  return { ...ctx, plan };
}

const EntryPatch = z.object({ servings: Servings, note: Note });

/** updatePlanEntry: servings and note. */
export async function updatePlanEntryAction(
  planId: string,
  entryId: string,
  patch: z.input<typeof EntryPatch>,
): Promise<PlanResult> {
  const { user, membership, plan } = await requirePlan(planId);
  const parsed = EntryPatch.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const locked = await lockedError(plan, membership.householdId, user.id);
  if (locked) return { error: locked };
  if (!(await updateEntry(plan.id, entryId, parsed.data))) return { error: "That meal was already removed." };
  refresh(plan.weekStart);
  return {};
}

export async function removePlanEntryAction(planId: string, entryId: string): Promise<PlanResult> {
  const { user, membership, plan } = await requirePlan(planId);
  const locked = await lockedError(plan, membership.householdId, user.id);
  if (locked) return { error: locked };
  await removeEntry(plan.id, entryId);
  refresh(plan.weekStart);
  return {};
}

/** copyPreviousWeek: only into an empty week, so nothing is doubled by accident. */
export async function copyPreviousWeekAction(weekStart: string): Promise<PlanResult> {
  const { user, membership } = await requireHousehold();
  if (!isWeekStart(weekStart)) return { error: "That isn't a week." };
  const current = await getWeekPlan(membership.householdId, weekStart);
  if (current.entries.length) return { error: "This week already has meals." };
  const locked = await lockedError(current, membership.householdId, user.id);
  if (locked) return { error: locked };
  const copied = await copyPreviousWeek(membership.householdId, weekStart);
  if (!copied) return { error: "Last week has no meals to copy." };
  refresh(weekStart);
  return {};
}

/** sendPlan (D2). */
export async function sendPlanAction(planId: string): Promise<PlanResult> {
  const { user, plan } = await requirePlan(planId);
  if (!canSend(plan, plan.entries.length)) return { error: "Add a meal before sending, or wait for the current review." };
  await sendPlan(plan.id, user.id);
  refresh(plan.weekStart);
  return {};
}

/** approvePlan (D3). */
export async function approvePlanAction(planId: string): Promise<PlanResult> {
  const { user, plan } = await requirePlan(planId);
  if (!canReview(plan, user.id) || !(await reviewPlan(plan.id, user.id, { approve: true }))) {
    return { error: "This plan isn't waiting for your approval." };
  }
  refresh(plan.weekStart);
  return {};
}

const ChangeNote = z.string().trim().min(1, "Say what to change").max(500, "Keep it under 500 characters");

/** requestPlanChanges(note) (D3): back to draft, note shown to the sender. */
export async function requestPlanChangesAction(planId: string, note: string): Promise<PlanResult> {
  const parsed = ChangeNote.safeParse(note);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { user, plan } = await requirePlan(planId);
  if (!canReview(plan, user.id) || !(await reviewPlan(plan.id, user.id, { approve: false, note: parsed.data }))) {
    return { error: "This plan isn't waiting for your review." };
  }
  refresh(plan.weekStart);
  return {};
}

/** createListFromPlan (E1): every entry's recipe and servings, from an approved week. */
export async function createListFromPlanAction(planId: string): Promise<PlanResult> {
  const { user, membership, plan } = await requirePlan(planId);
  if (plan.status !== "approved") return { error: "Approve the week first, then make its list." };
  const picks = planPicks(plan);
  if (!picks.length) return { error: "This week has no recipes to shop for." };
  const listId = await createList({
    householdId: membership.householdId,
    userId: user.id,
    name: weekListName(plan.weekStart),
    picks,
    mealPlanId: plan.id,
  });
  revalidatePath("/lists");
  redirect(`/lists/${listId}`);
}

