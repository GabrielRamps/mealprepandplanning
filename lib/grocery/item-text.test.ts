import { describe, expect, it } from "vitest";
import { parseItemText } from "./item-text";

describe("parseItemText", () => {
  it.each([
    ["2 lb chicken thighs", { name: "chicken thighs", quantity: 2, unit: "lb" }],
    ["1 1/2 cups milk", { name: "milk", quantity: 1.5, unit: "cup" }],
    ["½ cup sugar", { name: "sugar", quantity: 0.5, unit: "cup" }],
    ["3 lemons", { name: "lemons", quantity: 3, unit: null }],
    ["2 cans of black beans", { name: "black beans", quantity: 2, unit: "can" }],
    ["16 fl oz cream", { name: "cream", quantity: 16, unit: "fl_oz" }],
    ["500 grams flour", { name: "flour", quantity: 500, unit: "g" }],
    ["paper towels", { name: "paper towels", quantity: null, unit: null }],
    ["  Bananas  ", { name: "Bananas", quantity: null, unit: null }],
    ["7 up", { name: "up", quantity: 7, unit: null }],
    ["2", { name: "2", quantity: null, unit: null }],
    ["2 lb", { name: "lb", quantity: 2, unit: null }],
  ])("%j", (text, expected) => {
    expect(parseItemText(text)).toEqual(expected);
  });
});
