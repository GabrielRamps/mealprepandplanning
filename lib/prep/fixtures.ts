// Test fixtures: the real seed (§11) as a WeekInput, without a database.
import { buildSeed, type SeedMember, type SeedRows } from "@/lib/prep/seed-data";
import { weekMealsFromTemplate } from "@/lib/prep/template";
import type { CoreMeal, Eater, Food, WeekInput, WeekMeal } from "@/lib/prep/types";

export const MEMBERS: SeedMember[] = [
  { userId: "user-g", displayName: "Gabriel Henley", role: "owner" },
  { userId: "user-a", displayName: "Anna", role: "member" },
];

export function seqIds(prefix = "id"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function toFoods(seed: SeedRows): Map<string, Food> {
  return new Map(
    seed.foods.map((f) => [
      f.id,
      {
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
        priceIsEstimate: true,
        buyMode: f.buyMode,
        restockWeeks: f.restockWeeks,
        packageLabel: f.packageLabel,
        displayName: f.name,
      },
    ]),
  );
}

export function toMeals(seed: SeedRows): Map<string, CoreMeal> {
  return new Map(
    seed.meals.map((m) => [
      m.id,
      {
        id: m.id,
        name: m.name,
        slot: m.slot,
        isFlex: m.isFlex,
        components: seed.components
          .filter((c) => c.coreMealId === m.id)
          .map((c) => ({
            id: c.id,
            role: c.role,
            label: null,
            swapCategory: c.swapCategory,
            defaultFoodId: c.defaultFoodId,
            prepAs: c.prepAs,
            portions: Object.fromEntries(seed.portions.filter((p) => p.componentId === c.id).map((p) => [p.eaterId, p.amount])),
          })),
      },
    ]),
  );
}

export function toEaters(seed: SeedRows): Eater[] {
  return seed.eaters.map((e) => ({
    id: e.id,
    kind: e.kind,
    name: e.name,
    color: e.color,
    slots: e.slots,
    isActive: e.isActive,
    kcalTarget: e.kcalTarget,
    proteinTarget: e.proteinTargetG,
  }));
}

export type Fixture = {
  seed: SeedRows;
  input: WeekInput;
  food: (name: string) => Food;
  meal: (name: string) => CoreMeal;
  eater: (name: string) => Eater;
  /** Week meals on a day (1 = Mon) and slot. */
  at: (weekday: number, slot: WeekMeal["slot"]) => WeekMeal[];
};

export const WEEK_START = "2026-11-09";

/** Template `index` (0 = Week 1) as a week starting Mon Nov 9, 2026, Gabriel and Anna only. */
export function seedFixture(index = 0, weekStart = WEEK_START): Fixture {
  const seed = buildSeed(MEMBERS, seqIds());
  const template = seed.templates[index];
  const weekMeals = weekMealsFromTemplate(
    weekStart,
    seed.templateMeals.filter((t) => t.templateId === template.id).map((t) => ({ ...t, recipeId: null, servings: null })),
    seqIds("wm"),
  );
  const input: WeekInput = {
    weekStart,
    foods: toFoods(seed),
    meals: toMeals(seed),
    eaters: toEaters(seed),
    guestsOn: false,
    weekMeals,
    restockBuy: new Set(),
    budgetCents: 17500,
    extras: seed.templateExtras
      .filter((x) => x.templateId === template.id)
      .map((x) => ({ id: x.id, name: x.name, priceCents: x.priceCents, isPantry: x.isPantry })),
    recipeUses: new Map(),
  };
  const byName = <T extends { name: string }>(list: Iterable<T>, name: string): T => {
    const found = [...list].find((x) => x.name === name);
    if (!found) throw new Error(`No ${name}`);
    return found;
  };
  return {
    seed,
    input,
    food: (name) => byName(input.foods.values(), name),
    meal: (name) => byName(input.meals.values(), name),
    eater: (name) => byName(input.eaters, name),
    at: (weekday, slot) => {
      const day = new Date(Date.parse(`${weekStart}T00:00:00Z`) + (weekday - 1) * 86_400_000).toISOString().slice(0, 10);
      return input.weekMeals.filter((m) => m.day === day && m.slot === slot);
    },
  };
}
