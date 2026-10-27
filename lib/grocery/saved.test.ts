import { describe, expect, it } from "vitest";
import { reorderContents } from "./saved";

describe("reorderContents", () => {
  it("reorders available recipes and every added item, and names the skipped ones", () => {
    const out = reorderContents({
      recipes: [
        { recipeId: "r1", title: "Tacos", servings: 4, available: true },
        { recipeId: "r2", title: "Old soup", servings: 2, available: false },
        { recipeId: "r3", title: "Pasta", servings: 2.5, available: true },
      ],
      items: [{ name: "paper towels", quantity: null, unit: null, aisle: "household", isPantry: false }],
    });
    expect(out.picks).toEqual([
      { recipeId: "r1", servings: 4 },
      { recipeId: "r3", servings: 2.5 },
    ]);
    expect(out.extraItems).toEqual([{ name: "paper towels", quantity: null, unit: null, aisle: "household", isPantry: false }]);
    expect(out.skipped).toEqual(["Old soup"]);
  });

  it("is empty when nothing is left", () => {
    const out = reorderContents({ recipes: [{ recipeId: "r1", title: "Gone", servings: 1, available: false }], items: [] });
    expect(out.picks).toEqual([]);
    expect(out.extraItems).toEqual([]);
  });
});
