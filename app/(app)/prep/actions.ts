"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMembers, requireHousehold } from "@/lib/household";
import { inWeek, isIsoDate, MEAL_SLOTS, weekStartOf } from "@/lib/plan/week";
import { eatersOf } from "@/lib/prep/calc";
import { makePrepList, updatePrepList } from "@/lib/prep/list";
import { type Catalog, getWeekById, getWeekRow, latestPrepList, loadCatalog, loadWeek, type WeekRow } from "@/lib/prep/load";
import {
  deleteCoreFood,
  deleteCoreMeal,
  deleteGuest,
  deleteTemplate,
  MenuError,
  renameTemplate,
  saveCoreMeal,
  saveEater,
  saveSettings,
  upsertCoreFood,
} from "@/lib/prep/menu";
import { weekView } from "@/lib/prep/pages";
import { seedPrep, SetupError } from "@/lib/prep/seed";
import {
  CoreFoodInput,
  CoreMealInput,
  EaterInput,
  ExtraInput,
  SettingsInput,
  SlotInput,
  TemplateName,
  WeekStart,
} from "@/lib/prep/validation";
import type { WeekView } from "@/lib/prep/view";
import {
  addWeekExtra,
  checkTask,
  deleteSlotEntry,
  deleteWeek,
  removeWeekExtra,
  saveSlot,
  saveWeekAsTemplate,
  setWeekOptions,
  startWeek,
  WeekError,
} from "@/lib/prep/weeks";
import { activeRecipe } from "@/lib/recipes";

// Prep server actions (PRD-prep 9). Every one checks the session and household
// first and validates its input with Zod; every read and write is scoped to
// the household.

export type ActionResult = { error?: string };

const first = (err: z.ZodError) => err.issues[0]?.message ?? "Check the form and try again.";

async function context() {
  const { user, membership } = await requireHousehold();
  const catalog = await loadCatalog(membership.householdId);
  return { user, householdId: membership.householdId, catalog };
}

async function requireCatalog(): Promise<{ userId: string; householdId: string; catalog: Catalog }> {
  const { user, householdId, catalog } = await context();
  if (!catalog) redirect("/prep/menu");
  return { userId: user.id, householdId, catalog };
}

function refreshPrep() {
  revalidatePath("/prep", "layout");
}

async function memberNames(householdId: string): Promise<Map<string, string>> {
  return new Map((await getMembers(householdId)).map((m) => [m.userId, m.displayName.trim().split(/\s+/)[0] || m.displayName]));
}

// ---------------------------------------------------------------------------
// Setup and menu

/** setupPrep (P-1). */
export async function setupPrepAction(): Promise<ActionResult> {
  const { user, membership } = await requireHousehold();
  try {
    await seedPrep(membership.householdId, user.id);
  } catch (err) {
    if (err instanceof SetupError) return { error: err.message };
    console.error(err);
    return { error: "Setup didn't finish — try again." };
  }
  refreshPrep();
  return {};
}

function menuError(err: unknown): ActionResult {
  if (err instanceof MenuError || err instanceof WeekError) return { error: err.message };
  throw err;
}

export async function upsertCoreFoodAction(input: CoreFoodInput): Promise<ActionResult & { id?: string }> {
  const { userId, householdId } = await requireCatalog();
  const parsed = CoreFoodInput.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  try {
    const id = await upsertCoreFood(householdId, userId, parsed.data);
    refreshPrep();
    return { id };
  } catch (err) {
    return menuError(err);
  }
}

export async function deleteCoreFoodAction(foodId: string): Promise<ActionResult> {
  const { householdId, catalog } = await requireCatalog();
  if (!z.uuid().safeParse(foodId).success) return {};
  const result = await deleteCoreFood(householdId, catalog, foodId);
  if (!result.error) refreshPrep();
  return result;
}

export async function saveCoreMealAction(input: z.input<typeof CoreMealInput>): Promise<ActionResult & { id?: string }> {
  const { householdId, catalog } = await requireCatalog();
  const parsed = CoreMealInput.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  try {
    const id = await saveCoreMeal(householdId, catalog, parsed.data);
    refreshPrep();
    return { id };
  } catch (err) {
    return menuError(err);
  }
}

export async function deleteCoreMealAction(mealId: string): Promise<ActionResult> {
  const { householdId } = await requireCatalog();
  const result = await deleteCoreMeal(householdId, mealId);
  if (!result.error) refreshPrep();
  return result;
}

export async function saveEaterAction(input: z.input<typeof EaterInput>): Promise<ActionResult & { id?: string }> {
  const { householdId, catalog } = await requireCatalog();
  const parsed = EaterInput.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  try {
    const id = await saveEater(householdId, catalog, parsed.data, await memberNames(householdId));
    refreshPrep();
    return { id };
  } catch (err) {
    return menuError(err);
  }
}

export async function deleteGuestAction(eaterId: string): Promise<ActionResult> {
  const { householdId } = await requireCatalog();
  await deleteGuest(householdId, eaterId);
  refreshPrep();
  return {};
}

export async function saveSettingsAction(input: z.input<typeof SettingsInput>): Promise<ActionResult> {
  const { householdId } = await requireCatalog();
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  await saveSettings(householdId, parsed.data);
  refreshPrep();
  return {};
}

export async function renameTemplateAction(templateId: string, name: string): Promise<ActionResult> {
  const { householdId } = await requireCatalog();
  const parsed = TemplateName.safeParse(name);
  if (!parsed.success) return { error: first(parsed.error) };
  await renameTemplate(householdId, templateId, parsed.data);
  refreshPrep();
  return {};
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  const { householdId } = await requireCatalog();
  await deleteTemplate(householdId, templateId);
  refreshPrep();
  return {};
}

// ---------------------------------------------------------------------------
// Weeks

const From = z.union([z.object({ templateId: z.uuid() }), z.literal("last"), z.literal("blank")]);

/** startWeek (P-5). */
export async function startWeekAction(weekStart: string, from: z.input<typeof From>): Promise<ActionResult> {
  const { userId, householdId } = await requireCatalog();
  const ws = WeekStart.safeParse(weekStart);
  const f = From.safeParse(from);
  if (!ws.success || !f.success) return { error: "Pick a template, last week or blank." };
  try {
    await startWeek(householdId, userId, ws.data, f.data);
  } catch (err) {
    return menuError(err);
  }
  refreshPrep();
  return {};
}

export type WeekResult = ActionResult & { view?: WeekView; confirm?: string };

async function requireWeek(weekId: string): Promise<{ userId: string; householdId: string; catalog: Catalog; week: WeekRow }> {
  const ctx = await requireCatalog();
  const week = await getWeekById(ctx.householdId, weekId);
  if (!week) throw new WeekError("That week was deleted on the other phone. Reload to see it.");
  return { ...ctx, week };
}

/** The week as it is now, sent back with every save so totals update without a reload. */
async function freshView(householdId: string, catalog: Catalog, weekId: string): Promise<WeekView | undefined> {
  const week = await getWeekById(householdId, weekId);
  return week ? weekView(householdId, catalog, week) : undefined;
}

async function weekAction(weekId: string, run: (ctx: Awaited<ReturnType<typeof requireWeek>>) => Promise<ActionResult | void>): Promise<WeekResult> {
  try {
    const ctx = await requireWeek(weekId);
    const result = await run(ctx);
    if (result?.error) return result;
    revalidatePath(`/prep/week/${ctx.week.weekStart}`);
    return { view: await freshView(ctx.householdId, ctx.catalog, weekId) };
  } catch (err) {
    return menuError(err);
  }
}

/** saveSlot (P-6): returns fresh totals, or a question when tomorrow's lunch would be replaced. */
export async function saveSlotAction(input: z.input<typeof SlotInput>): Promise<WeekResult> {
  const parsed = SlotInput.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  const { weekId, ...slot } = parsed.data;
  let confirm: string | undefined;
  const result = await weekAction(weekId, async ({ householdId, catalog, week }) => {
    const saved = await saveSlot(householdId, catalog, week, slot);
    if (saved.ok) return;
    if ("confirm" in saved) {
      confirm = saved.confirm;
      return { error: "confirm" };
    }
    return { error: saved.error };
  });
  return confirm ? { confirm } : result;
}

export async function deleteSlotEntryAction(weekId: string, entryId: string): Promise<WeekResult> {
  if (!z.uuid().safeParse(entryId).success) return { error: "That meal was already removed." };
  return weekAction(weekId, ({ week }) => deleteSlotEntry(week, entryId));
}

const Options = z.object({
  guestsOn: z.boolean().optional(),
  restockBuy: z.array(z.uuid()).max(100).optional(),
  budgetCents: z.number().int().min(0).max(1_000_000).optional(),
});

export async function setWeekOptionsAction(weekId: string, input: z.input<typeof Options>): Promise<WeekResult> {
  const parsed = Options.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  return weekAction(weekId, ({ catalog, week }) => setWeekOptions(catalog, week, parsed.data));
}

export async function addWeekExtraAction(weekId: string, input: z.input<typeof ExtraInput>): Promise<WeekResult> {
  const parsed = ExtraInput.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  return weekAction(weekId, ({ week }) => addWeekExtra(week, parsed.data));
}

export async function removeWeekExtraAction(weekId: string, extraId: string): Promise<WeekResult> {
  if (!z.uuid().safeParse(extraId).success) return {};
  return weekAction(weekId, ({ week }) => removeWeekExtra(week, extraId));
}

/** Start over: deletes the week so it can start from something else. */
export async function deleteWeekAction(weekId: string): Promise<ActionResult> {
  try {
    const { week } = await requireWeek(weekId);
    await deleteWeek(week);
    refreshPrep();
    return {};
  } catch (err) {
    return menuError(err);
  }
}

/** makePrepList (P-8), then open the list. */
export async function makePrepListAction(weekId: string): Promise<ActionResult> {
  let listId: string;
  try {
    const { userId, householdId, catalog, week } = await requireWeek(weekId);
    const loaded = await loadWeek(householdId, catalog, week);
    if (!loaded.input.weekMeals.length && !loaded.extras.length) return { error: "Add meals to the week first." };
    listId = await makePrepList(householdId, userId, catalog, loaded);
  } catch (err) {
    return menuError(err);
  }
  revalidatePath("/lists");
  refreshPrep();
  redirect(`/lists/${listId}`);
}

/** updatePrepList (PRD 8.4 rules): keeps checks and items added by hand. */
export async function updatePrepListAction(weekId: string): Promise<ActionResult & { listId?: string }> {
  try {
    const { householdId, catalog, week } = await requireWeek(weekId);
    const listId = await latestPrepList(householdId, week.id);
    if (!listId) return { error: "This week has no list yet." };
    await updatePrepList(catalog, await loadWeek(householdId, catalog, week), listId);
    revalidatePath(`/lists/${listId}`);
    refreshPrep();
    return { listId };
  } catch (err) {
    return menuError(err);
  }
}

export async function saveWeekAsTemplateAction(weekId: string, name: string, overwrite: boolean): Promise<ActionResult> {
  const parsed = TemplateName.safeParse(name);
  if (!parsed.success) return { error: first(parsed.error) };
  try {
    const { householdId, week } = await requireWeek(weekId);
    await saveWeekAsTemplate(householdId, week, parsed.data, overwrite === true);
  } catch (err) {
    return menuError(err);
  }
  refreshPrep();
  return {};
}

const TaskKey = z.string().min(1).max(300);

/** checkTask: shared with the other phone. */
export async function checkTaskAction(weekId: string, taskKey: string, checked: boolean): Promise<ActionResult> {
  if (!TaskKey.safeParse(taskKey).success) return { error: "That task is gone." };
  try {
    const { userId, week } = await requireWeek(weekId);
    await checkTask(week, taskKey, checked === true, userId);
  } catch (err) {
    return menuError(err);
  }
  revalidatePath("/prep/today", "layout");
  return {};
}

const AddRecipe = z.object({
  recipeId: z.uuid(),
  day: z.string().refine(isIsoDate, "Pick a day"),
  slot: z.enum(MEAL_SLOTS),
});

/**
 * Add to Prep week (P-12): the recipe in a slot, with servings for everyone
 * who eats it. A week that isn't planned yet starts blank.
 */
export async function addRecipeToPrepWeekAction(input: z.input<typeof AddRecipe>): Promise<ActionResult & { weekStart?: string }> {
  const parsed = AddRecipe.safeParse(input);
  if (!parsed.success) return { error: first(parsed.error) };
  const { recipeId, day, slot } = parsed.data;
  try {
    const { userId, householdId, catalog } = await requireCatalog();
    if (!(await activeRecipe(householdId, recipeId))) return { error: "That recipe isn't in your library anymore." };
    const weekStart = weekStartOf(day);
    if (!inWeek(weekStart, day)) return { error: "Pick a day." };
    await startWeek(householdId, userId, weekStart, "blank");
    const week = (await getWeekRow(householdId, weekStart))!;
    const loaded = await loadWeek(householdId, catalog, week);
    const servings = Math.max(1, eatersOf(loaded.input, { slot, leftoverOf: null }).length);
    const position = loaded.input.weekMeals.filter((m) => m.day === day && m.slot === slot).length;
    const saved = await saveSlot(householdId, catalog, week, {
      entryId: null,
      day,
      slot,
      entry: { kind: "recipe", recipeId, servings },
      flavor: null,
      isDouble: false,
      noPrep: false,
      position: Math.min(position, 20),
      confirmReplace: false,
    });
    if (!saved.ok) return { error: "error" in saved ? saved.error : "Couldn't add it." };
    refreshPrep();
    return { weekStart };
  } catch (err) {
    return menuError(err);
  }
}
