import { describe, expect, it } from "vitest";
import { formatAmount, formatNumber, ingredientText, parseQuantity, quantityToInput } from "./quantity";

describe("parseQuantity", () => {
  it.each([
    ["2", 2, null],
    ["1.5", 1.5, null],
    [".5", 0.5, null],
    ["1/2", 0.5, null],
    ["1 1/2", 1.5, null],
    ["1½", 1.5, null],
    ["1 ½", 1.5, null],
    ["¾", 0.75, null],
    ["2-3", 2, 3],
    ["2 – 3", 2, 3],
    ["2 to 3", 2, 3],
    ["1/2-1", 0.5, 1],
  ])("reads %j", (text, quantity, quantityMax) => {
    expect(parseQuantity(text)).toEqual({ quantity, quantityMax });
  });

  it("treats blank as no amount", () => {
    expect(parseQuantity("  ")).toEqual({ quantity: null, quantityMax: null });
  });

  it.each(["abc", "1/0", "0", "3-2", "2-2", "1-2-3", "1 2 3", "-1"])("rejects %j", (text) => {
    expect(parseQuantity(text)).toBeNull();
  });
});

describe("formatNumber", () => {
  it.each([
    [2, "2"],
    [0.5, "½"],
    [1.5, "1½"],
    [1 / 3, "⅓"],
    [2 / 3, "⅔"],
    [0.25, "¼"],
    [0.75, "¾"],
    [0.375, "⅜"],
    [0.999, "1"],
    [2.4, "2.4"],
    [675, "675"],
    [12.34, "12⅓"],
    [12.42, "12.4"],
  ])("%d → %s", (n, text) => {
    expect(formatNumber(n)).toBe(text);
  });
});

describe("scaling 4 → 6 servings (factor 1.5)", () => {
  const factor = 6 / 4;
  it.each([
    [2, null, "cup", "3 cups"],
    [1, null, "tbsp", "1½ tbsp"],
    [0.25, null, "tsp", "⅜ tsp"],
    [1 / 3, null, "cup", "½ cup"],
    [2, 3, "clove", "3–4½ cloves"],
    [1, null, null, "1½"],
    [450, null, "g", "675 g"],
  ] as const)("%d–%s %s", (quantity, quantityMax, unit, text) => {
    expect(formatAmount(quantity, quantityMax, unit, factor)).toBe(text);
  });

  it("leaves amount-less rows blank", () => {
    expect(formatAmount(null, null, null, factor)).toBe("");
  });
});

describe("unit labels", () => {
  it("pluralizes words but not abbreviations", () => {
    expect(formatAmount(1, null, "cup")).toBe("1 cup");
    expect(formatAmount(0.5, null, "cup")).toBe("½ cup");
    expect(formatAmount(2, null, "cup")).toBe("2 cups");
    expect(formatAmount(2, null, "tbsp")).toBe("2 tbsp");
    expect(formatAmount(2, null, "bunch")).toBe("2 bunches");
  });
});

describe("round trips", () => {
  it.each([
    [1.5, null, "1 1/2"],
    [0.25, null, "1/4"],
    [2, 3, "2-3"],
    [0.4, null, "0.4"],
    [null, null, ""],
  ] as const)("%s/%s → %j", (q, max, text) => {
    expect(quantityToInput(q, max)).toBe(text);
    expect(parseQuantity(text)).toEqual({ quantity: q, quantityMax: max });
  });

  it("builds raw text for hand-typed rows", () => {
    expect(
      ingredientText({ quantity: 2, quantityMax: null, unit: "clove", name: "garlic", prepNote: "minced" }),
    ).toBe("2 cloves garlic, minced");
    expect(ingredientText({ quantity: null, quantityMax: null, unit: null, name: "salt", prepNote: "to taste" })).toBe(
      "salt, to taste",
    );
  });
});
