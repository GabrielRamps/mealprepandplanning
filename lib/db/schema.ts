// Drizzle schema for PRD section 6. Users live in Neon Auth (`neon_auth` schema);
// their ids are stored as text with no foreign key.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
import {
  AISLES,
  type Aisle,
  CORE_BUY_MODES,
  CORE_COMPONENT_ROLES,
  CORE_FOOD_CATEGORIES,
  CORE_UNIT_KINDS,
  DEFAULT_AISLE_ORDER,
  EATER_KINDS,
  PRICE_SOURCES,
  RECEIPT_STATUSES,
  RECIPE_SOURCES,
  RECIPE_STATUSES,
} from "../enums";

export const recipeSource = pgEnum("recipe_source", RECIPE_SOURCES);
export const recipeStatus = pgEnum("recipe_status", RECIPE_STATUSES);
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
export const aisle = pgEnum("aisle", AISLES);

export type { Aisle };
export { DEFAULT_AISLE_ORDER };

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

// Saved lists (Lists → Reorder): the meals and extra items of a list, kept so
// the same week can be shopped for again in one tap.
export const savedLists = pgTable(
  "saved_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // 'Taco week'
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastOrderedAt: timestamp("last_ordered_at", { withTimezone: true }),
  },
  (t) => [
    check("saved_lists_name_length", sql`char_length(${t.name}) between 1 and 80`),
    index("saved_lists_household").on(t.householdId),
  ],
);

export const savedListRecipes = pgTable(
  "saved_list_recipes",
  {
    savedListId: uuid("saved_list_id")
      .notNull()
      .references(() => savedLists.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    servings: numeric("servings", { precision: 6, scale: 2, mode: "number" }).notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.savedListId, t.recipeId] }),
    check("saved_list_recipes_servings", sql`${t.servings} > 0`),
  ],
);

/** Items added by hand to the list it was saved from ('paper towels'). */
export const savedListItems = pgTable(
  "saved_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    savedListId: uuid("saved_list_id")
      .notNull()
      .references(() => savedLists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3, mode: "number" }),
    unit: text("unit"),
    aisle: aisle("aisle").notNull().default("other"),
    isPantry: boolean("is_pantry").notNull().default(false),
    note: text("note"),
    priceCents: integer("price_cents"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("saved_list_items_saved_list").on(t.savedListId)],
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
    // The saved list this list was saved as, or reordered from.
    savedListId: uuid("saved_list_id").references(() => savedLists.id, { onDelete: "set null" }),
    // The Prep week this list was made from (latest wins).
    prepWeekId: uuid("prep_week_id").references((): AnyPgColumn => prepWeeks.id, { onDelete: "set null" }),
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
  /** Prep items: where the need comes from ('Lunch bowl · Mon'), not a recipe. */
  kind?: "prep";
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
    note: text("note"), // Prep: '3 lb family pack · $11.97 each'
    priceCents: integer("price_cents"), // Prep: line total
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

// ---------------------------------------------------------------------------
// Prep (PRD-prep 7). Every table is household-scoped, directly or through its parent.

export const coreFoodCategory = pgEnum("core_food_category", CORE_FOOD_CATEGORIES);
export const coreUnitKind = pgEnum("core_unit_kind", CORE_UNIT_KINDS);
export const coreBuyMode = pgEnum("core_buy_mode", CORE_BUY_MODES);
export const coreComponentRole = pgEnum("core_component_role", CORE_COMPONENT_ROLES);
export const eaterKind = pgEnum("eater_kind", EATER_KINDS);
export const priceSource = pgEnum("price_source", PRICE_SOURCES);
export const receiptStatus = pgEnum("receipt_status", RECEIPT_STATUSES);

const num = (name: string, precision: number, scale: number) => numeric(name, { precision, scale, mode: "number" });

/** One row per household once Prep is set up. */
export const prepSettings = pgTable(
  "prep_settings",
  {
    householdId: uuid("household_id")
      .primaryKey()
      .references(() => households.id, { onDelete: "cascade" }),
    weeklyBudgetCents: integer("weekly_budget_cents").notNull().default(17500),
    // 0 = the Sunday BEFORE week_start, 1..7 = Mon..Sun
    prepWeekdays: smallint("prep_weekdays").array().notNull().default(sql`'{0,3}'`),
    doubleWeekdays: smallint("double_weekdays").array().notNull().default(sql`'{1,3}'`),
    guestsDefault: boolean("guests_default").notNull().default(false),
    rotation: uuid("rotation").array().notNull().default(sql`'{}'`), // prep_templates ids in order
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("prep_settings_budget", sql`${t.weeklyBudgetCents} between 0 and 1000000`)],
);

export const prepEaters = pgTable(
  "prep_eaters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: eaterKind("kind").notNull(),
    userId: text("user_id"), // members only; matches household_members.user_id
    name: text("name").notNull(),
    color: text("color").notNull().default("neutral"), // 'a' | 'b' | 'neutral'
    slots: mealSlot("slots").array().notNull().default(sql`'{breakfast,lunch,dinner,snack}'`),
    kcalTarget: integer("kcal_target"),
    proteinTargetG: integer("protein_target_g"),
    isActive: boolean("is_active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("prep_eaters_kcal", sql`${t.kcalTarget} between 1000 and 5000`),
    check("prep_eaters_protein", sql`${t.proteinTargetG} between 40 and 350`),
    check("prep_eaters_member_user", sql`(${t.kind} = 'member') = (${t.userId} is not null)`),
    check("prep_eaters_member_targets", sql`${t.kind} = 'guest' or (${t.kcalTarget} is not null and ${t.proteinTargetG} is not null)`),
    uniqueIndex("prep_eaters_household_user").on(t.householdId, t.userId).where(sql`${t.userId} is not null`),
  ],
);

export const coreFoods = pgTable(
  "core_foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    category: coreFoodCategory("category").notNull(),
    unitKind: coreUnitKind("unit_kind").notNull().default("weight"),
    gramsPerCount: num("grams_per_count", 8, 2),
    kcal100g: num("kcal_100g", 6, 1).notNull(), // as purchased (raw)
    protein100g: num("protein_100g", 5, 1).notNull(),
    carbs100g: num("carbs_100g", 5, 1).notNull().default(0),
    fat100g: num("fat_100g", 5, 1).notNull().default(0),
    fiber100g: num("fiber_100g", 5, 1).notNull().default(0),
    cookedYield: num("cooked_yield", 4, 2).notNull().default(1),
    // Grams per cup, for showing cups on Today (egg whites 243, yogurt 227…).
    displayCupG: num("display_cup_g", 6, 1),
    packageLabel: text("package_label").notNull(),
    packageAmount: num("package_amount", 10, 2).notNull(), // grams, or count for count foods
    packagePriceCents: integer("package_price_cents").notNull(),
    priceIsEstimate: boolean("price_is_estimate").notNull().default(true),
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }).notNull().defaultNow(),
    buyMode: coreBuyMode("buy_mode").notNull().default("by_amount"),
    restockWeeks: smallint("restock_weeks"),
    walmartName: text("walmart_name"),
    walmartUrl: text("walmart_url"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("core_foods_package_amount", sql`${t.packageAmount} > 0`),
    check("core_foods_price", sql`${t.packagePriceCents} >= 0`),
    check("core_foods_restock_weeks", sql`${t.restockWeeks} between 1 and 26`),
    check("core_foods_count_grams", sql`${t.unitKind} = 'weight' or ${t.gramsPerCount} is not null`),
    check("core_foods_restock", sql`${t.buyMode} = 'by_amount' or ${t.restockWeeks} is not null`),
    uniqueIndex("core_foods_household_name").on(t.householdId, sql`lower(${t.name})`).where(sql`${t.deletedAt} is null`),
    index("core_foods_household_category").on(t.householdId, t.category).where(sql`${t.deletedAt} is null`),
  ],
);

export type ReceiptLineJson = {
  raw_text: string;
  quantity: number;
  size_text: string | null;
  size_grams: number | null;
  size_count: number | null;
  weighed: boolean;
  unit_price_cents: number;
  line_total_cents: number;
  core_food_id: string | null;
  confidence: "high" | "medium" | "low";
};

export const receiptScans = pgTable(
  "receipt_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    imageKeys: text("image_keys").array().notNull(),
    status: receiptStatus("status").notNull().default("processing"),
    model: text("model"),
    store: text("store"),
    lines: jsonb("lines").$type<ReceiptLineJson[]>(),
    receiptTotalCents: integer("receipt_total_cents"),
    error: text("error"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [index("receipt_scans_household_created").on(t.householdId, t.createdAt.desc())],
);

export const coreFoodPrices = pgTable(
  "core_food_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coreFoodId: uuid("core_food_id")
      .notNull()
      .references(() => coreFoods.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    packageAmount: num("package_amount", 10, 2).notNull(),
    source: priceSource("source").notNull(),
    receiptScanId: uuid("receipt_scan_id").references(() => receiptScans.id, { onDelete: "set null" }),
    observedOn: date("observed_on", { mode: "string" }).notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("core_food_prices_food").on(t.coreFoodId, t.observedOn.desc())],
);

export const coreMeals = pgTable("core_meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slot: mealSlot("slot").notNull(),
  isFlex: boolean("is_flex").notNull().default(false),
  flavorIdeas: text("flavor_ideas").array().notNull().default(sql`'{}'`),
  notes: text("notes"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const coreMealComponents = pgTable("core_meal_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  coreMealId: uuid("core_meal_id")
    .notNull()
    .references(() => coreMeals.id, { onDelete: "cascade" }),
  role: coreComponentRole("role").notNull(),
  label: text("label"),
  swapCategory: coreFoodCategory("swap_category"), // set = swappable
  defaultFoodId: uuid("default_food_id")
    .notNull()
    .references(() => coreFoods.id, { onDelete: "restrict" }),
  prepAs: text("prep_as"),
  position: integer("position").notNull().default(0),
});

export const coreMealPortions = pgTable(
  "core_meal_portions",
  {
    componentId: uuid("component_id")
      .notNull()
      .references(() => coreMealComponents.id, { onDelete: "cascade" }),
    eaterId: uuid("eater_id")
      .notNull()
      .references(() => prepEaters.id, { onDelete: "cascade" }),
    amount: num("amount", 8, 2).notNull(), // grams as purchased, or count
    needsReview: boolean("needs_review").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.componentId, t.eaterId] }), check("core_meal_portions_amount", sql`${t.amount} >= 0`)],
);

export type Choices = Record<string, string>; // componentId -> coreFoodId

export const prepTemplates = pgTable("prep_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const prepTemplateMeals = pgTable(
  "prep_template_meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => prepTemplates.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    slot: mealSlot("slot").notNull(),
    coreMealId: uuid("core_meal_id").references(() => coreMeals.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    servings: num("servings", 6, 2),
    leftoverOfWeekday: smallint("leftover_of_weekday"), // dinner on that weekday
    choices: jsonb("choices").$type<Choices>().notNull().default({}),
    flavor: text("flavor"),
    isDouble: boolean("is_double").notNull().default(false),
    // Cooked fresh: left out of prep tasks (Sunday's lunch bowl).
    noPrep: boolean("no_prep").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    check("prep_template_meals_weekday", sql`${t.weekday} between 1 and 7`),
    check("prep_template_meals_leftover_weekday", sql`${t.leftoverOfWeekday} between 1 and 7`),
  ],
);

export const prepTemplateExtras = pgTable("prep_template_extras", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => prepTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  forNote: text("for_note"),
  aisle: aisle("aisle").notNull().default("condiments"),
  priceCents: integer("price_cents"),
  isPantry: boolean("is_pantry").notNull().default(true),
});

export const prepWeeks = pgTable(
  "prep_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(), // a Monday
    templateId: uuid("template_id").references(() => prepTemplates.id, { onDelete: "set null" }),
    budgetCents: integer("budget_cents").notNull(),
    guestsOn: boolean("guests_on").notNull().default(false),
    restockBuy: uuid("restock_buy").array().notNull().default(sql`'{}'`),
    listBuiltAt: timestamp("list_built_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("prep_weeks_week_start_monday", sql`extract(isodow from ${t.weekStart}) = 1`),
    uniqueIndex("prep_weeks_household_week").on(t.householdId, t.weekStart),
  ],
);

export const prepWeekMeals = pgTable(
  "prep_week_meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prepWeekId: uuid("prep_week_id")
      .notNull()
      .references(() => prepWeeks.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(), // within the week (enforced in app)
    slot: mealSlot("slot").notNull(),
    coreMealId: uuid("core_meal_id").references(() => coreMeals.id, { onDelete: "restrict" }),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    servings: num("servings", 6, 2),
    leftoverOf: uuid("leftover_of").references((): AnyPgColumn => prepWeekMeals.id, { onDelete: "set null" }),
    choices: jsonb("choices").$type<Choices>().notNull().default({}),
    flavor: text("flavor"),
    isDouble: boolean("is_double").notNull().default(false),
    noPrep: boolean("no_prep").notNull().default(false),
    position: integer("position").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("prep_week_meals_one_entry", sql`num_nonnulls(${t.coreMealId}, ${t.recipeId}, ${t.leftoverOf}) = 1`),
    check("prep_week_meals_servings", sql`${t.recipeId} is null or ${t.servings} > 0`),
    check("prep_week_meals_double_dinner", sql`not ${t.isDouble} or ${t.slot} = 'dinner'`),
    index("prep_week_meals_week_day").on(t.prepWeekId, t.day, t.slot, t.position),
  ],
);

export const prepWeekExtras = pgTable("prep_week_extras", {
  id: uuid("id").primaryKey().defaultRandom(),
  prepWeekId: uuid("prep_week_id")
    .notNull()
    .references(() => prepWeeks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  forNote: text("for_note"),
  aisle: aisle("aisle").notNull().default("condiments"),
  priceCents: integer("price_cents"),
  isPantry: boolean("is_pantry").notNull().default(true),
});

export const prepTaskChecks = pgTable(
  "prep_task_checks",
  {
    prepWeekId: uuid("prep_week_id")
      .notNull()
      .references(() => prepWeeks.id, { onDelete: "cascade" }),
    taskKey: text("task_key").notNull(),
    checkedBy: text("checked_by").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.prepWeekId, t.taskKey] })],
);
