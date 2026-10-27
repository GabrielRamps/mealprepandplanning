// Grocery list algorithm (PRD 8.2): collect, scale, convert, merge, round,
// group. Pure functions; the database layer feeds them and saves the result.
import type { Aisle } from "@/lib/enums";
import { AISLE_LABELS } from "@/lib/grocery/aisles";
import { UNIT_FACTOR, type UnitCode, unitFamily } from "@/lib/units";

export type BuildIngredient = {
  ingredientId: string | null;
  name: string; // canonical, lowercase singular
  quantity: number | null;
  quantityMax: number | null;
  unit: UnitCode | null;
  rawText: string;
  isOptional: boolean;
  aisle: Aisle;
  isPantryStaple: boolean;
};

export type BuildRecipe = { id: string; title: string; servings: number; ingredients: BuildIngredient[] };

/** One recipe on the list at a target number of servings. */
export type BuildRequest = { recipe: BuildRecipe; servings: number };

export type ItemSource = {
  recipe_id: string;
  recipe_title: string;
  quantity: number | null; // scaled, in the recipe's own unit
  unit: string | null;
  raw_text: string;
  optional: boolean;
};

export type BuiltItem = {
  mergeKey: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: UnitCode | null;
  aisle: Aisle;
  isPantry: boolean;
  sources: ItemSource[];
};

const METRIC = new Set<UnitCode>(["ml", "l", "g", "kg"]);
const EPS = 1e-9;

type Family = "volume" | "weight" | "package" | "count" | "none";

type Acc = {
  ingredientId: string | null;
  name: string;
  family: Family;
  packageUnit: UnitCode | null;
  total: number; // base units (ml, g) for volume and weight
  allMetric: boolean;
  aisle: Aisle;
  isPantry: boolean;
  sources: ItemSource[];
};

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Step 5 for volumes: cups from ¼ cup, then tbsp from 1 tbsp, else tsp; nearest ⅛. */
function displayVolume(ml: number, metric: boolean): { quantity: number; unit: UnitCode } {
  if (metric) return ml >= 1000 ? { quantity: round2(ml / 1000), unit: "l" } : { quantity: Math.round(ml), unit: "ml" };
  const cups = ml / UNIT_FACTOR.cup!;
  if (cups >= 0.25 - EPS) return { quantity: roundTo(cups, 1 / 8), unit: "cup" };
  const tbsp = ml / UNIT_FACTOR.tbsp!;
  if (tbsp >= 1 - EPS) return { quantity: roundTo(tbsp, 1 / 8), unit: "tbsp" };
  return { quantity: Math.max(1 / 8, roundTo(ml / UNIT_FACTOR.tsp!, 1 / 8)), unit: "tsp" };
}

/** Step 5 for weights: lb from 1 lb, else oz to the nearest 0.5; g/kg when every source was metric. */
function displayWeight(g: number, metric: boolean): { quantity: number; unit: UnitCode } {
  if (metric) return g >= 1000 ? { quantity: round2(g / 1000), unit: "kg" } : { quantity: Math.round(g), unit: "g" };
  const lb = g / UNIT_FACTOR.lb!;
  if (lb >= 1 - EPS) return { quantity: roundTo(lb, 1 / 8), unit: "lb" };
  return { quantity: Math.max(0.5, roundTo(g / UNIT_FACTOR.oz!, 0.5)), unit: "oz" };
}

export function buildList(requests: BuildRequest[]): BuiltItem[] {
  // 1. Collect: the same recipe twice (two dinners) adds its servings together.
  const collected = new Map<string, BuildRequest>();
  for (const r of requests) {
    const existing = collected.get(r.recipe.id);
    if (existing) existing.servings += r.servings;
    else collected.set(r.recipe.id, { recipe: r.recipe, servings: r.servings });
  }

  const acc = new Map<string, Acc>();
  for (const { recipe, servings } of collected.values()) {
    // 2. Scale; ranges shop with the top of the range.
    const factor = servings / recipe.servings;
    for (const ing of recipe.ingredients) {
      const amount = ing.quantityMax ?? ing.quantity;
      const scaled = amount === null ? null : amount * factor;
      const family: Family = scaled === null ? "none" : ing.unit ? unitFamily(ing.unit) : "count";

      // 4. Merge by ingredient and family (or the exact package unit).
      const familyKey = family === "package" ? ing.unit! : family;
      const key = `${ing.ingredientId ?? `name:${ing.name}`}:${familyKey}`;
      let a = acc.get(key);
      if (!a) {
        a = {
          ingredientId: ing.ingredientId,
          name: ing.name,
          family,
          packageUnit: family === "package" ? ing.unit : null,
          total: 0,
          allMetric: true,
          aisle: ing.aisle,
          isPantry: ing.isPantryStaple,
          sources: [],
        };
        acc.set(key, a);
      }
      if (scaled !== null) {
        // 3. Convert volume and weight to the base unit.
        const toBase = family === "volume" || family === "weight" ? UNIT_FACTOR[ing.unit!]! : 1;
        a.total += scaled * toBase;
        if ((family === "volume" || family === "weight") && !METRIC.has(ing.unit!)) a.allMetric = false;
      }
      a.sources.push({
        recipe_id: recipe.id,
        recipe_title: recipe.title,
        quantity: scaled,
        unit: ing.unit,
        raw_text: ing.rawText,
        optional: ing.isOptional,
      });
    }
  }

  // "Salt to taste" joins a line that already has an amount of the same thing.
  for (const [key, a] of acc) {
    if (a.family !== "none") continue;
    const sibling = [...acc.values()].find((o) => o !== a && o.family !== "none" && o.name === a.name && o.ingredientId === a.ingredientId);
    if (sibling) {
      sibling.sources.push(...a.sources);
      acc.delete(key);
    }
  }

  // 5. Round and pick display units.
  const items: BuiltItem[] = [];
  for (const [mergeKey, a] of acc) {
    let quantity: number | null = null;
    let unit: UnitCode | null = null;
    if (a.family === "volume") ({ quantity, unit } = displayVolume(a.total, a.allMetric));
    else if (a.family === "weight") ({ quantity, unit } = displayWeight(a.total, a.allMetric));
    else if (a.family === "package" || a.family === "count") {
      quantity = Math.max(1, Math.ceil(a.total - EPS));
      unit = a.packageUnit;
    }
    items.push({
      mergeKey,
      ingredientId: a.ingredientId,
      name: a.name,
      quantity,
      unit,
      aisle: a.aisle,
      isPantry: a.isPantry,
      sources: a.sources,
    });
  }
  return items.sort((x, y) => x.name.localeCompare(y.name) || x.mergeKey.localeCompare(y.mergeKey));
}

/** Optional only when every recipe that needs it marks it optional. */
export function isOptionalItem(sources: { optional?: boolean }[]): boolean {
  return sources.length > 0 && sources.every((s) => s.optional);
}

export type GroupableItem = { aisle: Aisle; isPantry: boolean; isChecked: boolean; name: string };
export type ItemGroup<T> = { key: string; label: string; items: T[] };

export const PANTRY_GROUP = "pantry-staples";

/**
 * 6. Group by aisle in the household's order; pantry staples go last under
 * "Check you have". Checked items sink to the bottom of their group (E2).
 */
export function groupItems<T extends GroupableItem>(items: T[], aisleOrder: readonly Aisle[]): ItemGroup<T>[] {
  const order = [...aisleOrder, ...Object.keys(AISLE_LABELS).filter((a) => !aisleOrder.includes(a as Aisle))];
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.isPantry ? PANTRY_GROUP : item.aisle;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const sorted = (list: T[]) =>
    [...list].sort((a, b) => Number(a.isChecked) - Number(b.isChecked) || a.name.localeCompare(b.name));
  const out: ItemGroup<T>[] = [];
  for (const aisle of order) {
    const list = groups.get(aisle);
    if (list) out.push({ key: aisle, label: AISLE_LABELS[aisle as Aisle], items: sorted(list) });
  }
  const pantry = groups.get(PANTRY_GROUP);
  if (pantry) out.push({ key: PANTRY_GROUP, label: "Check you have", items: sorted(pantry) });
  return out;
}
