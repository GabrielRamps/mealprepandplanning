import { describe, expect, it } from "vitest";
import { AISLES, DEFAULT_AISLE_ORDER } from "@/lib/enums";
import { guessAisle, isAisleOrder } from "./aisles";

describe("guessAisle", () => {
  it.each([
    ["yellow onion", "produce"],
    ["garlic", "produce"],
    ["bell pepper", "produce"],
    ["red pepper flake", "spices_baking"],
    ["black pepper", "spices_baking"],
    ["garlic powder", "spices_baking"],
    ["salt", "spices_baking"],
    ["olive oil", "pantry"],
    ["olive", "canned_jarred"],
    ["chicken broth", "canned_jarred"],
    ["chicken thigh", "meat_seafood"],
    ["ground beef", "meat_seafood"],
    ["rotisserie chicken", "deli"],
    ["butter", "dairy_eggs"],
    ["peanut butter", "condiments"],
    ["butternut squash", "produce"],
    ["cream cheese", "dairy_eggs"],
    ["coconut milk", "canned_jarred"],
    ["egg", "dairy_eggs"],
    ["eggplant", "produce"],
    ["egg noodle", "pasta_grains"],
    ["spaghetti", "pasta_grains"],
    ["frozen pea", "frozen"],
    ["pea", "produce"],
    ["soy sauce", "condiments"],
    ["tortilla", "bakery"],
    ["sparkling water", "beverages"],
    ["paper towel", "household"],
    ["unobtainium", "other"],
  ])("%s → %s", (name, aisle) => {
    expect(guessAisle(name)).toBe(aisle);
  });
});

describe("isAisleOrder", () => {
  it("accepts every aisle once, in any order", () => {
    expect(isAisleOrder([...DEFAULT_AISLE_ORDER])).toBe(true);
    expect(isAisleOrder([...AISLES].reverse())).toBe(true);
  });

  it("rejects missing, repeated or unknown aisles", () => {
    expect(isAisleOrder(DEFAULT_AISLE_ORDER.slice(1))).toBe(false);
    expect(isAisleOrder([...DEFAULT_AISLE_ORDER.slice(1), "deli"])).toBe(false);
    expect(isAisleOrder([...DEFAULT_AISLE_ORDER.slice(1), "garden"])).toBe(false);
    expect(isAisleOrder("produce")).toBe(false);
    expect(isAisleOrder(null)).toBe(false);
  });
});
