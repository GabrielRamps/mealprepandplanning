// Shapes the Prep calculations work on (PRD-prep 8). No database code here, so
// client components and tests can use them.
import type { CoreBuyMode, CoreComponentRole, CoreFoodCategory, CoreUnitKind } from "@/lib/enums";
import type { MealSlot } from "@/lib/plan/week";

export type Slot = MealSlot;

export type Per100g = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };

export type Food = {
  id: string;
  name: string;
  category: CoreFoodCategory;
  unitKind: CoreUnitKind;
  gramsPerCount: number | null;
  per100g: Per100g;
  cookedYield: number;
  displayCupG: number | null;
  packageAmount: number; // grams, or count for count foods
  packagePriceCents: number;
  priceIsEstimate: boolean;
  buyMode: CoreBuyMode;
  restockWeeks: number | null;
  packageLabel: string;
  /** Name on the list: walmart_name, else name. */
  displayName: string;
};

export type Eater = {
  id: string;
  kind: "member" | "guest";
  name: string;
  color: "a" | "b" | "neutral";
  slots: Slot[];
  isActive: boolean;
  kcalTarget: number | null;
  proteinTarget: number | null;
};

export type Component = {
  id: string;
  role: CoreComponentRole;
  label: string | null;
  swapCategory: CoreFoodCategory | null;
  defaultFoodId: string;
  prepAs: string | null;
  /** eaterId -> grams as purchased, or count for count foods. */
  portions: Record<string, number>;
};

export type CoreMeal = { id: string; name: string; slot: Slot; isFlex: boolean; components: Component[] };

export type WeekMeal = {
  id: string;
  day: string;
  slot: Slot;
  coreMealId: string | null;
  recipeId: string | null;
  servings: number | null;
  leftoverOf: string | null;
  choices: Record<string, string>;
  flavor: string | null;
  isDouble: boolean;
  noPrep: boolean;
  position: number;
};

export type Extra = { id: string; name: string; priceCents: number | null; isPantry: boolean };

/** A library recipe's ingredient matched to a core food, already scaled to the week meal's servings. */
export type RecipeFoodUse = { foodId: string; grams: number };

export type RecipeUse = {
  title: string;
  /** Matched ingredients, in grams of the core food. */
  foods: RecipeFoodUse[];
  /** Ingredients with no core food (or no weight), so no price. */
  unpriced: number;
};

export type WeekInput = {
  weekStart: string;
  foods: Map<string, Food>;
  meals: Map<string, CoreMeal>;
  eaters: Eater[];
  guestsOn: boolean;
  weekMeals: WeekMeal[];
  restockBuy: Set<string>;
  budgetCents: number;
  extras: Extra[];
  /** Per recipe week meal id (§8.5). */
  recipeUses: Map<string, RecipeUse>;
};

export type Status = "green" | "amber" | "red";
