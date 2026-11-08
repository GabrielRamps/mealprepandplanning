// Prep calculations (PRD-prep 8): who eats what, nutrition, shopping need and
// packages, cost and status, and Today's tasks. Pure functions over one
// WeekInput; this is the only place these numbers are computed.
import type { BuildRecipe } from "@/lib/grocery/build";
import { addDays } from "@/lib/plan/week";
import { formatCooked, formatRaw, gramsOf, packageGrams } from "@/lib/prep/format";
import type { Component, CoreMeal, Eater, Food, Per100g, RecipeUse, Status, WeekInput, WeekMeal } from "@/lib/prep/types";
import { UNIT_FACTOR, unitFamily } from "@/lib/units";

const EPS = 1e-9;

// ---------------------------------------------------------------------------
// 8.1 Who eats a slot

/** Leftover lunches are members only; guests eat only while guests are on for the week. */
export function eatersOf(input: Pick<WeekInput, "eaters" | "guestsOn">, wm: Pick<WeekMeal, "slot" | "leftoverOf">): Eater[] {
  return input.eaters.filter((e) => {
    if (!e.isActive || !e.slots.includes(wm.slot)) return false;
    if (wm.leftoverOf) return e.kind === "member";
    return e.kind === "member" || input.guestsOn;
  });
}

/** Members who eat tomorrow's leftover lunch from a double dinner. */
function leftoverEaters(input: WeekInput): Eater[] {
  return eatersOf(input, { slot: "lunch", leftoverOf: "x" });
}

// ---------------------------------------------------------------------------
// 8.2 Portions

export type PortionLine = { component: Component; food: Food; amount: number; grams: number };

/** The food a component uses this time: the week's choice (if it's a real food), else the default. */
export function componentFood(input: Pick<WeekInput, "foods">, component: Component, choices: Record<string, string>): Food | null {
  const chosen = choices[component.id];
  return (chosen && input.foods.get(chosen)) || input.foods.get(component.defaultFoodId) || null;
}

function mealOf(input: WeekInput, wm: WeekMeal): CoreMeal | null {
  return wm.coreMealId ? (input.meals.get(wm.coreMealId) ?? null) : null;
}

/** The week meal whose food this one serves: itself, or the dinner it's the leftovers of. */
export function servedFrom(input: WeekInput, wm: WeekMeal): WeekMeal | null {
  if (!wm.leftoverOf) return wm;
  return input.weekMeals.find((m) => m.id === wm.leftoverOf && !m.leftoverOf) ?? null;
}

/** One eater's portion lines for a core-meal week meal (or the dinner behind leftovers). */
export function portionsFor(input: WeekInput, wm: WeekMeal, eaterId: string): PortionLine[] {
  const source = servedFrom(input, wm);
  const meal = source ? mealOf(input, source) : null;
  if (!source || !meal || meal.isFlex) return [];
  const lines: PortionLine[] = [];
  for (const component of meal.components) {
    const food = componentFood(input, component, source.choices);
    if (!food) continue;
    // Portions are in the default food's unit; a swapped food of the other
    // kind (zucchini, counted, for broccoli, weighed) converts through grams.
    const stored = component.portions[eaterId] ?? 0;
    const defaultFood = input.foods.get(component.defaultFoodId) ?? food;
    const grams = gramsOf(defaultFood, stored);
    const amount = food === defaultFood ? stored : food.unitKind === "count" ? grams / (food.gramsPerCount || 1) : grams;
    lines.push({ component, food, amount, grams });
  }
  return lines;
}

/** Why a week meal adds no nutrition, or null when it's counted. */
export function notCounted(input: WeekInput, wm: WeekMeal): "flex" | "recipe" | null {
  const source = servedFrom(input, wm);
  if (!source) return "flex";
  if (source.recipeId) return "recipe";
  const meal = mealOf(input, source);
  if (!meal || meal.isFlex) return "flex";
  return null;
}

// ---------------------------------------------------------------------------
// 8.3 Nutrition

export type Nutrition = Per100g;

const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

function addNutrition(a: Nutrition, food: Food, grams: number): Nutrition {
  const f = grams / 100;
  return {
    kcal: a.kcal + food.per100g.kcal * f,
    protein: a.protein + food.per100g.protein * f,
    carbs: a.carbs + food.per100g.carbs * f,
    fat: a.fat + food.per100g.fat * f,
    fiber: a.fiber + food.per100g.fiber * f,
  };
}

export function linesNutrition(lines: PortionLine[]): Nutrition {
  return lines.reduce((n, l) => addNutrition(n, l.food, l.grams), ZERO);
}

export type DayNutrition = Nutrition & { day: string; partial: boolean };

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** One member's seven days. A day with a recipe or flex meal they eat is partial. */
export function memberDays(input: WeekInput, eater: Eater): DayNutrition[] {
  return weekDates(input.weekStart).map((day) => {
    let n = ZERO;
    let partial = false;
    for (const wm of input.weekMeals) {
      if (wm.day !== day || !eatersOf(input, wm).some((e) => e.id === eater.id)) continue;
      if (notCounted(input, wm)) partial = true;
      else n = portionsFor(input, wm, eater.id).reduce((acc, l) => addNutrition(acc, l.food, l.grams), n);
    }
    return { ...n, day, partial };
  });
}

export type Averages = Nutrition & { days: number };

/** Mean over fully counted days, or null when every day is partial. */
export function weekAverage(days: DayNutrition[]): Averages | null {
  const counted = days.filter((d) => !d.partial);
  if (counted.length === 0) return null;
  const sum = counted.reduce((a, d) => ({
    kcal: a.kcal + d.kcal,
    protein: a.protein + d.protein,
    carbs: a.carbs + d.carbs,
    fat: a.fat + d.fat,
    fiber: a.fiber + d.fiber,
  }), ZERO);
  const k = counted.length;
  return { kcal: sum.kcal / k, protein: sum.protein / k, carbs: sum.carbs / k, fat: sum.fat / k, fiber: sum.fiber / k, days: k };
}

// ---------------------------------------------------------------------------
// 8.4 Shopping need and packages

export type NeedSource = { weekMealId: string; day: string; slot: WeekMeal["slot"]; label: string; grams: number; recipeId: string | null };

export type FoodNeed = {
  food: Food;
  needG: number;
  /** by_amount: packages to buy. restock: 1 when marked Buy this week, else 0. */
  packages: number;
  /** by_amount: packages × price. restock: full price when bought this week, else 0. */
  listCostCents: number;
  /** What the budget counts: package cost, or the restock weekly share. */
  budgetCents: number;
  /** Grams the packages fall short when the 5% rule rounded down. */
  shortG: number;
  sources: NeedSource[];
};

/** §8.4: round down when the extra is at most 5% of a package, but always buy one when anything is needed. */
export function packagesFor(needG: number, packageG: number): number {
  if (needG <= EPS || packageG <= 0) return 0;
  const ratio = needG / packageG;
  const whole = Math.floor(ratio + EPS);
  const frac = ratio - whole;
  const packages = frac <= 0.05 + EPS ? whole : whole + 1;
  return Math.max(packages, 1);
}

function mealLabel(input: WeekInput, wm: WeekMeal): string {
  if (wm.recipeId) return input.recipeUses.get(wm.id)?.title ?? "Recipe";
  return mealOf(input, wm)?.name ?? "Meal";
}

/** Every food the week uses, with its need, packages and cost. */
export function shoppingNeeds(input: WeekInput): FoodNeed[] {
  const acc = new Map<string, { needG: number; sources: NeedSource[] }>();
  const add = (food: Food, grams: number, wm: WeekMeal, label: string) => {
    if (grams <= 0) return;
    const a = acc.get(food.id) ?? { needG: 0, sources: [] };
    a.needG += grams;
    const existing = a.sources.find((s) => s.weekMealId === wm.id);
    if (existing) existing.grams += grams;
    else a.sources.push({ weekMealId: wm.id, day: wm.day, slot: wm.slot, label, grams, recipeId: wm.recipeId });
    acc.set(food.id, a);
  };

  for (const wm of input.weekMeals) {
    if (wm.leftoverOf) continue; // cooked with the double dinner
    if (wm.recipeId) {
      for (const use of input.recipeUses.get(wm.id)?.foods ?? []) {
        const food = input.foods.get(use.foodId);
        if (food) add(food, use.grams, wm, mealLabel(input, wm));
      }
      continue;
    }
    const label = mealLabel(input, wm);
    for (const eater of eatersOf(input, wm)) {
      for (const line of portionsFor(input, wm, eater.id)) add(line.food, line.grams, wm, label);
    }
    if (wm.isDouble) {
      for (const member of leftoverEaters(input)) {
        for (const line of portionsFor(input, wm, member.id)) add(line.food, line.grams, wm, `${label} (double)`);
      }
    }
  }

  const out: FoodNeed[] = [];
  for (const [foodId, a] of acc) {
    const food = input.foods.get(foodId)!;
    const pkgG = packageGrams(food);
    if (food.buyMode === "restock") {
      const bought = input.restockBuy.has(food.id);
      out.push({
        food,
        needG: a.needG,
        packages: bought ? 1 : 0,
        listCostCents: bought ? food.packagePriceCents : 0,
        budgetCents: pkgG > 0 ? Math.round((a.needG / pkgG) * food.packagePriceCents) : 0,
        shortG: 0,
        sources: a.sources,
      });
      continue;
    }
    const packages = packagesFor(a.needG, pkgG);
    const cost = packages * food.packagePriceCents;
    out.push({
      food,
      needG: a.needG,
      packages,
      listCostCents: cost,
      budgetCents: cost,
      shortG: Math.max(0, a.needG - packages * pkgG),
      sources: a.sources,
    });
  }
  return out.sort((x, y) => x.food.name.localeCompare(y.food.name));
}

// ---------------------------------------------------------------------------
// 8.5 Library recipes

/**
 * A recipe's ingredients at some servings, matched to core foods by
 * ingredient: weights convert to grams, plain counts use grams per count.
 * Anything else (volumes, packages, no core food) is unpriced.
 */
export function recipeUse(recipe: BuildRecipe, servings: number, foodByIngredient: Map<string, Food>): RecipeUse {
  const factor = servings / recipe.servings;
  const foods: RecipeUse["foods"] = [];
  let unpriced = 0;
  for (const ing of recipe.ingredients) {
    const amount = ing.quantityMax ?? ing.quantity;
    const food = ing.ingredientId ? foodByIngredient.get(ing.ingredientId) : undefined;
    let grams: number | null = null;
    if (food && amount !== null) {
      if (ing.unit && unitFamily(ing.unit) === "weight") grams = amount * factor * UNIT_FACTOR[ing.unit]!;
      else if (!ing.unit && food.unitKind === "count") grams = amount * factor * (food.gramsPerCount ?? 0);
    }
    if (food && grams !== null && grams > 0) foods.push({ foodId: food.id, grams });
    else if (amount !== null && !ing.isOptional) unpriced++;
  }
  return { title: recipe.title, foods, unpriced };
}

/** Per-gram price of a food, in cents. */
export function centsPerGram(food: Food): number {
  const g = packageGrams(food);
  return g > 0 ? food.packagePriceCents / g : 0;
}

// ---------------------------------------------------------------------------
// 8.6 Totals and status

export function costStatus(costCents: number, budgetCents: number): Status {
  if (budgetCents <= 0) return costCents <= 0 ? "green" : "red";
  const r = costCents / budgetCents;
  if (r <= 1 + EPS) return "green";
  if (r <= 1.1 + EPS) return "amber";
  return "red";
}

export function kcalStatus(avg: number, target: number): Status {
  const dev = Math.abs(avg / target - 1);
  if (dev <= 0.07 + EPS) return "green";
  if (dev <= 0.15 + EPS) return "amber";
  return "red";
}

export function proteinStatus(avg: number, target: number): Status {
  const r = avg / target;
  if (r >= 0.95 - EPS) return "green";
  if (r >= 0.85 - EPS) return "amber";
  return "red";
}

const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };

export function worstStatus(statuses: (Status | null)[]): Status {
  return statuses.reduce<Status>((w, s) => (s && RANK[s] > RANK[w] ? s : w), "green");
}

export type MemberTotals = {
  eaterId: string;
  name: string;
  color: Eater["color"];
  kcalTarget: number;
  proteinTarget: number;
  days: (DayNutrition & { kcalStatus: Status | null; proteinStatus: Status | null })[];
  average: Averages | null;
  kcalStatus: Status | null;
  proteinStatus: Status | null;
};

export type CostLine = { foodId: string; name: string; cents: number; estimate: boolean; kind: "packages" | "restock" };

export type WeekTotals = {
  costCents: number;
  budgetCents: number;
  costStatus: Status;
  members: MemberTotals[];
  /** Days with a flex or recipe meal: not fully counted. */
  partialDays: string[];
  costByFood: CostLine[];
  extrasCents: number;
  /** Recipe ingredients with no price. */
  unpricedItems: number;
  worst: Status;
};

export function weekTotals(input: WeekInput): WeekTotals {
  const needs = shoppingNeeds(input);
  const extrasCents = input.extras.reduce((n, e) => n + (e.priceCents !== null && !e.isPantry ? e.priceCents : 0), 0);
  const foodCents = needs.reduce((n, f) => n + f.budgetCents, 0);
  const costCents = foodCents + extrasCents;

  const members: MemberTotals[] = input.eaters
    .filter((e) => e.kind === "member" && e.isActive && e.kcalTarget !== null && e.proteinTarget !== null)
    .map((e) => {
      const kcalTarget = e.kcalTarget!;
      const proteinTarget = e.proteinTarget!;
      const days = memberDays(input, e).map((d) => ({
        ...d,
        kcalStatus: d.partial ? null : kcalStatus(d.kcal, kcalTarget),
        proteinStatus: d.partial ? null : proteinStatus(d.protein, proteinTarget),
      }));
      const average = weekAverage(days);
      return {
        eaterId: e.id,
        name: e.name,
        color: e.color,
        kcalTarget,
        proteinTarget,
        days,
        average,
        kcalStatus: average ? kcalStatus(average.kcal, kcalTarget) : null,
        proteinStatus: average ? proteinStatus(average.protein, proteinTarget) : null,
      };
    });

  const partialDays = weekDates(input.weekStart).filter((day) =>
    input.weekMeals.some((wm) => wm.day === day && eatersOf(input, wm).length > 0 && notCounted(input, wm)),
  );

  const costByFood: CostLine[] = needs
    .filter((n) => n.budgetCents > 0)
    .map((n) => ({
      foodId: n.food.id,
      name: n.food.name,
      cents: n.budgetCents,
      estimate: n.food.priceIsEstimate,
      kind: n.food.buyMode === "restock" ? ("restock" as const) : ("packages" as const),
    }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));

  const unpricedItems = input.weekMeals.reduce((n, wm) => n + (wm.recipeId ? (input.recipeUses.get(wm.id)?.unpriced ?? 0) : 0), 0);
  const cost = costStatus(costCents, input.budgetCents);
  return {
    costCents,
    budgetCents: input.budgetCents,
    costStatus: cost,
    members,
    partialDays,
    costByFood,
    extrasCents,
    unpricedItems,
    worst: worstStatus([cost, ...members.flatMap((m) => [m.kcalStatus, m.proteinStatus])]),
  };
}

// ---------------------------------------------------------------------------
// One week meal, for the slot sheet and Today

export type EaterPlate = {
  eaterId: string;
  name: string;
  color: Eater["color"];
  lines: { foodId: string; foodName: string; amount: number; text: string; short: string; spoken: string }[];
  kcal: number;
  protein: number;
};

export type MealBreakdown = {
  plates: EaterPlate[];
  /** Food cost at per-gram prices, including the double's extra. */
  costCents: number;
  notCounted: "flex" | "recipe" | null;
};

export function mealBreakdown(input: WeekInput, wm: WeekMeal): MealBreakdown {
  const plates: EaterPlate[] = eatersOf(input, wm).map((e) => {
    const lines = portionsFor(input, wm, e.id).filter((l) => l.amount > 0);
    const n = linesNutrition(lines);
    return {
      eaterId: e.id,
      name: e.name,
      color: e.color,
      lines: lines.map((l) => {
        const d = formatCooked(l.food, l.amount);
        return { foodId: l.food.id, foodName: l.food.name, amount: l.amount, text: d.text, short: d.amount, spoken: d.spoken };
      }),
      kcal: n.kcal,
      protein: n.protein,
    };
  });

  let cents = 0;
  if (!wm.leftoverOf) {
    if (wm.recipeId) {
      for (const use of input.recipeUses.get(wm.id)?.foods ?? []) {
        const food = input.foods.get(use.foodId);
        if (food) cents += use.grams * centsPerGram(food);
      }
    } else {
      const eaters = [...eatersOf(input, wm), ...(wm.isDouble ? leftoverEaters(input) : [])];
      for (const e of eaters) for (const l of portionsFor(input, wm, e.id)) cents += l.grams * centsPerGram(l.food);
    }
  }
  return { plates, costCents: Math.round(cents), notCounted: notCounted(input, wm) };
}

// ---------------------------------------------------------------------------
// 8.7 Tasks for Today

export type TaskKind = "prep" | "pack" | "thaw" | "freeze";

export type PrepTask = {
  key: string;
  date: string;
  kind: TaskKind;
  title: string;
  /** One line per eater, or other detail. */
  detail: string[];
};

/** The date of a prep weekday: 0 is the Sunday before the week, 1..7 Mon..Sun. */
export function prepDate(weekStart: string, weekday: number): string {
  return addDays(weekStart, weekday - 1);
}

/** Weekdays a prep day covers: from the next day until the following prep day (or Sunday). */
export function prepCoverage(prepWeekdays: number[]): Map<number, number[]> {
  const days = [...new Set(prepWeekdays)].filter((d) => d >= 0 && d <= 7).sort((a, b) => a - b);
  const out = new Map<number, number[]>();
  days.forEach((p, i) => {
    const until = i + 1 < days.length ? days[i + 1] : 7;
    const covered: number[] = [];
    for (let d = p + 1; d <= until; d++) covered.push(d);
    out.set(p, covered);
  });
  return out;
}

function weekdayOf(weekStart: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000) + 1;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Gabriel 2 × 6 oz cooked, Anna 2 × 4½ oz cooked" */
function eaterCounts(food: Food, perEater: Map<string, { name: string; amounts: number[] }>): string[] {
  const out: string[] = [];
  for (const { name, amounts } of perEater.values()) {
    const byAmount = new Map<number, number>();
    for (const a of amounts) if (a > 0) byAmount.set(a, (byAmount.get(a) ?? 0) + 1);
    const parts = [...byAmount].map(([a, n]) => {
      const d = formatCooked(food, a);
      return `${n} × ${food.unitKind === "count" ? d.text : d.amount}`;
    });
    if (parts.length) out.push(`${name} ${parts.join(" + ")}`);
  }
  return out;
}

/** Bites and other batches read better in cups; cooked foods as raw weight. */
const BATCH = /bites?|batch/i;

export function weekTasks(input: WeekInput, prepWeekdays: number[]): PrepTask[] {
  const tasks: PrepTask[] = [];
  const shoppingDay = addDays(input.weekStart, -1);
  const coreMeals = input.weekMeals.filter((wm) => !wm.leftoverOf && wm.coreMealId && !mealOf(input, wm)?.isFlex);

  // Prep days
  for (const [p, covered] of prepCoverage(prepWeekdays)) {
    const date = prepDate(input.weekStart, p);
    const groups = new Map<string, { prepAs: string; food: Food; total: number; perEater: Map<string, { name: string; amounts: number[] }> }>();
    for (const wm of coreMeals) {
      if (wm.noPrep || !covered.includes(weekdayOf(input.weekStart, wm.day))) continue;
      for (const eater of eatersOf(input, wm)) {
        for (const line of portionsFor(input, wm, eater.id)) {
          if (!line.component.prepAs || line.amount <= 0) continue;
          const key = `${line.component.prepAs}:${line.food.id}`;
          const g = groups.get(key) ?? { prepAs: line.component.prepAs, food: line.food, total: 0, perEater: new Map() };
          g.total += line.amount;
          const pe = g.perEater.get(eater.id) ?? { name: eater.name, amounts: [] };
          pe.amounts.push(line.amount);
          g.perEater.set(eater.id, pe);
          groups.set(key, g);
        }
      }
    }
    const sorted = [...groups.values()].sort((a, b) => a.prepAs.localeCompare(b.prepAs) || a.food.name.localeCompare(b.food.name));
    for (const g of sorted) {
      const batch = BATCH.test(g.prepAs);
      const amount = formatRaw(g.food, g.total, { cups: batch });
      tasks.push({
        key: `${date}:prep:${g.prepAs}:${g.food.id}`,
        date,
        kind: "prep",
        title: `${capitalize(g.prepAs)}: ${batch ? amount : `cook ${amount}`}`,
        detail: eaterCounts(g.food, g.perEater),
      });
    }
  }

  // Pack leftovers, the evening of each double dinner
  for (const wm of input.weekMeals) {
    if (!wm.isDouble || wm.leftoverOf) continue;
    const parts = leftoverEaters(input)
      .map((m) => {
        const lines = portionsFor(input, wm, m.id).filter((l) => l.amount > 0);
        return lines.length ? `${m.name} ${lines.map((l) => formatCooked(l.food, l.amount).text).join(" · ")}` : null;
      })
      .filter((s): s is string => s !== null);
    if (!parts.length && !wm.recipeId) continue;
    tasks.push({
      key: `${wm.day}:pack:${wm.id}`,
      date: wm.day,
      kind: "pack",
      title: "Pack tomorrow's lunches",
      detail: parts.length ? parts : ["Pack a lunch for each of you from tonight's dinner."],
    });
  }

  // Thaw: the evening before dinners from Wednesday on; freeze on shopping day
  const thawFrom = addDays(shoppingDay, 3);
  const frozen = new Map<string, Food>();
  for (const wm of coreMeals) {
    if (wm.slot !== "dinner" || wm.day < thawFrom) continue;
    const eaters = [...eatersOf(input, wm), ...(wm.isDouble ? leftoverEaters(input) : [])];
    const byFood = new Map<string, { food: Food; amount: number }>();
    for (const e of eaters) {
      for (const l of portionsFor(input, wm, e.id)) {
        if (l.food.category !== "protein" || l.food.cookedYield >= 1 || l.amount <= 0) continue;
        const f = byFood.get(l.food.id) ?? { food: l.food, amount: 0 };
        f.amount += l.amount;
        byFood.set(l.food.id, f);
      }
    }
    if (!byFood.size) continue;
    const date = addDays(wm.day, -1);
    const weekday = WEEKDAY_NAMES[weekdayOf(input.weekStart, wm.day)];
    for (const f of byFood.values()) frozen.set(f.food.id, f.food);
    tasks.push({
      key: `${date}:thaw:${wm.id}`,
      date,
      kind: "thaw",
      title: `Tonight: move ${[...byFood.values()].map((f) => formatRaw(f.food, f.amount)).join(" and ")} to the fridge for ${weekday}.`,
      detail: [],
    });
  }
  if (frozen.size) {
    tasks.push({
      key: `${shoppingDay}:freeze`,
      date: shoppingDay,
      kind: "freeze",
      title: `Freeze: ${[...frozen.values()].map((f) => f.name.toLowerCase()).sort().join(", ")}`,
      detail: ["Needed Wednesday or later. Thaw reminders show the night before."],
    });
  }

  const order: Record<TaskKind, number> = { freeze: 0, prep: 1, pack: 2, thaw: 3 };
  return tasks.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
}
