import "server-only";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Aisle } from "@/lib/enums";
import { guessAisle } from "@/lib/grocery/aisles";
import { recipesForBuild } from "@/lib/grocery/lists";
import { isUuid } from "@/lib/library-filters";
import { coverUrl } from "@/lib/photos";
import { recipeUse } from "@/lib/prep/calc";
import type { Component, CoreMeal, Eater, Food, RecipeUse, Slot, WeekInput, WeekMeal } from "@/lib/prep/types";

// Loading Prep data (PRD-prep 9): one household's catalog (settings, foods,
// meals, eaters) and one week as the WeekInput the calculations take.

const {
  prepSettings,
  prepEaters,
  coreFoods,
  coreMeals,
  coreMealComponents,
  coreMealPortions,
  prepTemplates,
  prepWeeks,
  prepWeekMeals,
  prepWeekExtras,
  ingredients,
  groceryLists,
  recipes,
} = schema;

export type Settings = {
  weeklyBudgetCents: number;
  prepWeekdays: number[];
  doubleWeekdays: number[];
  guestsDefault: boolean;
  rotation: string[];
};

export type FoodRecord = Food & {
  ingredientId: string | null;
  walmartName: string | null;
  walmartUrl: string | null;
  notes: string | null;
  aisle: Aisle;
  isPantry: boolean;
  priceUpdatedAt: string;
  deleted: boolean;
};

export type MealRecord = CoreMeal & { flavorIdeas: string[]; notes: string | null; position: number; deleted: boolean };

export type EaterRecord = Eater & { userId: string | null; position: number };

export type Catalog = {
  settings: Settings;
  foods: Map<string, FoodRecord>;
  meals: Map<string, MealRecord>;
  eaters: EaterRecord[];
  /** Portions that still say "check portions": componentId:eaterId. */
  needsReview: Set<string>;
};

export async function getSettings(householdId: string): Promise<Settings | null> {
  const [row] = await getDb().select().from(prepSettings).where(eq(prepSettings.householdId, householdId)).limit(1);
  return row
    ? {
        weeklyBudgetCents: row.weeklyBudgetCents,
        prepWeekdays: row.prepWeekdays,
        doubleWeekdays: row.doubleWeekdays,
        guestsDefault: row.guestsDefault,
        rotation: row.rotation,
      }
    : null;
}

/** Everything a Prep screen needs about the household, or null before setup. */
export async function loadCatalog(householdId: string): Promise<Catalog | null> {
  const db = getDb();
  const settings = await getSettings(householdId);
  if (!settings) return null;
  const [foodRows, mealRows, componentRows, portionRows, eaterRows] = await Promise.all([
    db
      .select({ food: coreFoods, aisle: ingredients.aisle, isPantry: ingredients.isPantryStaple })
      .from(coreFoods)
      .leftJoin(ingredients, eq(ingredients.id, coreFoods.ingredientId))
      .where(eq(coreFoods.householdId, householdId))
      .orderBy(asc(coreFoods.name)),
    db.select().from(coreMeals).where(eq(coreMeals.householdId, householdId)).orderBy(asc(coreMeals.position), asc(coreMeals.name)),
    db
      .select({ c: coreMealComponents })
      .from(coreMealComponents)
      .innerJoin(coreMeals, eq(coreMeals.id, coreMealComponents.coreMealId))
      .where(eq(coreMeals.householdId, householdId))
      .orderBy(asc(coreMealComponents.position)),
    db
      .select({ p: coreMealPortions })
      .from(coreMealPortions)
      .innerJoin(prepEaters, eq(prepEaters.id, coreMealPortions.eaterId))
      .where(eq(prepEaters.householdId, householdId)),
    db.select().from(prepEaters).where(eq(prepEaters.householdId, householdId)).orderBy(asc(prepEaters.position), asc(prepEaters.createdAt)),
  ]);

  const foods = new Map<string, FoodRecord>();
  for (const { food: f, aisle, isPantry } of foodRows) {
    foods.set(f.id, {
      id: f.id,
      name: f.name,
      category: f.category,
      unitKind: f.unitKind,
      gramsPerCount: f.gramsPerCount,
      per100g: { kcal: f.kcal100g, protein: f.protein100g, carbs: f.carbs100g, fat: f.fat100g, fiber: f.fiber100g },
      cookedYield: f.cookedYield,
      displayCupG: f.displayCupG,
      packageAmount: f.packageAmount,
      packagePriceCents: f.packagePriceCents,
      priceIsEstimate: f.priceIsEstimate,
      buyMode: f.buyMode,
      restockWeeks: f.restockWeeks,
      packageLabel: f.packageLabel,
      displayName: f.walmartName?.trim() || f.name,
      ingredientId: f.ingredientId,
      walmartName: f.walmartName,
      walmartUrl: f.walmartUrl,
      notes: f.notes,
      aisle: aisle && aisle !== "other" ? aisle : guessAisle(f.name),
      isPantry: isPantry ?? false,
      priceUpdatedAt: f.priceUpdatedAt.toISOString(),
      deleted: f.deletedAt !== null,
    });
  }

  const needsReview = new Set<string>();
  const portionsByComponent = new Map<string, Record<string, number>>();
  for (const { p } of portionRows) {
    const rec = portionsByComponent.get(p.componentId) ?? {};
    rec[p.eaterId] = p.amount;
    portionsByComponent.set(p.componentId, rec);
    if (p.needsReview) needsReview.add(`${p.componentId}:${p.eaterId}`);
  }
  const componentsByMeal = new Map<string, Component[]>();
  for (const { c } of componentRows) {
    const list = componentsByMeal.get(c.coreMealId) ?? [];
    list.push({
      id: c.id,
      role: c.role,
      label: c.label,
      swapCategory: c.swapCategory,
      defaultFoodId: c.defaultFoodId,
      prepAs: c.prepAs,
      portions: portionsByComponent.get(c.id) ?? {},
    });
    componentsByMeal.set(c.coreMealId, list);
  }
  const meals = new Map<string, MealRecord>(
    mealRows.map((m) => [
      m.id,
      {
        id: m.id,
        name: m.name,
        slot: m.slot,
        isFlex: m.isFlex,
        components: componentsByMeal.get(m.id) ?? [],
        flavorIdeas: m.flavorIdeas,
        notes: m.notes,
        position: m.position,
        deleted: m.deletedAt !== null,
      },
    ]),
  );

  const eaters: EaterRecord[] = eaterRows.map((e) => ({
    id: e.id,
    kind: e.kind,
    name: e.name,
    color: e.color === "a" || e.color === "b" ? e.color : "neutral",
    slots: e.slots as Slot[],
    isActive: e.isActive,
    kcalTarget: e.kcalTarget,
    proteinTarget: e.proteinTargetG,
    userId: e.userId,
    position: e.position,
  }));

  return { settings, foods, meals, eaters, needsReview };
}

export type WeekRow = typeof prepWeeks.$inferSelect;

export async function getWeekRow(householdId: string, weekStart: string): Promise<WeekRow | null> {
  const [row] = await getDb()
    .select()
    .from(prepWeeks)
    .where(and(eq(prepWeeks.householdId, householdId), eq(prepWeeks.weekStart, weekStart)))
    .limit(1);
  return row ?? null;
}

export async function getWeekById(householdId: string, weekId: string): Promise<WeekRow | null> {
  if (!isUuid(weekId)) return null;
  const [row] = await getDb()
    .select()
    .from(prepWeeks)
    .where(and(eq(prepWeeks.householdId, householdId), eq(prepWeeks.id, weekId)))
    .limit(1);
  return row ?? null;
}

export function toWeekMeal(r: typeof prepWeekMeals.$inferSelect): WeekMeal {
  return {
    id: r.id,
    day: r.day,
    slot: r.slot,
    coreMealId: r.coreMealId,
    recipeId: r.recipeId,
    servings: r.servings,
    leftoverOf: r.leftoverOf,
    choices: r.choices ?? {},
    flavor: r.flavor,
    isDouble: r.isDouble,
    noPrep: r.noPrep,
    position: r.position,
  };
}

export async function weekMeals(weekId: string): Promise<WeekMeal[]> {
  const rows = await getDb()
    .select()
    .from(prepWeekMeals)
    .where(eq(prepWeekMeals.prepWeekId, weekId))
    .orderBy(asc(prepWeekMeals.day), asc(prepWeekMeals.slot), asc(prepWeekMeals.position));
  return rows.map(toWeekMeal);
}

export type ExtraRecord = { id: string; name: string; forNote: string | null; aisle: Aisle; priceCents: number | null; isPantry: boolean };

export async function weekExtras(weekId: string): Promise<ExtraRecord[]> {
  return getDb().select().from(prepWeekExtras).where(eq(prepWeekExtras.prepWeekId, weekId)).orderBy(asc(prepWeekExtras.name));
}

export type RecipeInfo = { id: string; title: string; servings: number; coverUrl: string | null };

export type LoadedWeek = {
  week: WeekRow;
  input: WeekInput;
  extras: ExtraRecord[];
  recipes: Map<string, RecipeInfo>;
  /** The recipes behind recipe week meals, as buildList takes them. */
  buildRecipes: Awaited<ReturnType<typeof recipesForBuild>>;
};

/** Foods by their linked ingredient, for matching recipe ingredients (§8.5). */
export function foodsByIngredient(foods: Map<string, FoodRecord>): Map<string, FoodRecord> {
  const out = new Map<string, FoodRecord>();
  for (const f of foods.values()) if (f.ingredientId && !f.deleted && !out.has(f.ingredientId)) out.set(f.ingredientId, f);
  return out;
}

/** loadWeekInput (§9): one week, ready for the calculations. */
export async function loadWeek(householdId: string, catalog: Catalog, week: WeekRow): Promise<LoadedWeek> {
  const [meals, extras] = await Promise.all([weekMeals(week.id), weekExtras(week.id)]);
  const recipeIds = [...new Set(meals.map((m) => m.recipeId).filter((id): id is string => Boolean(id)))];
  const [buildRecipes, recipeRows] = await Promise.all([
    recipesForBuild(householdId, recipeIds),
    recipeIds.length
      ? getDb()
          .select({ id: recipes.id, title: recipes.title, servings: recipes.servings, coverImageKey: recipes.coverImageKey })
          .from(recipes)
          .where(and(eq(recipes.householdId, householdId), inArray(recipes.id, recipeIds)))
      : Promise.resolve([]),
  ]);
  const byIngredient = foodsByIngredient(catalog.foods);
  const recipeUses = new Map<string, RecipeUse>();
  for (const m of meals) {
    if (!m.recipeId) continue;
    const r = buildRecipes.get(m.recipeId);
    if (r) recipeUses.set(m.id, recipeUse(r, m.servings ?? r.servings, byIngredient));
    else recipeUses.set(m.id, { title: "Deleted recipe", foods: [], unpriced: 0 });
  }
  const input: WeekInput = {
    weekStart: week.weekStart,
    foods: catalog.foods,
    meals: catalog.meals,
    eaters: catalog.eaters,
    guestsOn: week.guestsOn,
    weekMeals: meals,
    restockBuy: new Set(week.restockBuy),
    budgetCents: week.budgetCents,
    extras: extras.map((e) => ({ id: e.id, name: e.name, priceCents: e.priceCents, isPantry: e.isPantry })),
    recipeUses,
  };
  return {
    week,
    input,
    extras,
    buildRecipes,
    recipes: new Map(recipeRows.map((r) => [r.id, { id: r.id, title: r.title, servings: r.servings, coverUrl: coverUrl(r.coverImageKey) }])),
  };
}

/** The latest list made from a week, if any. */
export async function latestPrepList(householdId: string, weekId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: groceryLists.id })
    .from(groceryLists)
    .where(and(eq(groceryLists.householdId, householdId), eq(groceryLists.prepWeekId, weekId)))
    .orderBy(desc(groceryLists.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** The most recent week before this one, for "Copy last week" and the rotation suggestion. */
export async function previousWeek(householdId: string, weekStart: string): Promise<WeekRow | null> {
  const [row] = await getDb()
    .select()
    .from(prepWeeks)
    .where(and(eq(prepWeeks.householdId, householdId), lt(prepWeeks.weekStart, weekStart)))
    .orderBy(desc(prepWeeks.weekStart))
    .limit(1);
  return row ?? null;
}

export type TemplateRecord = { id: string; name: string };

export async function listTemplates(householdId: string): Promise<TemplateRecord[]> {
  const rows = await getDb()
    .select({ id: prepTemplates.id, name: prepTemplates.name, deletedAt: prepTemplates.deletedAt })
    .from(prepTemplates)
    .where(eq(prepTemplates.householdId, householdId))
    .orderBy(asc(prepTemplates.name));
  return rows.filter((r) => !r.deletedAt).map(({ id, name }) => ({ id, name }));
}
