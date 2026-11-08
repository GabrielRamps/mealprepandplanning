import { describe, expect, it } from "vitest";
import { itemLine } from "@/lib/grocery/copy-text";
import { seedFixture } from "@/lib/prep/fixtures";
import { estimatedTotal, type ListContext, prepListItems } from "@/lib/prep/list-items";
import { SEED_FOODS } from "@/lib/prep/seed-data";
import type { Food } from "@/lib/prep/types";

function ctx(f: ReturnType<typeof seedFixture>, extra: Partial<ListContext> = {}): ListContext {
  return {
    shelf: (food: Food) => ({ ingredientId: `ing-${food.id}`, aisle: SEED_FOODS.find((s) => s.name === food.name)!.aisle, isPantry: false }),
    extras: f.seed.templateExtras.filter((x) => x.templateId === f.seed.templates[0].id),
    recipes: new Map(),
    foodByIngredient: new Map(),
    ...extra,
  };
}

describe("prepListItems", () => {
  it("core foods in packages with notes and prices", () => {
    const f = seedFixture(0);
    const items = prepListItems(f.input, ctx(f));
    const breast = items.find((i) => i.name === "Chicken breast")!;
    expect(breast).toMatchObject({ quantity: 3, unit: "package", priceCents: 3591, aisle: "meat_seafood", isPantry: false });
    expect(breast.mergeKey).toBe(`core:${f.food("Chicken breast").id}`);
    expect(breast.note).toBe("3 lb family pack · $11.97 each · 7 lb needed");
    expect(itemLine({ ...breast, isChecked: false })).toBe("Chicken breast — 3 lb family pack × 3");
    expect(breast.sources.map((s) => s.recipe_title)).toContain("Dinner plate (double) · Wed");
    expect(breast.sources.every((s) => s.kind === "prep")).toBe(true);
  });

  it("restock foods go in Check you have, priced only when bought this week", () => {
    const f = seedFixture(0);
    const whey = () => prepListItems(f.input, ctx(f)).find((i) => i.name === "Whey protein")!;
    expect(whey()).toMatchObject({ isPantry: true, priceCents: null, quantity: null });
    f.input.restockBuy = new Set([f.food("Whey protein").id]);
    expect(whey()).toMatchObject({ isPantry: false, priceCents: 2998, quantity: 1, unit: "package" });
  });

  it("extras: pantry ones unpriced with a hint, others priced", () => {
    const f = seedFixture(2);
    const items = prepListItems(f.input, ctx(f, { extras: f.seed.templateExtras.filter((x) => x.templateId === f.seed.templates[2].id) }));
    expect(items.find((i) => i.name === "Marinara")).toMatchObject({ priceCents: 198, isPantry: false });
    expect(items.find((i) => i.name === "Buffalo sauce")).toMatchObject({ priceCents: null, isPantry: true, note: "Lunch bowls · ≈ $2.48 if you need it" });
  });

  it("recipe ingredients matched to a core food merge into it; the rest come from buildList", () => {
    const f = seedFixture(0);
    const friday = f.at(5, "dinner")[0];
    Object.assign(friday, { coreMealId: null, recipeId: "r1", servings: 2, choices: {} });
    const breast = f.food("Chicken breast");
    const recipe = {
      id: "r1",
      title: "Chicken tacos",
      servings: 4,
      ingredients: [
        { ingredientId: "ing-breast", name: "chicken breast", quantity: 2, quantityMax: null, unit: "lb" as const, rawText: "2 lb chicken", isOptional: false, aisle: "meat_seafood" as const, isPantryStaple: false },
        { ingredientId: null, name: "tortilla", quantity: 8, quantityMax: null, unit: null, rawText: "8 tortillas", isOptional: false, aisle: "bakery" as const, isPantryStaple: false },
      ],
    };
    f.input.recipeUses.set(friday.id, { title: recipe.title, foods: [{ foodId: breast.id, grams: 453.592 }], unpriced: 1 });
    const items = prepListItems(f.input, ctx(f, { recipes: new Map([["r1", recipe]]), foodByIngredient: new Map([["ing-breast", breast]]) }));
    const breastItem = items.find((i) => i.name === "Chicken breast")!;
    expect(breastItem.sources.some((s) => s.recipe_id === "r1" && s.recipe_title === "Chicken tacos · Fri")).toBe(true);
    expect(items.find((i) => i.name === "chicken breast")).toBeUndefined();
    expect(items.find((i) => i.name === "tortilla")).toMatchObject({ quantity: 4, priceCents: null });
  });

  it("estimated total counts priced items; unpriced excludes pantry", () => {
    expect(estimatedTotal([{ priceCents: null, isPantry: false }])).toBeNull();
    expect(
      estimatedTotal([
        { priceCents: 1197, isPantry: false },
        { priceCents: null, isPantry: false },
        { priceCents: null, isPantry: true },
      ]),
    ).toEqual({ cents: 1197, unpriced: 1 });
  });
});
