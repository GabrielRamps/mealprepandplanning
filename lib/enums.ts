// Database enum values (PRD 6), kept apart from the Drizzle schema so client
// code can use them without pulling in the database layer.
export const AISLES = [
  "produce",
  "meat_seafood",
  "dairy_eggs",
  "bakery",
  "deli",
  "pantry",
  "canned_jarred",
  "pasta_grains",
  "spices_baking",
  "condiments",
  "frozen",
  "beverages",
  "snacks",
  "household",
  "other",
] as const;
export type Aisle = (typeof AISLES)[number];

/** A new household's store walk; matches the households.aisle_order default. */
export const DEFAULT_AISLE_ORDER: readonly Aisle[] = [
  "produce",
  "meat_seafood",
  "deli",
  "bakery",
  "dairy_eggs",
  "frozen",
  "pasta_grains",
  "canned_jarred",
  "condiments",
  "spices_baking",
  "pantry",
  "snacks",
  "beverages",
  "household",
  "other",
];

export const RECIPE_SOURCES = ["manual", "instagram", "tiktok", "website", "image", "text"] as const;
export type RecipeSource = (typeof RECIPE_SOURCES)[number];

export const RECIPE_STATUSES = ["active", "disliked", "archived"] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

// Prep (PRD-prep 7.1).
export const CORE_FOOD_CATEGORIES = [
  "protein",
  "starch",
  "vegetable",
  "fruit",
  "dairy_eggs",
  "grain",
  "fat",
  "flavor",
  "supplement",
  "snack",
] as const;
export type CoreFoodCategory = (typeof CORE_FOOD_CATEGORIES)[number];

export const CORE_UNIT_KINDS = ["weight", "count"] as const;
export type CoreUnitKind = (typeof CORE_UNIT_KINDS)[number];

export const CORE_BUY_MODES = ["by_amount", "restock"] as const;
export type CoreBuyMode = (typeof CORE_BUY_MODES)[number];

export const CORE_COMPONENT_ROLES = ["protein", "starch", "vegetable", "fat", "other"] as const;
export type CoreComponentRole = (typeof CORE_COMPONENT_ROLES)[number];

export const EATER_KINDS = ["member", "guest"] as const;
export type EaterKind = (typeof EATER_KINDS)[number];

export const EATER_COLORS = ["a", "b", "neutral"] as const;
export type EaterColor = (typeof EATER_COLORS)[number];

export const PRICE_SOURCES = ["manual", "receipt", "seed"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const RECEIPT_STATUSES = ["processing", "ready", "failed"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
