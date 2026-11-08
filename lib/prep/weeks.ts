import "server-only";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { atomic, getDb, schema, type Statement } from "@/lib/db";
import type { Aisle } from "@/lib/enums";
import { isUniqueViolation } from "@/lib/db/errors";
import { addDays, inWeek, type MealSlot } from "@/lib/plan/week";
import { type Catalog, getSettings, getWeekRow, type WeekRow, weekExtras, weekMeals } from "@/lib/prep/load";
import { copyWeekMeals, templateMealsFromWeek, weekMealsFromTemplate } from "@/lib/prep/template";
import type { WeekMeal } from "@/lib/prep/types";
import { activeRecipe } from "@/lib/recipes";

// Writing Prep weeks (PRD-prep P-5, P-6, P-13): starting one, saving a slot
// with the double/leftover rules, options, templates and task check-offs.

const { prepWeeks, prepWeekMeals, prepWeekExtras, prepTemplates, prepTemplateMeals, prepTemplateExtras, prepSettings, prepTaskChecks, coreMeals } =
  schema;

/** A message for the person. */
export class WeekError extends Error {}

const touch = (q: Parameters<Parameters<typeof atomic>[0]>[0], weekId: string): Statement =>
  q.update(prepWeeks).set({ updatedAt: new Date() }).where(eq(prepWeeks.id, weekId));

function mealRows(weekId: string, meals: WeekMeal[]) {
  return meals.map((m) => ({
    id: m.id,
    prepWeekId: weekId,
    day: m.day,
    slot: m.slot,
    coreMealId: m.coreMealId,
    recipeId: m.recipeId,
    servings: m.servings,
    leftoverOf: m.leftoverOf,
    choices: m.choices,
    flavor: m.flavor,
    isDouble: m.isDouble,
    noPrep: m.noPrep,
    position: m.position,
  }));
}

export type StartFrom = { templateId: string } | "last" | "blank";

/** startWeek (P-5). An existing week is returned as is. */
export async function startWeek(householdId: string, userId: string, weekStart: string, from: StartFrom): Promise<string> {
  const db = getDb();
  const existing = await getWeekRow(householdId, weekStart);
  if (existing) return existing.id;
  const settings = await getSettings(householdId);
  if (!settings) throw new WeekError("Set up Prep first.");

  const weekId = crypto.randomUUID();
  const newId = () => crypto.randomUUID();
  let meals: WeekMeal[] = [];
  let extras: { name: string; forNote: string | null; aisle: Aisle; priceCents: number | null; isPantry: boolean }[] = [];
  let templateId: string | null = null;
  let guestsOn = settings.guestsDefault;

  if (from === "last") {
    const last = await getWeekRow(householdId, addDays(weekStart, -7));
    if (!last) throw new WeekError("Last week has no Prep week to copy.");
    meals = copyWeekMeals(last.weekStart, weekStart, await weekMeals(last.id), newId);
    extras = await weekExtras(last.id);
    templateId = last.templateId;
    guestsOn = last.guestsOn;
  } else if (from !== "blank") {
    const [template] = await db
      .select({ id: prepTemplates.id })
      .from(prepTemplates)
      .where(and(eq(prepTemplates.id, from.templateId), eq(prepTemplates.householdId, householdId), isNull(prepTemplates.deletedAt)))
      .limit(1);
    if (!template) throw new WeekError("That template was deleted.");
    const [rows, extraRows] = await Promise.all([
      db.select().from(prepTemplateMeals).where(eq(prepTemplateMeals.templateId, template.id)),
      db.select().from(prepTemplateExtras).where(eq(prepTemplateExtras.templateId, template.id)),
    ]);
    // Meals deleted from the menu since the template was saved are left out.
    const gone = new Set(
      (await db.select({ id: coreMeals.id }).from(coreMeals).where(and(eq(coreMeals.householdId, householdId), isNotNull(coreMeals.deletedAt)))).map(
        (m) => m.id,
      ),
    );
    meals = weekMealsFromTemplate(
      weekStart,
      rows.filter((r) => !r.coreMealId || !gone.has(r.coreMealId)),
      newId,
    );
    extras = extraRows;
    templateId = template.id;
  }

  try {
    await atomic((q) => [
      q.insert(prepWeeks).values({
        id: weekId,
        householdId,
        weekStart,
        templateId,
        budgetCents: settings.weeklyBudgetCents,
        guestsOn,
        createdBy: userId,
      }),
      ...(meals.length ? [q.insert(prepWeekMeals).values(mealRows(weekId, meals))] : []),
      ...(extras.length
        ? [
            q.insert(prepWeekExtras).values(
              extras.map((e) => ({ prepWeekId: weekId, name: e.name, forNote: e.forNote, aisle: e.aisle, priceCents: e.priceCents, isPantry: e.isPantry })),
            ),
          ]
        : []),
    ]);
  } catch (err) {
    // The other phone started it a moment earlier.
    if (isUniqueViolation(err)) {
      const row = await getWeekRow(householdId, weekStart);
      if (row) return row.id;
    }
    throw err;
  }
  return weekId;
}

export type SlotEntry =
  | { kind: "meal"; coreMealId: string; choices: Record<string, string> }
  | { kind: "recipe"; recipeId: string; servings: number }
  | { kind: "flex"; coreMealId: string | null }
  | { kind: "leftovers"; leftoverOf: string };

export type SlotInput = {
  entryId: string | null;
  day: string;
  slot: MealSlot;
  entry: SlotEntry;
  flavor: string | null;
  isDouble: boolean;
  noPrep: boolean;
  position: number;
  /** Replace a planned lunch the day after a double with its leftovers. */
  confirmReplace: boolean;
};

export type SlotResult = { ok: true; id: string } | { ok: false; confirm: string } | { ok: false; error: string };

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayName = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** A flex meal to point flex slots at; made on first use if the household has none. */
async function flexMealId(householdId: string, catalog: Catalog, slot: MealSlot): Promise<string> {
  const flex = [...catalog.meals.values()].filter((m) => m.isFlex && !m.deleted);
  const found = flex.find((m) => m.slot === slot) ?? flex[0];
  if (found) return found.id;
  const [row] = await getDb()
    .insert(coreMeals)
    .values({ householdId, name: "Leftovers or a meal out", slot, isFlex: true, position: 999 })
    .returning({ id: coreMeals.id });
  return row.id;
}

/** saveSlot (P-6): one entry, with the Double → next day's lunch rule. */
export async function saveSlot(householdId: string, catalog: Catalog, week: WeekRow, input: SlotInput): Promise<SlotResult> {
  if (!inWeek(week.weekStart, input.day)) return { ok: false, error: "Pick a day in this week." };
  const meals = await weekMeals(week.id);
  const prev = input.entryId ? meals.find((m) => m.id === input.entryId) : undefined;
  if (input.entryId && !prev) return { ok: false, error: "That meal was already removed. Reload and try again." };
  const id = prev?.id ?? crypto.randomUUID();

  // What the row holds.
  let coreMealId: string | null = null;
  let recipeId: string | null = null;
  let servings: number | null = null;
  let leftoverOf: string | null = null;
  let choices: Record<string, string> = {};
  const e = input.entry;
  if (e.kind === "meal") {
    const meal = catalog.meals.get(e.coreMealId);
    if (!meal || meal.deleted || meal.isFlex) return { ok: false, error: "That meal isn't on your menu anymore." };
    for (const [componentId, foodId] of Object.entries(e.choices)) {
      const component = meal.components.find((c) => c.id === componentId);
      const food = catalog.foods.get(foodId);
      if (!component?.swapCategory) continue; // fixed or unknown component: ignore
      if (!food || food.deleted || food.category !== component.swapCategory) {
        return { ok: false, error: "Pick a food from the right group for each part of the meal." };
      }
      if (foodId !== component.defaultFoodId) choices[componentId] = foodId;
    }
    coreMealId = meal.id;
  } else if (e.kind === "recipe") {
    if (!(await activeRecipe(householdId, e.recipeId))) return { ok: false, error: "That recipe isn't in your library anymore." };
    recipeId = e.recipeId;
    servings = e.servings;
  } else if (e.kind === "flex") {
    const meal = e.coreMealId ? catalog.meals.get(e.coreMealId) : null;
    coreMealId = meal && meal.isFlex && !meal.deleted ? meal.id : await flexMealId(householdId, catalog, input.slot);
  } else {
    const source = meals.find((m) => m.id === e.leftoverOf);
    if (!source || source.leftoverOf || source.slot !== "dinner" || source.id === id) {
      return { ok: false, error: "Leftovers have to come from a dinner this week." };
    }
    leftoverOf = source.id;
  }
  if (e.kind === "flex" || e.kind === "leftovers") choices = {};

  const isDouble = input.slot === "dinner" && e.kind !== "leftovers" && e.kind !== "flex" && input.isDouble;
  const nextDay = addDays(input.day, 1);
  if (isDouble && !inWeek(week.weekStart, nextDay)) return { ok: false, error: "Sunday leftovers fall in next week." };

  // Double: tomorrow's lunch becomes the leftovers, asking first if it holds a planned meal.
  const statements: ((q: Parameters<Parameters<typeof atomic>[0]>[0]) => Statement)[] = [];
  const referencing = meals.filter((m) => m.leftoverOf === id);
  if (!isDouble && referencing.length) {
    statements.push((q) => q.delete(prepWeekMeals).where(and(eq(prepWeekMeals.prepWeekId, week.id), eq(prepWeekMeals.leftoverOf, id))));
  }

  const row = {
    prepWeekId: week.id,
    day: input.day,
    slot: input.slot,
    coreMealId,
    recipeId,
    servings,
    leftoverOf,
    choices,
    flavor: input.flavor,
    isDouble,
    noPrep: input.noPrep,
    position: input.position,
    updatedAt: new Date(),
  };
  statements.push((q) =>
    prev
      ? q.update(prepWeekMeals).set(row).where(and(eq(prepWeekMeals.id, id), eq(prepWeekMeals.prepWeekId, week.id)))
      : q.insert(prepWeekMeals).values({ id, ...row }),
  );

  if (isDouble) {
    const lunches = meals.filter((m) => m.day === nextDay && m.slot === "lunch" && m.id !== id);
    const alreadyOurs = lunches.length > 0 && lunches.every((m) => m.leftoverOf === id);
    if (!alreadyOurs) {
      const planned = lunches.filter((m) => !m.leftoverOf);
      if (planned.length && !input.confirmReplace) {
        return { ok: false, confirm: `Replace ${weekdayName(nextDay)}'s lunch with leftovers?` };
      }
      const replace = lunches.map((m) => m.id);
      if (replace.length) {
        statements.push((q) => q.delete(prepWeekMeals).where(and(eq(prepWeekMeals.prepWeekId, week.id), inArray(prepWeekMeals.id, replace))));
      }
      statements.push((q) =>
        q.insert(prepWeekMeals).values({ prepWeekId: week.id, day: nextDay, slot: "lunch", leftoverOf: id, choices: {}, position: 0 }),
      );
    }
  }

  await atomic((q) => [...statements.map((s) => s(q)), touch(q, week.id)]);
  return { ok: true, id };
}

/** deleteSlotEntry: removes an entry and any leftovers made from it. */
export async function deleteSlotEntry(week: WeekRow, entryId: string): Promise<void> {
  await atomic((q) => [
    q.delete(prepWeekMeals).where(and(eq(prepWeekMeals.prepWeekId, week.id), eq(prepWeekMeals.leftoverOf, entryId))),
    q.delete(prepWeekMeals).where(and(eq(prepWeekMeals.prepWeekId, week.id), eq(prepWeekMeals.id, entryId))),
    touch(q, week.id),
  ]);
}

/** Start over: the week and its meals, extras and check-offs go; a list made from it stays. */
export async function deleteWeek(week: WeekRow): Promise<void> {
  await atomic((q) => [
    // Leftovers first: the self-reference would otherwise be set to null mid-delete.
    q.delete(prepWeekMeals).where(and(eq(prepWeekMeals.prepWeekId, week.id), isNotNull(prepWeekMeals.leftoverOf))),
    q.delete(prepWeeks).where(eq(prepWeeks.id, week.id)),
  ]);
}

export async function setWeekOptions(
  catalog: Catalog,
  week: WeekRow,
  input: { guestsOn?: boolean; restockBuy?: string[]; budgetCents?: number },
): Promise<void> {
  const restockBuy = input.restockBuy?.filter((id) => {
    const f = catalog.foods.get(id);
    return f && !f.deleted && f.buyMode === "restock";
  });
  await getDb()
    .update(prepWeeks)
    .set({
      ...(input.guestsOn !== undefined ? { guestsOn: input.guestsOn } : {}),
      ...(restockBuy !== undefined ? { restockBuy: [...new Set(restockBuy)] } : {}),
      ...(input.budgetCents !== undefined ? { budgetCents: input.budgetCents } : {}),
      updatedAt: new Date(),
    })
    .where(eq(prepWeeks.id, week.id));
}

export async function addWeekExtra(
  week: WeekRow,
  extra: { name: string; forNote: string | null; aisle: Aisle; priceCents: number | null; isPantry: boolean },
): Promise<void> {
  await atomic((q) => [q.insert(prepWeekExtras).values({ prepWeekId: week.id, ...extra }), touch(q, week.id)]);
}

export async function removeWeekExtra(week: WeekRow, extraId: string): Promise<void> {
  await atomic((q) => [
    q.delete(prepWeekExtras).where(and(eq(prepWeekExtras.id, extraId), eq(prepWeekExtras.prepWeekId, week.id))),
    touch(q, week.id),
  ]);
}

/**
 * saveWeekAsTemplate (P-13): the week by weekday, with choices, flavors,
 * doubles, leftovers and extras. `overwrite` replaces the template the week
 * came from; otherwise a new template joins the end of the rotation.
 */
export async function saveWeekAsTemplate(householdId: string, week: WeekRow, name: string, overwrite: boolean): Promise<string> {
  const db = getDb();
  const [meals, extras, settings] = await Promise.all([weekMeals(week.id), weekExtras(week.id), getSettings(householdId)]);
  if (!settings) throw new WeekError("Set up Prep first.");
  if (meals.length === 0) throw new WeekError("Add meals to the week first.");
  let target: string | null = null;
  if (overwrite && week.templateId) {
    const [t] = await db
      .select({ id: prepTemplates.id })
      .from(prepTemplates)
      .where(and(eq(prepTemplates.id, week.templateId), eq(prepTemplates.householdId, householdId), isNull(prepTemplates.deletedAt)))
      .limit(1);
    target = t?.id ?? null;
  }
  const templateId = target ?? crypto.randomUUID();
  const rows = templateMealsFromWeek(week.weekStart, meals);

  await atomic((q) => [
    target
      ? q.update(prepTemplates).set({ name, updatedAt: new Date() }).where(eq(prepTemplates.id, templateId))
      : q.insert(prepTemplates).values({ id: templateId, householdId, name }),
    ...(target
      ? [
          q.delete(prepTemplateMeals).where(eq(prepTemplateMeals.templateId, templateId)),
          q.delete(prepTemplateExtras).where(eq(prepTemplateExtras.templateId, templateId)),
        ]
      : [q.update(prepSettings).set({ rotation: [...settings.rotation, templateId], updatedAt: new Date() }).where(eq(prepSettings.householdId, householdId))]),
    q.insert(prepTemplateMeals).values(rows.map((r) => ({ templateId, ...r }))),
    ...(extras.length
      ? [
          q.insert(prepTemplateExtras).values(
            extras.map((e) => ({ templateId, name: e.name, forNote: e.forNote, aisle: e.aisle, priceCents: e.priceCents, isPantry: e.isPantry })),
          ),
        ]
      : []),
    // Saving doesn't change what the week holds, so its list isn't stale.
    q.update(prepWeeks).set({ templateId }).where(eq(prepWeeks.id, week.id)),
  ]);
  return templateId;
}

/** checkTask: shared check-offs for Today's tasks. */
export async function checkTask(week: WeekRow, taskKey: string, checked: boolean, userId: string): Promise<void> {
  const db = getDb();
  if (checked) {
    await db
      .insert(prepTaskChecks)
      .values({ prepWeekId: week.id, taskKey, checkedBy: userId })
      .onConflictDoNothing();
  } else {
    await db.delete(prepTaskChecks).where(and(eq(prepTaskChecks.prepWeekId, week.id), eq(prepTaskChecks.taskKey, taskKey)));
  }
}

export async function taskChecks(weekIds: string[]): Promise<Map<string, { checkedBy: string; checkedAt: Date }>> {
  if (!weekIds.length) return new Map();
  const rows = await getDb().select().from(prepTaskChecks).where(inArray(prepTaskChecks.prepWeekId, weekIds));
  return new Map(rows.map((r) => [`${r.prepWeekId}|${r.taskKey}`, { checkedBy: r.checkedBy, checkedAt: r.checkedAt }]));
}
