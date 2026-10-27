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

export const RECIPE_SOURCES = ["manual", "instagram", "tiktok", "website", "image", "text"] as const;
export type RecipeSource = (typeof RECIPE_SOURCES)[number];

export const RECIPE_STATUSES = ["active", "disliked", "archived"] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];
