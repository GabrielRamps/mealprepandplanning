// What Prep screens show, built from the calculations. Pure; the pages pass
// these plain objects to client components.
import { type MealBreakdown, mealBreakdown, type PrepTask, servedFrom, shoppingNeeds, type WeekTotals, weekTotals } from "@/lib/prep/calc";
import type { CoreMeal, Eater, Food, Slot, WeekInput, WeekMeal } from "@/lib/prep/types";

export type EntryKind = "meal" | "recipe" | "flex" | "leftovers";

export type EntryView = {
  id: string;
  day: string;
  slot: Slot;
  position: number;
  kind: EntryKind;
  title: string;
  /** The foods picked for swappable parts: "Chicken thighs · red or gold potatoes · frozen broccoli". */
  detail: string | null;
  flavor: string | null;
  coreMealId: string | null;
  recipeId: string | null;
  servings: number | null;
  coverUrl: string | null;
  choices: Record<string, string>;
  isDouble: boolean;
  noPrep: boolean;
  leftoverOf: string | null;
  breakdown: MealBreakdown;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function swapFoods(input: WeekInput, meal: CoreMeal, choices: Record<string, string>): Food[] {
  return meal.components
    .filter((c) => c.swapCategory)
    .map((c) => input.foods.get(choices[c.id] ?? c.defaultFoodId))
    .filter((f): f is Food => Boolean(f));
}

/** "Garlic-herb chicken thighs, red or gold potatoes, frozen broccoli" */
export function dishName(input: WeekInput, wm: WeekMeal): string | null {
  const meal = wm.coreMealId ? input.meals.get(wm.coreMealId) : undefined;
  if (!meal || meal.isFlex) return null;
  const foods = swapFoods(input, meal, wm.choices);
  if (!foods.length) return wm.flavor ? `${capitalize(wm.flavor)} ${meal.name.toLowerCase()}` : meal.name;
  const names = foods.map((f) => f.name.toLowerCase());
  if (wm.flavor) names[0] = `${wm.flavor} ${names[0]}`;
  return capitalize(names.join(", "));
}

export function entryView(input: WeekInput, wm: WeekMeal, recipes: Map<string, { title: string; coverUrl: string | null }>): EntryView {
  const meal = wm.coreMealId ? input.meals.get(wm.coreMealId) : undefined;
  let kind: EntryKind;
  let title: string;
  let detail: string | null = null;
  if (wm.leftoverOf) {
    kind = "leftovers";
    const source = servedFrom(input, wm);
    const name = source ? (source.recipeId ? recipes.get(source.recipeId)?.title : dishName(input, source)) : null;
    title = `Leftovers: ${name ?? "dinner"}`;
  } else if (wm.recipeId) {
    kind = "recipe";
    title = recipes.get(wm.recipeId)?.title ?? input.recipeUses.get(wm.id)?.title ?? "Recipe";
  } else if (meal?.isFlex) {
    kind = "flex";
    title = wm.flavor || meal.name;
  } else {
    kind = "meal";
    title = meal?.name ?? "Meal";
    const foods = meal ? swapFoods(input, meal, wm.choices) : [];
    detail = foods.length ? foods.map((f) => f.name).join(" · ") : null;
  }
  return {
    id: wm.id,
    day: wm.day,
    slot: wm.slot,
    position: wm.position,
    kind,
    title,
    detail,
    flavor: wm.flavor,
    coreMealId: wm.coreMealId,
    recipeId: wm.recipeId,
    servings: wm.servings,
    coverUrl: wm.recipeId ? (recipes.get(wm.recipeId)?.coverUrl ?? null) : null,
    choices: wm.choices,
    isDouble: wm.isDouble,
    noPrep: wm.noPrep,
    leftoverOf: wm.leftoverOf,
    breakdown: mealBreakdown(input, wm),
  };
}

export type RestockView = { foodId: string; name: string; shareCents: number; bought: boolean; packageLabel: string; priceCents: number };

export type ExtraView = { id: string; name: string; forNote: string | null; priceCents: number | null; isPantry: boolean };

export type WeekView = {
  weekId: string;
  weekStart: string;
  templateId: string | null;
  templateName: string | null;
  budgetCents: number;
  guestsOn: boolean;
  guestNames: string[];
  listId: string | null;
  listStale: boolean;
  entries: EntryView[];
  totals: WeekTotals;
  restock: RestockView[];
  extras: ExtraView[];
};

export function buildWeekView(args: {
  input: WeekInput;
  weekId: string;
  templateId: string | null;
  templateName: string | null;
  listId: string | null;
  listStale: boolean;
  recipes: Map<string, { title: string; coverUrl: string | null }>;
  extras: ExtraView[];
}): WeekView {
  const { input } = args;
  const slotOrder: Record<Slot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
  const entries = [...input.weekMeals]
    .sort((a, b) => a.day.localeCompare(b.day) || slotOrder[a.slot] - slotOrder[b.slot] || a.position - b.position)
    .map((wm) => entryView(input, wm, args.recipes));
  const restock = shoppingNeeds(input)
    .filter((n) => n.food.buyMode === "restock")
    .map((n) => ({
      foodId: n.food.id,
      name: n.food.name,
      shareCents: n.budgetCents,
      bought: input.restockBuy.has(n.food.id),
      packageLabel: n.food.packageLabel,
      priceCents: n.food.packagePriceCents,
    }));
  return {
    weekId: args.weekId,
    weekStart: input.weekStart,
    templateId: args.templateId,
    templateName: args.templateName,
    budgetCents: input.budgetCents,
    guestsOn: input.guestsOn,
    guestNames: input.eaters.filter((e) => e.kind === "guest" && e.isActive).map((e) => e.name),
    listId: args.listId,
    listStale: args.listStale,
    entries,
    totals: weekTotals(input),
    restock,
    extras: args.extras,
  };
}

/** Lightweight catalog for the slot sheet and pickers. */
export type MenuView = {
  meals: { id: string; name: string; slot: Slot; isFlex: boolean; flavorIdeas: string[]; components: { id: string; role: string; label: string | null; swapCategory: string | null; defaultFoodId: string }[] }[];
  foods: { id: string; name: string; category: string }[];
  eaters: Pick<Eater, "id" | "kind" | "name" | "slots" | "isActive" | "color">[];
  doubleWeekdays: number[];
};

export type TaskView = PrepTask & { weekId: string; checkedBy: string | null; checkedAt: string | null };
