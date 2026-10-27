import { describe, expect, it } from "vitest";
import { canonicalName, RecipeDraft, SourceUrl, uniqueTags } from "./recipe-draft";

// The example from PRD 7.4.
const prdExample = {
  no_recipe_found: false,
  title: "Crispy Garlic Parmesan Chicken",
  description: "Weeknight sheet-pan chicken.",
  servings: 4,
  prep_minutes: 10,
  cook_minutes: 25,
  ingredients: [
    {
      section: null,
      raw_text: "1 1/2 lb chicken thighs, boneless",
      quantity: 1.5,
      quantity_max: null,
      unit: "lb",
      name: "chicken thigh",
      prep_note: "boneless",
      is_optional: false,
      aisle: "meat_seafood",
    },
  ],
  steps: [{ section: null, text: "Heat oven to 425°F." }],
  tags: ["Dinner", "Chicken"],
  creator_name: "Jane Cooks",
  creator_handle: "@janecooks",
  conflicts: [{ field: "parmesan quantity", caption_value: "1/2 cup", video_value: "1 cup", chosen: "video" }],
  confidence: "high",
  notes: null,
};

describe("RecipeDraft", () => {
  it("accepts the PRD example", () => {
    expect(RecipeDraft.safeParse(prdExample).success).toBe(true);
  });

  it("requires a title and 1–50 whole servings", () => {
    expect(RecipeDraft.safeParse({ ...prdExample, title: "  " }).success).toBe(false);
    expect(RecipeDraft.safeParse({ ...prdExample, servings: 0 }).success).toBe(false);
    expect(RecipeDraft.safeParse({ ...prdExample, servings: 51 }).success).toBe(false);
    expect(RecipeDraft.safeParse({ ...prdExample, servings: 2.5 }).success).toBe(false);
  });

  it("rejects unknown units and aisles", () => {
    const bad = (patch: object) => ({ ...prdExample, ingredients: [{ ...prdExample.ingredients[0], ...patch }] });
    expect(RecipeDraft.safeParse(bad({ unit: "handful" })).success).toBe(false);
    expect(RecipeDraft.safeParse(bad({ aisle: "garden" })).success).toBe(false);
  });

  it("rejects a range whose top isn't above the bottom", () => {
    const ing = { ...prdExample.ingredients[0], quantity: 3, quantity_max: 2 };
    expect(RecipeDraft.safeParse({ ...prdExample, ingredients: [ing] }).success).toBe(false);
  });

  it("caps tags at 5 and turns blank text into null", () => {
    expect(RecipeDraft.safeParse({ ...prdExample, tags: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
    const parsed = RecipeDraft.parse({ ...prdExample, description: "   " });
    expect(parsed.description).toBeNull();
  });
});

describe("helpers", () => {
  it("canonicalizes ingredient names", () => {
    expect(canonicalName("  Yellow   Onion ")).toBe("yellow onion");
  });

  it.each([
    ["Onions", "onion"],
    ["eggs", "egg"],
    ["Cherry Tomatoes", "cherry tomato"],
    ["raspberries", "raspberry"],
    ["bay leaves", "bay leaf"],
    ["peaches", "peach"],
    ["chicken thighs", "chicken thigh"],
    ["hummus", "hummus"],
    ["molasses", "molasses"],
    ["rolled oats", "rolled oats"],
    ["asparagus", "asparagus"],
    ["swiss", "swiss"],
    ["peas", "pea"],
    ["glass", "glass"],
    ["chickpeas", "chickpea"],
    ["bananas", "banana"],
    ["boxes", "box"],
  ])("singularizes %j → %j", (input, out) => {
    expect(canonicalName(input)).toBe(out);
  });

  it("dedupes tags case-insensitively", () => {
    expect(uniqueTags(["Dinner", "dinner ", " Quick", "", "DINNER"])).toEqual(["Dinner", "Quick"]);
  });

  it("only accepts http(s) source links", () => {
    expect(SourceUrl.parse("https://example.com/r")).toBe("https://example.com/r");
    expect(SourceUrl.parse("")).toBeNull();
    expect(SourceUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(SourceUrl.safeParse("example.com").success).toBe(false);
  });
});
