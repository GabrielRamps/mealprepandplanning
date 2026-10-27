import "server-only";
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isUuid } from "@/lib/library-filters";
import { coverUrl } from "@/lib/photos";
import type { PlanStatus } from "@/lib/plan/rules";
import { addDays, type MealSlot } from "@/lib/plan/week";

const { mealPlans, mealPlanEntries, recipes } = schema;

export type PlanEntry = {
  id: string;
  day: string;
  slot: MealSlot;
  recipeId: string;
  recipeTitle: string;
  coverUrl: string | null;
  servings: number;
  note: string | null;
  /** False once the recipe is deleted, disliked or archived; the title still shows (PRD 6). */
  recipeAvailable: boolean;
  recipeDeleted: boolean;
};

export type WeekPlan = {
  id: string | null; // null until the first meal is added
  weekStart: string;
  status: PlanStatus;
  sentBy: string | null;
  reviewedBy: string | null;
  changeNote: string | null;
  entries: PlanEntry[];
};

/** A plan that exists in the database. */
export type SavedPlan = WeekPlan & { id: string };

type PlanRow = typeof mealPlans.$inferSelect;

async function entriesFor(planId: string): Promise<PlanEntry[]> {
  const rows = await getDb()
    .select({
      id: mealPlanEntries.id,
      day: mealPlanEntries.day,
      slot: mealPlanEntries.slot,
      recipeId: mealPlanEntries.recipeId,
      recipeTitle: recipes.title,
      coverImageKey: recipes.coverImageKey,
      servings: mealPlanEntries.servings,
      note: mealPlanEntries.note,
      recipeStatus: recipes.status,
      deletedAt: recipes.deletedAt,
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
    .where(eq(mealPlanEntries.planId, planId))
    .orderBy(asc(mealPlanEntries.day), asc(mealPlanEntries.slot), asc(mealPlanEntries.position), asc(mealPlanEntries.id));
  return rows.map(({ coverImageKey, recipeStatus, deletedAt, ...r }) => ({
    ...r,
    coverUrl: coverUrl(coverImageKey),
    recipeAvailable: recipeStatus === "active" && deletedAt === null,
    recipeDeleted: deletedAt !== null,
  }));
}

function toWeekPlan(row: PlanRow, entries: PlanEntry[]): SavedPlan {
  return {
    id: row.id,
    weekStart: row.weekStart,
    status: row.status,
    sentBy: row.sentBy,
    reviewedBy: row.reviewedBy,
    changeNote: row.changeNote,
    entries,
  };
}

/** This household's plan for a week; an empty draft if nothing is planned yet. */
export async function getWeekPlan(householdId: string, weekStart: string): Promise<WeekPlan> {
  const [row] = await getDb()
    .select()
    .from(mealPlans)
    .where(and(eq(mealPlans.householdId, householdId), eq(mealPlans.weekStart, weekStart)))
    .limit(1);
  if (!row) return { id: null, weekStart, status: "draft", sentBy: null, reviewedBy: null, changeNote: null, entries: [] };
  return toWeekPlan(row, await entriesFor(row.id));
}

/** A plan in this household, by id, or null. */
export async function getPlan(householdId: string, planId: string): Promise<SavedPlan | null> {
  if (!isUuid(planId)) return null;
  const [row] = await getDb()
    .select()
    .from(mealPlans)
    .where(and(eq(mealPlans.id, planId), eq(mealPlans.householdId, householdId)))
    .limit(1);
  return row ? toWeekPlan(row, await entriesFor(row.id)) : null;
}

/** The week's plan row, created on first use (one per household per week). */
export async function ensurePlan(householdId: string, weekStart: string): Promise<PlanRow> {
  const db = getDb();
  await db
    .insert(mealPlans)
    .values({ householdId, weekStart })
    .onConflictDoNothing({ target: [mealPlans.householdId, mealPlans.weekStart] });
  const [row] = await db
    .select()
    .from(mealPlans)
    .where(and(eq(mealPlans.householdId, householdId), eq(mealPlans.weekStart, weekStart)))
    .limit(1);
  return row;
}

/** After any change to the meals: bump updated_at; an approved plan returns to draft (D3). */
async function markEdited(planId: string): Promise<void> {
  await getDb()
    .update(mealPlans)
    .set({
      status: sql`case when ${mealPlans.status} = 'approved' then 'draft'::plan_status else ${mealPlans.status} end`,
      updatedAt: new Date(),
    })
    .where(eq(mealPlans.id, planId));
}

export async function addEntry(
  planId: string,
  input: { day: string; slot: MealSlot; recipeId: string; servings: number; note: string | null },
): Promise<void> {
  // Next position in the plan, so meals in a slot keep the order they were added.
  await getDb()
    .insert(mealPlanEntries)
    .values({
      planId,
      ...input,
      position: sql`(select coalesce(max(e.position), -1) + 1 from ${mealPlanEntries} e where e.plan_id = ${planId})`,
    });
  await markEdited(planId);
}

export async function updateEntry(
  planId: string,
  entryId: string,
  patch: { servings?: number; note?: string | null; day?: string; slot?: MealSlot },
): Promise<boolean> {
  const rows = await getDb()
    .update(mealPlanEntries)
    .set(patch)
    .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.planId, planId)))
    .returning({ id: mealPlanEntries.id });
  if (rows.length) await markEdited(planId);
  return rows.length > 0;
}

export async function removeEntry(planId: string, entryId: string): Promise<void> {
  const rows = await getDb()
    .delete(mealPlanEntries)
    .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.planId, planId)))
    .returning({ id: mealPlanEntries.id });
  if (rows.length) await markEdited(planId);
}

/** Copies last week's meals (still-active recipes only) into this week. Returns how many. */
export async function copyPreviousWeek(householdId: string, weekStart: string): Promise<number> {
  const previous = await getWeekPlan(householdId, addDays(weekStart, -7));
  const entries = previous.entries.filter((e) => e.recipeAvailable);
  if (entries.length === 0) return 0;
  const plan = await ensurePlan(householdId, weekStart);
  await getDb()
    .insert(mealPlanEntries)
    .values(
      entries.map((e, position) => ({
        planId: plan.id,
        day: addDays(e.day, 7),
        slot: e.slot,
        recipeId: e.recipeId,
        servings: e.servings,
        note: e.note,
        position,
      })),
    );
  await markEdited(plan.id);
  return entries.length;
}

/** Draft → waiting (D2). Clears any earlier change note. False if it wasn't a draft. */
export async function sendPlan(planId: string, userId: string): Promise<boolean> {
  const rows = await getDb()
    .update(mealPlans)
    .set({
      status: "pending_approval",
      sentBy: userId,
      sentAt: new Date(),
      reviewedBy: null,
      reviewedAt: null,
      changeNote: null,
      updatedAt: new Date(),
    })
    .where(and(eq(mealPlans.id, planId), eq(mealPlans.status, "draft")))
    .returning({ id: mealPlans.id });
  return rows.length > 0;
}

/** Waiting → approved, or back to draft with a note for the sender (D3). Only someone other than the sender. */
export async function reviewPlan(
  planId: string,
  userId: string,
  outcome: { approve: true } | { approve: false; note: string },
): Promise<boolean> {
  const rows = await getDb()
    .update(mealPlans)
    .set({
      status: outcome.approve ? "approved" : "draft",
      changeNote: outcome.approve ? null : outcome.note,
      reviewedBy: userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(mealPlans.id, planId), eq(mealPlans.status, "pending_approval"), ne(mealPlans.sentBy, userId)))
    .returning({ id: mealPlans.id });
  return rows.length > 0;
}

/** Plans waiting for this person's answer: the Plan tab badge (D2). */
export async function waitingForUser(householdId: string, userId: string): Promise<{ count: number; weekStart: string | null }> {
  const db = getDb();
  const where = and(eq(mealPlans.householdId, householdId), eq(mealPlans.status, "pending_approval"), ne(mealPlans.sentBy, userId));
  const [[{ n }], [first]] = await Promise.all([
    db.select({ n: count() }).from(mealPlans).where(where),
    db.select({ weekStart: mealPlans.weekStart }).from(mealPlans).where(where).orderBy(asc(mealPlans.weekStart)).limit(1),
  ]);
  return { count: n, weekStart: first?.weekStart ?? null };
}

/** What a list made from this plan should contain: recipe and summed servings, skipping deleted recipes. */
export function planPicks(plan: WeekPlan): { recipeId: string; servings: number }[] {
  const byRecipe = new Map<string, number>();
  for (const e of plan.entries) {
    if (!e.recipeDeleted) byRecipe.set(e.recipeId, (byRecipe.get(e.recipeId) ?? 0) + e.servings);
  }
  return [...byRecipe].map(([recipeId, servings]) => ({ recipeId, servings }));
}

/** The newest list made from this plan, if any. */
export async function latestListForPlan(householdId: string, planId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: schema.groceryLists.id })
    .from(schema.groceryLists)
    .where(and(eq(schema.groceryLists.householdId, householdId), eq(schema.groceryLists.mealPlanId, planId)))
    .orderBy(desc(schema.groceryLists.createdAt))
    .limit(1);
  return row?.id ?? null;
}
