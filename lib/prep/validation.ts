// Zod rules for Prep inputs (PRD-prep P-2, P-3, P-4, P-6). Shared by the
// server actions and the editors, so the screens can show the same messages.
import { z } from "zod";
import { AISLES, CORE_BUY_MODES, CORE_COMPONENT_ROLES, CORE_FOOD_CATEGORIES, CORE_UNIT_KINDS } from "@/lib/enums";
import { isWeekStart, MEAL_SLOTS } from "@/lib/plan/week";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max} characters`)
    .transform((s) => s || null)
    .nullable();

const per100 = (label: string, max: number) =>
  z.number({ error: `Enter ${label}` }).min(0, `${label} can't be negative`).max(max, `${label} is at most ${max} per 100 g`);

export const WALMART_PREFIX = "https://www.walmart.com/";

export const CoreFoodInput = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Give the food a name").max(80, "Keep the name under 80 characters"),
    category: z.enum(CORE_FOOD_CATEGORIES),
    unitKind: z.enum(CORE_UNIT_KINDS),
    gramsPerCount: z.number().nullable(),
    kcal100g: per100("Calories", 900),
    protein100g: per100("Protein", 100),
    carbs100g: per100("Carbs", 100),
    fat100g: per100("Fat", 100),
    fiber100g: per100("Fiber", 50),
    cookedYield: z.number().min(0.2, "Cooked yield is 0.2 to 1.5").max(1.5, "Cooked yield is 0.2 to 1.5"),
    displayCupG: z.number().min(1).max(2000).nullable(),
    packageLabel: z.string().trim().min(1, "Describe the package, like 3 lb family pack").max(80),
    packageAmount: z.number().gt(0, "The package size must be more than 0").max(100_000),
    packagePriceCents: z.number().int().min(0, "The price can't be negative").max(100_000, "The price is at most $1,000"),
    priceIsEstimate: z.boolean(),
    buyMode: z.enum(CORE_BUY_MODES),
    restockWeeks: z.number().int().nullable(),
    walmartName: optionalText(120, "the Walmart name"),
    walmartUrl: optionalText(500, "the link").refine((u) => u === null || u.startsWith(WALMART_PREFIX), {
      message: `The link must start with ${WALMART_PREFIX}`,
    }),
    notes: optionalText(500, "notes"),
    aisle: z.enum(AISLES),
  })
  .superRefine((f, ctx) => {
    if (f.unitKind === "count" && (f.gramsPerCount === null || f.gramsPerCount < 1 || f.gramsPerCount > 2000)) {
      ctx.addIssue({ code: "custom", path: ["gramsPerCount"], message: "Counted foods need grams each, 1 to 2000" });
    }
    if (f.buyMode === "restock" && (f.restockWeeks === null || f.restockWeeks < 1 || f.restockWeeks > 26)) {
      ctx.addIssue({ code: "custom", path: ["restockWeeks"], message: "Say how many weeks a package lasts, 1 to 26" });
    }
  })
  .transform((f) => ({
    ...f,
    gramsPerCount: f.unitKind === "count" ? f.gramsPerCount : null,
    restockWeeks: f.buyMode === "restock" ? f.restockWeeks : null,
  }));
export type CoreFoodInput = z.input<typeof CoreFoodInput>;
export type CoreFoodData = z.output<typeof CoreFoodInput>;

const Amount = z.number().min(0, "Amounts can't be negative").max(5000, "That portion is too big");

export const CoreMealInput = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Give the meal a name").max(80, "Keep the name under 80 characters"),
  slot: z.enum(MEAL_SLOTS),
  flavorIdeas: z.array(z.string().trim().min(1).max(40)).max(30),
  notes: optionalText(500, "notes"),
  components: z
    .array(
      z.object({
        id: z.uuid().nullable(),
        role: z.enum(CORE_COMPONENT_ROLES),
        label: optionalText(40, "the label"),
        swapCategory: z.enum(CORE_FOOD_CATEGORIES).nullable(),
        defaultFoodId: z.uuid({ error: "Pick a food for every part" }),
        prepAs: optionalText(40, "the prep label"),
        portions: z.array(z.object({ eaterId: z.uuid(), amount: Amount.nullable(), needsReview: z.boolean() })),
      }),
    )
    .max(20, "At most 20 parts"),
});
export type CoreMealInput = z.input<typeof CoreMealInput>;
export type CoreMealData = z.output<typeof CoreMealInput>;

export const EaterInput = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(["member", "guest"]),
  /** New member eaters: the household member's user id. */
  userId: z.string().min(1).max(200).nullable(),
  name: z.string().trim().min(1, "Give them a name").max(40, "Keep the name under 40 characters"),
  isActive: z.boolean(),
  slots: z.array(z.enum(MEAL_SLOTS)).min(1, "Pick at least one meal they eat"),
  kcalTarget: z.number().int().min(1000, "Calories are 1,000 to 5,000").max(5000, "Calories are 1,000 to 5,000").nullable(),
  proteinTargetG: z.number().int().min(40, "Protein is 40 to 350 g").max(350, "Protein is 40 to 350 g").nullable(),
});
export type EaterInput = z.input<typeof EaterInput>;
export type EaterData = z.output<typeof EaterInput>;

export const SettingsInput = z.object({
  weeklyBudgetCents: z.number().int().min(0).max(1_000_000, "The budget is at most $10,000"),
  prepWeekdays: z.array(z.number().int().min(0).max(7)).min(1, "Pick at least one prep day").max(4),
  doubleWeekdays: z.array(z.number().int().min(1).max(6)).max(6),
  guestsDefault: z.boolean(),
  rotation: z.array(z.uuid()).max(52),
});
export type SettingsInput = z.input<typeof SettingsInput>;
export type SettingsData = z.output<typeof SettingsInput>;

export const WeekStart = z.string().refine(isWeekStart, "That isn't a Monday");

export const Flavor = optionalText(80, "the flavor note");

export const SlotEntryInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("meal"), coreMealId: z.uuid(), choices: z.record(z.uuid(), z.uuid()) }),
  z.object({ kind: z.literal("recipe"), recipeId: z.uuid(), servings: z.number().positive("Servings must be more than 0").max(200) }),
  z.object({ kind: z.literal("flex"), coreMealId: z.uuid().nullable() }),
  z.object({ kind: z.literal("leftovers"), leftoverOf: z.uuid() }),
]);

export const SlotInput = z.object({
  weekId: z.uuid(),
  entryId: z.uuid().nullable(),
  day: z.string(),
  slot: z.enum(MEAL_SLOTS),
  entry: SlotEntryInput,
  flavor: Flavor,
  isDouble: z.boolean(),
  noPrep: z.boolean(),
  position: z.number().int().min(0).max(20),
  confirmReplace: z.boolean(),
});
export type SlotInput = z.input<typeof SlotInput>;

export const ExtraInput = z.object({
  name: z.string().trim().min(1, "Name the item").max(80),
  forNote: optionalText(80, "the note"),
  aisle: z.enum(AISLES),
  priceCents: z.number().int().min(0).max(100_000).nullable(),
  isPantry: z.boolean(),
});
export type ExtraInput = z.input<typeof ExtraInput>;

export const TemplateName = z.string().trim().min(1, "Name the template").max(80, "Keep the name under 80 characters");
