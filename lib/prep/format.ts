// Units for Prep (PRD-prep 12): everything is stored in grams (or a count for
// count foods); lb, oz and cups only appear through these functions.
import { formatNumber } from "@/lib/quantity";
import type { Food } from "@/lib/prep/types";

export const G_PER_OZ = 28.3495;
export const G_PER_LB = 453.592;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 1197 → "$11.97" */
export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Grams of food for an amount (count foods store a count). */
export function gramsOf(food: Pick<Food, "unitKind" | "gramsPerCount">, amount: number): number {
  return food.unitKind === "count" ? amount * (food.gramsPerCount ?? 0) : amount;
}

/** One package in grams. */
export function packageGrams(food: Pick<Food, "unitKind" | "gramsPerCount" | "packageAmount">): number {
  return gramsOf(food, food.packageAmount);
}

/** 794 g → "1¾ lb"; under a pound, grams to the nearest 5 ("170 g"). */
export function formatWeight(grams: number): string {
  if (grams >= G_PER_LB * 0.875) return `${formatNumber(Math.max(0.25, roundTo(grams / G_PER_LB, 0.25)))} lb`;
  return `${Math.max(5, roundTo(grams, 5))} g`;
}

/** 170.1 g → "6 oz"; nearest ¼ oz. */
export function formatOunces(grams: number): string {
  return `${formatNumber(roundTo(grams / G_PER_OZ, 0.25))} oz`;
}

/** A shortfall for the list note: "≈ 2 oz short". */
export function formatShort(grams: number): string {
  return grams >= G_PER_LB ? `≈ ${formatWeight(grams)} short` : `≈ ${formatNumber(Math.max(0.5, roundTo(grams / G_PER_OZ, 0.5)))} oz short`;
}

/** "Eggs" → "egg" for one; "Bell peppers" → "bell pepper". */
function countNoun(name: string, count: number): string {
  const lower = name.toLowerCase();
  return count <= 1 && lower.endsWith("s") && !lower.endsWith("ss") ? lower.slice(0, -1) : lower;
}

/** A count close to a quarter reads as a count ("½ banana"); otherwise grams do better. */
function niceCount(count: number): boolean {
  return count > 0 && Math.abs(count * 4 - Math.round(count * 4)) < 0.05;
}

export type DisplayAmount = {
  /** Just the amount: "6 oz cooked", "1½ cups", "3". */
  amount: string;
  /** Amount and food: "6 oz cooked chicken breast". */
  text: string;
  /** For screen readers: "6 ounces cooked chicken breast". */
  spoken: string;
};

function speak(text: string): string {
  return text
    .replace(/(\d)¼/g, "$1 and a quarter")
    .replace(/(\d)½/g, "$1 and a half")
    .replace(/(\d)¾/g, "$1 and three quarters")
    .replace(/¼/g, "a quarter")
    .replace(/½/g, "half")
    .replace(/¾/g, "three quarters")
    .replace(/⅛/g, "an eighth")
    .replace(/ oz\b/g, " ounces")
    .replace(/ g\b/g, " grams")
    .replace(/ lb\b/g, " pounds");
}

/**
 * How one portion reads on Today (§8.2): meat and potatoes as cooked weight
 * (proteins in oz, starches in g), count foods as a count, foods with a cup
 * size in cups, everything else in grams.
 */
export function formatCooked(food: Food, amount: number): DisplayAmount {
  const name = food.name.toLowerCase();
  let qty: string;
  let noun = name;
  if (food.unitKind === "count" && niceCount(amount)) {
    qty = formatNumber(roundTo(amount, 0.25));
    noun = countNoun(food.name, amount);
  } else {
    const grams = gramsOf(food, amount);
    if (food.cookedYield !== 1) {
      const cooked = grams * food.cookedYield;
      qty = `${food.category === "protein" ? formatOunces(cooked) : `${Math.round(cooked / 5) * 5} g`} cooked`;
    } else if (food.displayCupG) {
      const cups = grams / food.displayCupG;
      const rounded = cups < 1 ? Math.max(0.125, roundTo(cups, 0.125)) : roundTo(cups, 0.25);
      qty = `${formatNumber(rounded)} ${rounded > 1 ? "cups" : "cup"}`;
    } else {
      qty = `${Math.round(grams)} g`;
    }
  }
  const text = `${qty} ${noun}`;
  return { amount: qty, text, spoken: speak(text) };
}

/** Raw amount for prep tasks and lists: "1¾ lb chicken breast", "6 eggs", "3 cups liquid egg whites". */
export function formatRaw(food: Food, amount: number, opts: { cups?: boolean } = {}): string {
  const name = food.name.toLowerCase();
  if (food.unitKind === "count") {
    return `${formatNumber(Math.ceil(amount * 4 - 0.05) / 4)} ${countNoun(food.name, amount)}`;
  }
  if (opts.cups && food.displayCupG) {
    const cups = roundTo(amount / food.displayCupG, 0.25);
    return `${formatNumber(Math.max(0.25, cups))} ${cups > 1 ? "cups" : "cup"} ${name}`;
  }
  return `${formatWeight(amount)} ${name}`;
}

export type ParsedAmount = { amount: number } | { error: string };

/**
 * A portion or package as typed: "227", "227 g", "8 oz", "1.5 lb", "6 oz cooked",
 * "1 cup", "3" (count foods). Returns what is stored: grams as purchased, or a
 * count for count foods.
 */
export function parseAmount(text: string, food: Pick<Food, "unitKind" | "gramsPerCount" | "cookedYield" | "displayCupG">): ParsedAmount {
  const m = text
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*(g|grams?|oz|ounces?|lb|lbs|pounds?|cups?|ct|count|each|x)?\s*(cooked)?$/);
  if (!m) return { error: "Type an amount, like 227 g, 6 oz cooked or 3" };
  const n = Number(m[1]);
  if (!(n >= 0) || n > 100_000) return { error: "That amount is out of range" };
  const unit = m[2] ?? "";
  const cooked = Boolean(m[3]);
  let grams: number | null;
  if (unit === "" || ["ct", "count", "each", "x"].includes(unit)) {
    if (food.unitKind === "count") return cooked ? { error: "Counts can't be cooked weights" } : { amount: n };
    if (unit !== "") return { error: "This food is weighed, not counted" };
    grams = n;
  } else if (unit.startsWith("g")) grams = n;
  else if (unit.startsWith("o")) grams = n * G_PER_OZ;
  else if (unit.startsWith("l") || unit.startsWith("p")) grams = n * G_PER_LB;
  else {
    if (!food.displayCupG) return { error: "Cups aren't set for this food; use grams" };
    grams = n * food.displayCupG;
  }
  if (cooked) grams = grams / (food.cookedYield || 1);
  const amount = food.unitKind === "count" ? grams / (food.gramsPerCount || 1) : grams;
  return { amount: Math.round(amount * 100) / 100 };
}
