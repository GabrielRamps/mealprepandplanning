import { describe, expect, it } from "vitest";
import { DEFAULT_AISLE_ORDER } from "@/lib/enums";
import { itemLine, listAsText } from "./copy-text";

const base = { note: null, isPantry: false, isChecked: false } as const;

describe("copy list", () => {
  it("package items read as name — package × count", () => {
    expect(
      itemLine({ ...base, name: "Chicken breast", quantity: 2, unit: "package", note: "3 lb family pack · $11.97 each · 7 lb needed", aisle: "meat_seafood" }),
    ).toBe("Chicken breast — 3 lb family pack × 2");
  });
  it("recipe and manual items read as on screen", () => {
    expect(itemLine({ ...base, name: "apples", quantity: 2, unit: "lb", aisle: "produce" })).toBe("2 lb apples");
    expect(itemLine({ ...base, name: "Salsa", quantity: null, unit: null, note: "Tue taco", aisle: "canned_jarred", isPantry: true })).toBe("Salsa (Tue taco)");
  });
  it("groups by aisle in store order, pantry last, checked marked", () => {
    const text = listAsText(
      "Prep · Week of Nov 9",
      [
        { ...base, name: "Salt", quantity: null, unit: null, aisle: "spices_baking", isPantry: true },
        { ...base, name: "Frozen broccoli", quantity: 8, unit: "package", note: "12 oz bag · $1.38 each", aisle: "frozen" },
        { ...base, name: "Bananas", quantity: 4, unit: null, aisle: "produce", isChecked: true },
      ],
      DEFAULT_AISLE_ORDER,
    );
    expect(text).toBe(
      ["Prep · Week of Nov 9", "", "Produce", "✓ 4 Bananas", "", "Frozen", "- Frozen broccoli — 12 oz bag × 8", "", "Check you have", "- Salt"].join("\n"),
    );
  });
});
