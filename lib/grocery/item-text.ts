// Reads a quick-add grocery item: "2 lb chicken thighs", "1 1/2 cups milk",
// "3 lemons", "paper towels".
import { parseQuantity } from "@/lib/quantity";
import { UNIT_CODES, type UnitCode, unitLabel } from "@/lib/units";

const ALIASES: Record<string, UnitCode> = {
  teaspoon: "tsp",
  teaspoons: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbs: "tbsp",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  kgs: "kg",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  milliliter: "ml",
  milliliters: "ml",
  pkg: "package",
  pack: "package",
  packs: "package",
  "fl oz": "fl_oz",
};
for (const code of UNIT_CODES) {
  ALIASES[code] = code;
  ALIASES[unitLabel(code)] = code;
  ALIASES[unitLabel(code, 2)] = code;
}

export type ParsedItem = { name: string; quantity: number | null; unit: UnitCode | null };

export function parseItemText(text: string): ParsedItem {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  // Up to two leading words that read as one number: "2", "1 1/2", "½".
  for (const take of [2, 1]) {
    if (words.length <= take) continue;
    const parsed = parseQuantity(words.slice(0, take).join(" "));
    if (!parsed || parsed.quantity === null || parsed.quantityMax !== null) continue;
    let rest = words.slice(take);
    let unit: UnitCode | null = null;
    const two = rest.slice(0, 2).join(" ").toLowerCase().replace(/\.$/, "");
    const one = (rest[0] ?? "").toLowerCase().replace(/\.$/, "");
    if (rest.length > 2 && ALIASES[two]) {
      unit = ALIASES[two];
      rest = rest.slice(2);
    } else if (rest.length > 1 && ALIASES[one]) {
      unit = ALIASES[one];
      rest = rest.slice(1);
    }
    if (rest[0]?.toLowerCase() === "of" && rest.length > 1) rest = rest.slice(1);
    return { name: rest.join(" "), quantity: parsed.quantity, unit };
  }
  return { name: words.join(" "), quantity: null, unit: null };
}
