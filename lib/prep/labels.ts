// Display names for Prep enums, and small display rules shared by screens.
import type { CoreComponentRole, CoreFoodCategory } from "@/lib/enums";

export const CATEGORY_LABELS: Record<CoreFoodCategory, string> = {
  protein: "Protein",
  starch: "Starch",
  vegetable: "Vegetables",
  fruit: "Fruit",
  dairy_eggs: "Dairy & eggs",
  grain: "Grains",
  fat: "Fats & oils",
  flavor: "Flavor",
  supplement: "Supplements",
  snack: "Snacks",
};

export const ROLE_LABELS: Record<CoreComponentRole, string> = {
  protein: "Protein",
  starch: "Starch",
  vegetable: "Vegetable",
  fat: "Fat",
  other: "Other",
};

export const STALE_DAYS = 60;

/** Prices older than 60 days "may be stale" (P-10). */
export function isPriceStale(updatedAtIso: string, now = Date.now()): boolean {
  return now - Date.parse(updatedAtIso) > STALE_DAYS * 86_400_000;
}

/** 0 = the Sunday before the week, 1..7 = Mon..Sun. */
export const PREP_DAY_LABELS = ["Sun (before)", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
