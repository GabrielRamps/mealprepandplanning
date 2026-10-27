import { describe, expect, it } from "vitest";
import { DEFAULT_AISLE_ORDER } from "@/lib/db/schema";
import { formatAmount } from "@/lib/quantity";
import { type BuildIngredient, type BuildRecipe, buildList, groupItems, isOptionalItem } from "./build";

const ing = (name: string, quantity: number | null, unit: BuildIngredient["unit"], extra: Partial<BuildIngredient> = {}): BuildIngredient => ({
  ingredientId: `id-${name}`,
  name,
  quantity,
  quantityMax: null,
  unit,
  rawText: `${quantity ?? ""} ${unit ?? ""} ${name}`.trim(),
  isOptional: false,
  aisle: "other",
  isPantryStaple: false,
  ...extra,
});

const recipe = (id: string, servings: number, ingredients: BuildIngredient[]): BuildRecipe => ({
  id,
  title: `Recipe ${id}`,
  servings,
  ingredients,
});

const shown = (items: ReturnType<typeof buildList>) =>
  Object.fromEntries(items.map((i) => [i.mergeKey, formatAmount(i.quantity, null, i.unit)]));

describe("buildList", () => {
  it("PRD 8.3: 2 cups + 1 tbsp ×2 milk → 2⅛ cups with both sources", () => {
    const milk = { aisle: "dairy_eggs" as const };
    const items = buildList([
      { recipe: recipe("A", 4, [ing("milk", 2, "cup", milk)]), servings: 4 },
      { recipe: recipe("B", 2, [ing("milk", 1, "tbsp", milk)]), servings: 4 },
    ]);
    expect(items).toHaveLength(1);
    const [m] = items;
    expect(m.mergeKey).toBe("id-milk:volume");
    expect(formatAmount(m.quantity, null, m.unit)).toBe("2⅛ cups");
    expect(m.aisle).toBe("dairy_eggs");
    expect(m.sources.map((s) => [s.recipe_id, formatAmount(s.quantity, null, s.unit as "cup")])).toEqual([
      ["A", "2 cups"],
      ["B", "2 tbsp"],
    ]);
  });

  it("adds servings when a recipe appears twice", () => {
    const r = recipe("A", 4, [ing("rice", 1, "cup")]);
    const items = buildList([
      { recipe: r, servings: 4 },
      { recipe: r, servings: 4 },
    ]);
    expect(shown(items)).toEqual({ "id-rice:volume": "2 cups" });
    expect(items[0].sources).toHaveLength(1);
  });

  it("shops with the top of a range", () => {
    const items = buildList([{ recipe: recipe("A", 4, [ing("garlic", 2, "clove", { quantityMax: 3 })]), servings: 6 }]);
    expect(shown(items)).toEqual({ "id-garlic:clove": "5 cloves" }); // 4.5 rounds up
  });

  it("rounds counts and packages up to whole numbers", () => {
    const items = buildList([
      { recipe: recipe("A", 4, [ing("lemon", 1, null), ing("tomato", 1, "can")]), servings: 5 },
    ]);
    expect(shown(items)).toEqual({ "id-lemon:count": "2", "id-tomato:can": "2 cans" });
  });

  it("keeps different families on separate lines, next to each other", () => {
    const items = buildList([
      { recipe: recipe("A", 2, [ing("onion", 1, null)]), servings: 2 },
      { recipe: recipe("B", 2, [ing("onion", 1, "cup", { rawText: "1 cup diced onion" })]), servings: 2 },
    ]);
    expect(items.map((i) => i.mergeKey)).toEqual(["id-onion:count", "id-onion:volume"]);
  });

  it("keeps different package units apart", () => {
    const items = buildList([
      { recipe: recipe("A", 2, [ing("tomato", 1, "can"), ing("tomato", 1, "jar")]), servings: 2 },
    ]);
    expect(Object.keys(shown(items))).toEqual(["id-tomato:can", "id-tomato:jar"]);
  });

  it("folds 'to taste' into an amount line, or keeps it as a bare line", () => {
    const withAmount = buildList([
      { recipe: recipe("A", 2, [ing("salt", 1, "tsp")]), servings: 2 },
      { recipe: recipe("B", 2, [ing("salt", null, null)]), servings: 2 },
    ]);
    expect(withAmount).toHaveLength(1);
    expect(withAmount[0].sources).toHaveLength(2);
    const bare = buildList([
      { recipe: recipe("A", 2, [ing("pepper", null, null)]), servings: 2 },
      { recipe: recipe("B", 2, [ing("pepper", null, null)]), servings: 2 },
    ]);
    expect(bare).toHaveLength(1);
    expect(bare[0].quantity).toBeNull();
    expect(bare[0].sources).toHaveLength(2);
  });

  it.each([
    [[ing("water", 30, "ml")], "id-water:volume", "30 ml"],
    [[ing("water", 30, "ml"), ing("water", 1, "tsp")], "id-water:volume", "2⅜ tbsp"],
    [[ing("vanilla", 1, "tsp")], "id-vanilla:volume", "1 tsp"],
    [[ing("vanilla", 0.1, "tsp")], "id-vanilla:volume", "⅛ tsp"],
    [[ing("water", 30, "ml"), ing("water", 1, "l")], "id-water:volume", "1.03 l"],
    [[ing("flour", 250, "ml")], "id-flour:volume", "250 ml"],
  ])("volume display %#", (ingredients, key, text) => {
    expect(shown(buildList([{ recipe: recipe("A", 1, ingredients), servings: 1 }]))[key]).toBe(text);
  });

  it.each([
    [[ing("beef", 12, "oz"), ing("beef", 0.5, "lb")], "1¼ lb"],
    [[ing("beef", 5.2, "oz")], "5 oz"],
    [[ing("beef", 5.3, "oz")], "5½ oz"],
    [[ing("beef", 400, "g"), ing("beef", 0.8, "kg")], "1.2 kg"],
    [[ing("beef", 450, "g")], "450 g"],
    [[ing("beef", 450, "g"), ing("beef", 1, "lb")], "2 lb"],
  ])("weight display %#", (ingredients, text) => {
    expect(shown(buildList([{ recipe: recipe("A", 1, ingredients), servings: 1 }]))["id-beef:weight"]).toBe(text);
  });

  it("marks optional only when every source is optional", () => {
    expect(isOptionalItem([{ optional: true }, { optional: true }])).toBe(true);
    expect(isOptionalItem([{ optional: true }, { optional: false }])).toBe(false);
    expect(isOptionalItem([])).toBe(false);
  });
});

describe("groupItems", () => {
  const item = (name: string, aisle: BuildIngredient["aisle"], extra: { isPantry?: boolean; isChecked?: boolean } = {}) => ({
    name,
    aisle,
    isPantry: extra.isPantry ?? false,
    isChecked: extra.isChecked ?? false,
  });

  it("orders aisles by the household setting, pantry staples last, checked items sinking", () => {
    const groups = groupItems(
      [
        item("milk", "dairy_eggs"),
        item("apple", "produce", { isChecked: true }),
        item("banana", "produce"),
        item("salt", "spices_baking", { isPantry: true }),
        item("thing", "other"),
      ],
      DEFAULT_AISLE_ORDER,
    );
    expect(groups.map((g) => g.label)).toEqual(["Produce", "Dairy & eggs", "Other", "Check you have"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["banana", "apple"]);
  });
});
