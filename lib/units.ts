// Unit codes from PRD 8.1. Volume and weight convert through a base unit
// (ml, g); package units only merge with the same code; null means a plain
// count ("2 eggs").
export const VOLUME_UNITS = ["ml", "l", "tsp", "tbsp", "fl_oz", "cup", "pint", "quart", "gallon"] as const;
export const WEIGHT_UNITS = ["g", "kg", "oz", "lb"] as const;
export const PACKAGE_UNITS = [
  "clove",
  "can",
  "jar",
  "package",
  "bunch",
  "head",
  "slice",
  "stick",
  "sprig",
  "piece",
  "pinch",
  "dash",
] as const;

export const UNIT_CODES = [...VOLUME_UNITS, ...WEIGHT_UNITS, ...PACKAGE_UNITS] as const;
export type UnitCode = (typeof UNIT_CODES)[number];
export type UnitFamily = "volume" | "weight" | "package";

/** Factor to the family's base unit (ml or g). */
export const UNIT_FACTOR: Partial<Record<UnitCode, number>> = {
  ml: 1,
  l: 1000,
  tsp: 4.929,
  tbsp: 14.787,
  fl_oz: 29.574,
  cup: 236.588,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

export function unitFamily(unit: UnitCode): UnitFamily {
  if ((VOLUME_UNITS as readonly string[]).includes(unit)) return "volume";
  if ((WEIGHT_UNITS as readonly string[]).includes(unit)) return "weight";
  return "package";
}

export function isUnitCode(value: unknown): value is UnitCode {
  return typeof value === "string" && (UNIT_CODES as readonly string[]).includes(value);
}

// [singular, plural]; abbreviations don't pluralize.
const LABELS: Record<UnitCode, [string, string]> = {
  ml: ["ml", "ml"],
  l: ["l", "l"],
  tsp: ["tsp", "tsp"],
  tbsp: ["tbsp", "tbsp"],
  fl_oz: ["fl oz", "fl oz"],
  cup: ["cup", "cups"],
  pint: ["pint", "pints"],
  quart: ["quart", "quarts"],
  gallon: ["gallon", "gallons"],
  g: ["g", "g"],
  kg: ["kg", "kg"],
  oz: ["oz", "oz"],
  lb: ["lb", "lb"],
  clove: ["clove", "cloves"],
  can: ["can", "cans"],
  jar: ["jar", "jars"],
  package: ["package", "packages"],
  bunch: ["bunch", "bunches"],
  head: ["head", "heads"],
  slice: ["slice", "slices"],
  stick: ["stick", "sticks"],
  sprig: ["sprig", "sprigs"],
  piece: ["piece", "pieces"],
  pinch: ["pinch", "pinches"],
  dash: ["dash", "dashes"],
};

/** "cup" for 1 or less, "cups" above; null amounts use the singular. */
export function unitLabel(unit: UnitCode, amount: number | null = null): string {
  const [one, many] = LABELS[unit];
  return amount !== null && amount > 1 ? many : one;
}
