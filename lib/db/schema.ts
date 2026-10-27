// Drizzle schema for PRD section 6. Users live in Neon Auth (`neon_auth` schema);
// their ids are stored as text with no foreign key.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const recipeSource = pgEnum("recipe_source", [
  "manual",
  "instagram",
  "tiktok",
  "website",
  "image",
  "text",
]);
export const recipeStatus = pgEnum("recipe_status", ["active", "disliked", "archived"]);
export const mealSlot = pgEnum("meal_slot", ["breakfast", "lunch", "dinner", "snack"]);
export const planStatus = pgEnum("plan_status", ["draft", "pending_approval", "approved"]);
export const importStatus = pgEnum("import_status", [
  "queued",
  "fetching",
  "reading",
  "ready",
  "failed",
  "approved",
  "discarded",
]);
export const aisle = pgEnum("aisle", [
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
]);

export type Aisle = (typeof aisle.enumValues)[number];

export const DEFAULT_AISLE_ORDER: Aisle[] = [
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

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    inviteCode: text("invite_code").unique(),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    aisleOrder: aisle("aisle_order")
      .array()
      .notNull()
      .default(sql`'{produce,meat_seafood,deli,bakery,dairy_eggs,frozen,pasta_grains,canned_jarred,condiments,spices_baking,pantry,snacks,beverages,household,other}'`),
    createdAt: createdAt(),
  },
  (t) => [check("households_name_length", sql`char_length(${t.name}) between 1 and 80`)],
);

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().unique(), // one household per user
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    check("household_members_role", sql`${t.role} in ('owner','member')`),
  ],
);

export type RecipeStep = { section: string | null; text: string };

export type NutrientsJson = Record<string, number>;

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // lowercase, singular: 'yellow onion'
    aisle: aisle("aisle").notNull().default("other"),
    isPantryStaple: boolean("is_pantry_staple").notNull().default(false),
    usdaFdcId: integer("usda_fdc_id"), // later: macros
    nutrients: jsonb("nutrients").$type<NutrientsJson>(), // later: macros
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ingredients_household_name").on(t.householdId, t.name)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sourceType: recipeSource("source_type").notNull().default("manual"),
    sourceUrl: text("source_url"),
    creatorName: text("creator_name"),
    creatorHandle: text("creator_handle"),
    coverImageKey: text("cover_image_key"), // key in bucket recipe-photos
    servings: integer("servings").notNull(),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    steps: jsonb("steps").$type<RecipeStep[]>().notNull().default([]),
    notes: text("notes"),
    status: recipeStatus("status").notNull().default("active"),
    dislikedReason: text("disliked_reason"),
    dislikedBy: text("disliked_by"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("recipes_title_length", sql`char_length(${t.title}) between 1 and 200`),
    check("recipes_servings_range", sql`${t.servings} between 1 and 50`),
    check("recipes_prep_minutes", sql`${t.prepMinutes} >= 0`),
    check("recipes_cook_minutes", sql`${t.cookMinutes} >= 0`),
    check("recipes_disliked_reason", sql`${t.status} <> 'disliked' or ${t.dislikedReason} is not null`),
    index("recipes_household_status").on(t.householdId, t.status).where(sql`${t.deletedAt} is null`),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    section: text("section"), // 'Sauce', 'Marinade', or null
    rawText: text("raw_text").notNull(), // '2 cloves garlic, minced'
    quantity: numeric("quantity", { precision: 10, scale: 3, mode: "number" }), // null for 'salt to taste'
    quantityMax: numeric("quantity_max", { precision: 10, scale: 3, mode: "number" }), // ranges '2-3'
    unit: text("unit"), // canonical unit code (PRD 8.1), or null for counts
    name: text("name").notNull(), // 'garlic'
    prepNote: text("prep_note"), // 'minced'
    isOptional: boolean("is_optional").notNull().default(false),
    ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
  },
  (t) => [index("recipe_ingredients_recipe_position").on(t.recipeId, t.position)],
);

export const recipeUserPrefs = pgTable(
  "recipe_user_prefs",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    rating: smallint("rating"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.userId] }),
    check("recipe_user_prefs_rating", sql`${t.rating} between 1 and 5`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [
    check("tags_name_length", sql`char_length(${t.name}) between 1 and 40`),
    uniqueIndex("tags_household_lower_name").on(t.householdId, sql`lower(${t.name})`),
  ],
);

export const recipeTags = pgTable(
  "recipe_tags",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })],
);

export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    status: planStatus("status").notNull().default("draft"),
    sentBy: text("sent_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    changeNote: text("change_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("meal_plans_week_start_monday", sql`extract(isodow from ${t.weekStart}) = 1`),
    uniqueIndex("meal_plans_household_week").on(t.householdId, t.weekStart),
  ],
);

export const mealPlanEntries = pgTable(
  "meal_plan_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(), // must fall within the plan's week (enforced in app)
    slot: mealSlot("slot").notNull(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    servings: numeric("servings", { precision: 6, scale: 2, mode: "number" }).notNull(),
    note: text("note"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    check("meal_plan_entries_servings", sql`${t.servings} > 0`),
    index("meal_plan_entries_plan_day_slot").on(t.planId, t.day, t.slot),
  ],
);

export const groceryLists = pgTable(
  "grocery_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // 'Week of Oct 26'
    mealPlanId: uuid("meal_plan_id").references(() => mealPlans.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [check("grocery_lists_status", sql`${t.status} in ('active','completed')`)],
);

export const groceryListRecipes = pgTable(
  "grocery_list_recipes",
  {
    listId: uuid("list_id")
      .notNull()
      .references(() => groceryLists.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    servings: numeric("servings", { precision: 6, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.recipeId] }),
    check("grocery_list_recipes_servings", sql`${t.servings} > 0`),
  ],
);

export type GroceryItemSource = {
  recipe_id: string;
  recipe_title: string;
  quantity: number | null;
  unit: string | null;
  raw_text: string;
};

export const groceryItems = pgTable(
  "grocery_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => groceryLists.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
    mergeKey: text("merge_key"), // PRD 8.2; null for manual items
    name: text("name").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3, mode: "number" }),
    unit: text("unit"),
    aisle: aisle("aisle").notNull().default("other"),
    isPantry: boolean("is_pantry").notNull().default(false),
    isManual: boolean("is_manual").notNull().default(false),
    sources: jsonb("sources").$type<GroceryItemSource[]>().notNull().default([]),
    isChecked: boolean("is_checked").notNull().default(false),
    checkedBy: text("checked_by"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [index("grocery_items_list").on(t.listId)],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    sourceType: recipeSource("source_type").notNull(),
    sourceUrl: text("source_url"),
    imageKeys: text("image_keys").array().notNull().default(sql`'{}'`), // keys in bucket imports
    status: importStatus("status").notNull().default("queued"),
    captionText: text("caption_text"),
    thumbnailUrl: text("thumbnail_url"),
    videoKey: text("video_key"), // deleted after reading
    model: text("model"),
    draft: jsonb("draft"), // RecipeDraft, PRD 7.4
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("import_jobs_household_created").on(t.householdId, t.createdAt.desc())],
);

export const importTokens = pgTable("import_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(), // "Gabriel's iPhone"
  tokenHash: text("token_hash").notNull().unique(), // sha256 hex of the full token
  tokenPrefix: text("token_prefix").notNull(), // first 8 chars, for display
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
