// A Prep week as grocery items (PRD-prep P-8): core foods in packages with
// prices, restock foods under "Check you have", the week's extras, and
// library recipe ingredients through buildList. Pure, so it's unit-tested.
import type { GroceryItemSource } from "@/lib/db/schema";
import type { Aisle } from "@/lib/enums";
import { type BuildRecipe, type BuildRequest, buildList } from "@/lib/grocery/build";
import { matchedGrams, shoppingNeeds } from "@/lib/prep/calc";
import { formatMoney, formatShort, formatWeight } from "@/lib/prep/format";
import type { Food, WeekInput } from "@/lib/prep/types";
import { formatNumber } from "@/lib/quantity";
import type { UnitCode } from "@/lib/units";

export type PrepItem = {
  mergeKey: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: UnitCode | null;
  note: string | null;
  priceCents: number | null;
  aisle: Aisle;
  isPantry: boolean;
  sources: GroceryItemSource[];
};

export type FoodShelf = { ingredientId: string | null; aisle: Aisle; isPantry: boolean };

export type ListContext = {
  /** Aisle, pantry flag and ingredient per core food. */
  shelf: (food: Food) => FoodShelf;
  extras: { id: string; name: string; forNote: string | null; aisle: Aisle; priceCents: number | null; isPantry: boolean }[];
  /** Recipes behind recipe week meals. */
  recipes: Map<string, BuildRecipe>;
  foodByIngredient: Map<string, Food>;
};

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayShort(weekStart: string, day: string): string {
  const i = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000);
  return DAY[i] ?? day;
}

/** Library recipes at their week servings, with the ingredients already counted as core foods taken out. */
export function recipeRequests(input: WeekInput, ctx: ListContext): BuildRequest[] {
  const out: BuildRequest[] = [];
  for (const wm of input.weekMeals) {
    if (!wm.recipeId || wm.leftoverOf) continue;
    const recipe = ctx.recipes.get(wm.recipeId);
    if (!recipe) continue;
    const servings = wm.servings ?? recipe.servings;
    const factor = servings / recipe.servings;
    out.push({
      recipe: { ...recipe, ingredients: recipe.ingredients.filter((ing) => !matchedGrams(ing, factor, ctx.foodByIngredient)) },
      servings,
    });
  }
  return out;
}

export function prepListItems(input: WeekInput, ctx: ListContext): PrepItem[] {
  const items: PrepItem[] = [];

  for (const need of shoppingNeeds(input)) {
    const { food } = need;
    const shelf = ctx.shelf(food);
    const sources: GroceryItemSource[] = need.sources.map((s) => ({
      recipe_id: s.recipeId ?? "",
      recipe_title: `${s.label} · ${dayShort(input.weekStart, s.day)}`,
      quantity: Math.round(s.grams),
      unit: "g",
      raw_text: "",
      ...(s.recipeId ? {} : { kind: "prep" as const }),
    }));
    const needText =
      food.unitKind === "count"
        ? `${formatNumber(Math.round((need.needG / (food.gramsPerCount || 1)) * 4) / 4)} needed`
        : `${formatWeight(need.needG)} needed`;
    const each = `${food.packageLabel} · ${formatMoney(food.packagePriceCents)} each`;

    if (food.buyMode === "restock") {
      const bought = need.packages > 0;
      items.push({
        mergeKey: `core:${food.id}`,
        ingredientId: shelf.ingredientId,
        name: food.displayName,
        quantity: bought ? 1 : null,
        unit: bought ? "package" : null,
        note: bought ? each : `${food.packageLabel} lasts about ${food.restockWeeks ?? 4} weeks · ${needText}`,
        priceCents: bought ? need.listCostCents : null,
        aisle: shelf.aisle,
        isPantry: !bought,
        sources,
      });
      continue;
    }
    if (need.packages <= 0) continue;
    items.push({
      mergeKey: `core:${food.id}`,
      ingredientId: shelf.ingredientId,
      name: food.displayName,
      quantity: need.packages,
      unit: "package",
      note: [each, need.shortG > 0 ? formatShort(need.shortG) : needText].join(" · "),
      priceCents: need.listCostCents,
      aisle: shelf.aisle,
      isPantry: shelf.isPantry,
      sources,
    });
  }

  for (const e of ctx.extras) {
    items.push({
      mergeKey: `extra:${e.id}`,
      ingredientId: null,
      name: e.name,
      quantity: null,
      unit: null,
      // Pantry extras are "check you have": their price is a hint, not part of the total.
      note: [e.forNote, e.isPantry && e.priceCents !== null ? `≈ ${formatMoney(e.priceCents)} if you need it` : null].filter(Boolean).join(" · ") || null,
      priceCents: e.isPantry ? null : e.priceCents,
      aisle: e.aisle,
      isPantry: e.isPantry,
      sources: [],
    });
  }

  for (const b of buildList(recipeRequests(input, ctx))) {
    items.push({
      mergeKey: b.mergeKey,
      ingredientId: b.ingredientId,
      name: b.name,
      quantity: b.quantity,
      unit: b.unit,
      note: null,
      priceCents: null,
      aisle: b.aisle,
      isPantry: b.isPantry,
      sources: b.sources.map((s) => ({ recipe_id: s.recipe_id, recipe_title: s.recipe_title, quantity: s.quantity, unit: s.unit, raw_text: s.raw_text })),
    });
  }
  return items;
}

/** "Estimated total $X (Y items not priced)" for any list with a price (P-8). */
export function estimatedTotal(items: { priceCents: number | null; isPantry: boolean }[]): { cents: number; unpriced: number } | null {
  if (!items.some((i) => i.priceCents !== null)) return null;
  return {
    cents: items.reduce((n, i) => n + (i.priceCents ?? 0), 0),
    unpriced: items.filter((i) => i.priceCents === null && !i.isPantry).length,
  };
}
