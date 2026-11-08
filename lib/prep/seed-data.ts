// Seed for "Load our plan" (PRD-prep 11): Gabriel and Anna's foods, meals,
// portions, targets and the 4-week rotation. Pure data plus buildSeed(),
// which turns it into rows with ids made up front, so the whole seed can be
// written in one transaction (or one HTTP batch) and tested without a database.
import type { Aisle, CoreBuyMode, CoreComponentRole, CoreFoodCategory } from "@/lib/enums";
import type { MealSlot } from "@/lib/plan/week";

type FoodSeed = {
  name: string;
  category: CoreFoodCategory;
  /** Grams per count for count foods; null for weight foods. */
  gramsPerCount: number | null;
  n: [kcal: number, protein: number, carbs: number, fat: number, fiber: number];
  cookedYield: number;
  displayCupG?: number;
  packageLabel: string;
  /** Grams, or count for count foods. */
  packageAmount: number;
  priceCents: number;
  restockWeeks?: number;
  aisle: Aisle;
};

export const SEED_FOODS: FoodSeed[] = [
  { name: "Chicken breast", category: "protein", gramsPerCount: null, n: [120, 22.5, 0, 2.6, 0], cookedYield: 0.75, packageLabel: "3 lb family pack", packageAmount: 1361, priceCents: 1197, aisle: "meat_seafood" },
  { name: "Chicken thighs, boneless", category: "protein", gramsPerCount: null, n: [121, 19.7, 0, 4.1, 0], cookedYield: 0.75, packageLabel: "2 lb pack", packageAmount: 907, priceCents: 698, aisle: "meat_seafood" },
  { name: "Ground chicken", category: "protein", gramsPerCount: null, n: [143, 17.4, 0, 8.1, 0], cookedYield: 0.75, packageLabel: "1 lb", packageAmount: 454, priceCents: 448, aisle: "meat_seafood" },
  { name: "93% lean ground beef", category: "protein", gramsPerCount: null, n: [152, 21.0, 0, 7.0, 0], cookedYield: 0.75, packageLabel: "1 lb", packageAmount: 454, priceCents: 698, aisle: "meat_seafood" },
  { name: "Eggs", category: "dairy_eggs", gramsPerCount: 50, n: [144, 12.6, 0.8, 9.6, 0], cookedYield: 1, packageLabel: "18 ct", packageAmount: 18, priceCents: 347, aisle: "dairy_eggs" },
  { name: "Liquid egg whites", category: "dairy_eggs", gramsPerCount: null, n: [52, 11.0, 0.7, 0, 0], cookedYield: 1, displayCupG: 243, packageLabel: "32 oz carton", packageAmount: 907, priceCents: 448, aisle: "dairy_eggs" },
  { name: "Vanilla protein Greek yogurt, nonfat", category: "dairy_eggs", gramsPerCount: null, n: [80, 11.0, 6.0, 0.5, 0], cookedYield: 1, displayCupG: 227, packageLabel: "32 oz tub", packageAmount: 907, priceCents: 548, aisle: "dairy_eggs" },
  { name: "Sweet potatoes", category: "starch", gramsPerCount: null, n: [86, 1.6, 20.0, 0.1, 3.0], cookedYield: 0.85, packageLabel: "3 lb bag", packageAmount: 1361, priceCents: 347, aisle: "produce" },
  { name: "Russet potatoes", category: "starch", gramsPerCount: null, n: [77, 2.0, 17.5, 0.1, 2.1], cookedYield: 0.85, packageLabel: "10 lb bag", packageAmount: 4536, priceCents: 597, aisle: "produce" },
  { name: "Red or gold potatoes", category: "starch", gramsPerCount: null, n: [77, 2.0, 17.5, 0.1, 2.1], cookedYield: 0.85, packageLabel: "3 lb bag", packageAmount: 1361, priceCents: 347, aisle: "produce" },
  { name: "Frozen broccoli", category: "vegetable", gramsPerCount: null, n: [28, 3.0, 5.0, 0.1, 3.0], cookedYield: 1, displayCupG: 120, packageLabel: "12 oz bag", packageAmount: 340, priceCents: 138, aisle: "frozen" },
  { name: "Frozen green beans", category: "vegetable", gramsPerCount: null, n: [31, 1.8, 7.0, 0.2, 2.7], cookedYield: 1, displayCupG: 120, packageLabel: "12 oz bag", packageAmount: 340, priceCents: 124, aisle: "frozen" },
  { name: "Frozen pepper and onion blend", category: "vegetable", gramsPerCount: null, n: [30, 1.0, 7.0, 0.2, 1.8], cookedYield: 1, displayCupG: 120, packageLabel: "12 oz bag", packageAmount: 340, priceCents: 138, aisle: "frozen" },
  { name: "Frozen stir-fry vegetables", category: "vegetable", gramsPerCount: null, n: [35, 2.0, 7.0, 0.2, 2.5], cookedYield: 1, displayCupG: 120, packageLabel: "12 oz bag", packageAmount: 340, priceCents: 148, aisle: "frozen" },
  { name: "Frozen mixed vegetables", category: "vegetable", gramsPerCount: null, n: [64, 2.9, 13.0, 0.5, 4.0], cookedYield: 1, displayCupG: 120, packageLabel: "12 oz bag", packageAmount: 340, priceCents: 124, aisle: "frozen" },
  { name: "Bell peppers", category: "vegetable", gramsPerCount: 150, n: [26, 1.0, 6.0, 0.3, 2.1], cookedYield: 1, packageLabel: "3-pack", packageAmount: 3, priceCents: 347, aisle: "produce" },
  { name: "Yellow onions", category: "vegetable", gramsPerCount: null, n: [40, 1.1, 9.3, 0.1, 1.7], cookedYield: 1, packageLabel: "3 lb bag", packageAmount: 1361, priceCents: 297, aisle: "produce" },
  { name: "Spinach", category: "vegetable", gramsPerCount: null, n: [23, 2.9, 3.6, 0.4, 2.2], cookedYield: 1, packageLabel: "10 oz bag", packageAmount: 283, priceCents: 248, aisle: "produce" },
  { name: "Salad mix", category: "vegetable", gramsPerCount: null, n: [17, 1.2, 3.3, 0.2, 2.1], cookedYield: 1, packageLabel: "11 oz bag", packageAmount: 312, priceCents: 298, aisle: "produce" },
  { name: "Coleslaw mix", category: "vegetable", gramsPerCount: null, n: [25, 1.3, 5.8, 0.1, 2.5], cookedYield: 1, packageLabel: "14 oz bag", packageAmount: 397, priceCents: 198, aisle: "produce" },
  { name: "Carrots", category: "vegetable", gramsPerCount: null, n: [41, 0.9, 9.6, 0.2, 2.8], cookedYield: 1, packageLabel: "1 lb bag", packageAmount: 454, priceCents: 98, aisle: "produce" },
  { name: "Zucchini", category: "vegetable", gramsPerCount: 200, n: [17, 1.2, 3.1, 0.3, 1.0], cookedYield: 1, packageLabel: "each", packageAmount: 1, priceCents: 84, aisle: "produce" },
  { name: "Cucumbers", category: "vegetable", gramsPerCount: 300, n: [15, 0.7, 3.6, 0.1, 0.5], cookedYield: 1, packageLabel: "each", packageAmount: 1, priceCents: 68, aisle: "produce" },
  { name: "Tomatoes", category: "vegetable", gramsPerCount: 120, n: [18, 0.9, 3.9, 0.2, 1.2], cookedYield: 1, packageLabel: "each", packageAmount: 1, priceCents: 48, aisle: "produce" },
  { name: "Frozen mixed berries", category: "fruit", gramsPerCount: null, n: [50, 0.7, 12.0, 0.3, 3.0], cookedYield: 1, displayCupG: 140, packageLabel: "3 lb bag", packageAmount: 1361, priceCents: 847, aisle: "frozen" },
  { name: "Bananas", category: "fruit", gramsPerCount: 118, n: [89, 1.1, 22.8, 0.3, 2.6], cookedYield: 1, packageLabel: "each", packageAmount: 1, priceCents: 27, aisle: "produce" },
  { name: "Apples", category: "fruit", gramsPerCount: 182, n: [52, 0.3, 13.8, 0.2, 2.4], cookedYield: 1, packageLabel: "3 lb bag (~7 ct)", packageAmount: 7, priceCents: 447, aisle: "produce" },
  { name: "Old-fashioned oats", category: "grain", gramsPerCount: null, n: [379, 13.0, 68.0, 6.5, 10.0], cookedYield: 1, displayCupG: 80, packageLabel: "42 oz canister", packageAmount: 1191, priceCents: 448, restockWeeks: 4, aisle: "pasta_grains" },
  { name: "Whey protein", category: "supplement", gramsPerCount: null, n: [400, 80.0, 10.0, 5.0, 0], cookedYield: 1, packageLabel: "2 lb tub", packageAmount: 907, priceCents: 2998, restockWeeks: 3, aisle: "other" },
  { name: "Olive oil", category: "fat", gramsPerCount: null, n: [884, 0, 0, 100.0, 0], cookedYield: 1, packageLabel: "17 oz bottle", packageAmount: 500, priceCents: 597, restockWeeks: 8, aisle: "condiments" },
  { name: "Unsweetened cocoa powder", category: "flavor", gramsPerCount: null, n: [228, 19.6, 57.9, 13.7, 37.0], cookedYield: 1, packageLabel: "8 oz can", packageAmount: 227, priceCents: 348, restockWeeks: 8, aisle: "spices_baking" },
  { name: "Beef jerky", category: "snack", gramsPerCount: null, n: [280, 39.0, 11.0, 3.5, 0], cookedYield: 1, packageLabel: "2.85 oz bag", packageAmount: 81, priceCents: 598, aisle: "snacks" },
];

// Short names used below.
const F = {
  breast: "Chicken breast",
  thighs: "Chicken thighs, boneless",
  groundChicken: "Ground chicken",
  beef: "93% lean ground beef",
  eggs: "Eggs",
  whites: "Liquid egg whites",
  yogurt: "Vanilla protein Greek yogurt, nonfat",
  sweet: "Sweet potatoes",
  russet: "Russet potatoes",
  red: "Red or gold potatoes",
  broccoli: "Frozen broccoli",
  greenBeans: "Frozen green beans",
  pepperOnion: "Frozen pepper and onion blend",
  stirFry: "Frozen stir-fry vegetables",
  mixedVeg: "Frozen mixed vegetables",
  peppers: "Bell peppers",
  onions: "Yellow onions",
  spinach: "Spinach",
  salad: "Salad mix",
  carrots: "Carrots",
  zucchini: "Zucchini",
  cucumbers: "Cucumbers",
  berries: "Frozen mixed berries",
  bananas: "Bananas",
  apples: "Apples",
  oats: "Old-fashioned oats",
  whey: "Whey protein",
  oil: "Olive oil",
  cocoa: "Unsweetened cocoa powder",
  jerky: "Beef jerky",
} as const;

/** Grams of a count food (bell peppers by weight); converted to a count when seeded. */
type Amount = number | { g: number };
const g = (grams: number): Amount => ({ g: grams });

type ComponentSeed = {
  key: string;
  role: CoreComponentRole;
  food: string;
  swap?: CoreFoodCategory;
  prepAs?: string;
  /** Gabriel, Anna, guest (null: guests don't get one). */
  portions: [Amount, Amount, Amount | null];
};

type MealSeed = { key: string; name: string; slot: MealSlot; isFlex?: boolean; flavorIdeas?: string[]; components: ComponentSeed[] };

const scramble = (prep: boolean, guest: boolean): ComponentSeed[] => [
  { key: "eggs", role: "other", food: F.eggs, portions: [3, 2, guest ? 3 : null] },
  { key: "whites", role: "protein", food: F.whites, portions: [180, 120, guest ? 180 : null] },
  { key: "potato", role: "starch", food: F.russet, prepAs: prep ? "breakfast potatoes" : undefined, portions: [235, 118, guest ? 235 : null] },
  { key: "pepper", role: "vegetable", food: F.peppers, portions: [g(40), g(40), guest ? g(40) : null] },
  { key: "onion", role: "vegetable", food: F.onions, portions: [25, 25, guest ? 25 : null] },
  { key: "spinach", role: "vegetable", food: F.spinach, portions: [20, 20, guest ? 20 : null] },
];

export const SEED_MEALS: MealSeed[] = [
  { key: "scramble", name: "Potato hash scramble", slot: "breakfast", components: scramble(true, false) },
  {
    key: "oats",
    name: "Overnight oats + egg bites",
    slot: "breakfast",
    components: [
      { key: "oats", role: "other", food: F.oats, portions: [40, 27, null] },
      { key: "yogurt", role: "other", food: F.yogurt, portions: [113, 113, null] },
      { key: "whey", role: "other", food: F.whey, portions: [15, 15, null] },
      { key: "berries", role: "other", food: F.berries, portions: [70, 70, null] },
      { key: "whites", role: "protein", food: F.whites, prepAs: "egg white bites", portions: [183, 122, null] },
      { key: "pepper", role: "vegetable", food: F.peppers, prepAs: "egg white bites", portions: [g(25), g(17), null] },
    ],
  },
  {
    key: "bowl",
    name: "Lunch bowl",
    slot: "lunch",
    flavorIdeas: ["lemon-pepper", "taco", "Greek", "Korean-style", "buffalo", "honey-garlic", "garlic-herb", "chipotle"],
    components: [
      { key: "protein", role: "protein", food: F.breast, swap: "protein", prepAs: "lunch protein", portions: [227, 170, null] },
      { key: "starch", role: "starch", food: F.sweet, swap: "starch", prepAs: "lunch starch", portions: [294, 176, null] },
      { key: "veg", role: "vegetable", food: F.broccoli, swap: "vegetable", prepAs: "lunch vegetable", portions: [175, 175, null] },
    ],
  },
  {
    key: "plate",
    name: "Dinner plate",
    slot: "dinner",
    flavorIdeas: ["garlic-herb", "taco", "BBQ", "burger", "honey mustard", "fajita", "Cajun", "teriyaki", "Italian", "shawarma"],
    components: [
      { key: "protein", role: "protein", food: F.breast, swap: "protein", portions: [227, 170, 227] },
      { key: "starch", role: "starch", food: F.russet, swap: "starch", portions: [294, 176, 294] },
      { key: "veg", role: "vegetable", food: F.broccoli, swap: "vegetable", portions: [180, 180, 180] },
      { key: "oil", role: "fat", food: F.oil, portions: [14, 5, 14] },
    ],
  },
  {
    key: "yogurtBowl",
    name: "Yogurt berry bowl",
    slot: "snack",
    components: [
      { key: "yogurt", role: "other", food: F.yogurt, portions: [227, 170, null] },
      { key: "berries", role: "other", food: F.berries, portions: [140, 70, null] },
      { key: "oats", role: "other", food: F.oats, portions: [20, 10, null] },
    ],
  },
  { key: "shake", name: "Whey shake", slot: "snack", components: [{ key: "whey", role: "other", food: F.whey, portions: [30, 30, null] }] },
  {
    key: "shakeBanana",
    name: "Shake + banana",
    slot: "snack",
    components: [
      { key: "whey", role: "other", food: F.whey, portions: [30, 30, null] },
      { key: "banana", role: "other", food: F.bananas, portions: [1, 0.5, null] },
    ],
  },
  {
    key: "bites",
    name: "Egg white bites",
    slot: "snack",
    components: [
      { key: "whites", role: "protein", food: F.whites, prepAs: "egg white bites", portions: [305, 183, null] },
      { key: "pepper", role: "vegetable", food: F.peppers, prepAs: "egg white bites", portions: [g(42), g(25), null] },
    ],
  },
  {
    key: "jerky",
    name: "Jerky + apple",
    slot: "snack",
    components: [
      { key: "jerky", role: "protein", food: F.jerky, portions: [28, 28, null] },
      { key: "apple", role: "other", food: F.apples, portions: [1, 1, null] },
    ],
  },
  {
    key: "pudding",
    name: "Chocolate protein pudding",
    slot: "snack",
    components: [
      { key: "yogurt", role: "other", food: F.yogurt, portions: [227, 170, null] },
      { key: "whey", role: "other", food: F.whey, portions: [30, 15, null] },
      { key: "cocoa", role: "other", food: F.cocoa, portions: [5, 2, null] },
    ],
  },
  { key: "flex", name: "Leftovers or a meal out", slot: "dinner", isFlex: true, components: [] },
  {
    key: "bfd",
    name: "Breakfast for dinner",
    slot: "dinner",
    components: [...scramble(false, true), { key: "beef", role: "protein", food: F.beef, portions: [113, 85, 113] }],
  },
];

type Dinner = { protein: string; starch: string; veg: string; flavor: string };
type TemplateSeed = {
  name: string;
  /** Mon, Tue, Wed, Thu, Fri dinner plates. */
  dinners: [Dinner, Dinner, Dinner, Dinner, Dinner];
  /** Sunday dinner: breakfast for dinner, or a flex note. */
  sunday: { kind: "bfd" } | { kind: "flex"; flavor: string };
  lunchFlavors: [monWed: string, friSat: string];
  extras: { name: string; forNote?: string; aisle: Aisle; priceCents: number; isPantry?: boolean }[];
};

const d = (protein: string, starch: string, veg: string, flavor: string): Dinner => ({ protein, starch, veg, flavor });

export const SEED_TEMPLATES: TemplateSeed[] = [
  {
    name: "Week 1 — American classics",
    dinners: [
      d(F.thighs, F.red, F.broccoli, "garlic-herb"),
      d(F.beef, F.sweet, F.pepperOnion, "taco"),
      d(F.breast, F.sweet, F.greenBeans, "BBQ"),
      d(F.beef, F.russet, F.salad, "burger"),
      d(F.breast, F.red, F.carrots, "honey mustard"),
    ],
    sunday: { kind: "bfd" },
    lunchFlavors: ["lemon-pepper", "taco"],
    extras: [
      { name: "Salsa", forNote: "Tue taco", aisle: "canned_jarred", priceCents: 248 },
      { name: "BBQ sauce", forNote: "Wed BBQ chicken", aisle: "condiments", priceCents: 198 },
      { name: "Dijon mustard", forNote: "Fri honey mustard", aisle: "condiments", priceCents: 148 },
      { name: "Honey", forNote: "Fri honey mustard", aisle: "condiments", priceCents: 398 },
      { name: "Ketchup", forNote: "Thu burgers", aisle: "condiments", priceCents: 198 },
      { name: "Dill pickles", forNote: "Thu burgers", aisle: "canned_jarred", priceCents: 248 },
      { name: "Apple cider vinegar", aisle: "condiments", priceCents: 248 },
      { name: "Taco seasoning", forNote: "Tue taco", aisle: "spices_baking", priceCents: 98 },
      { name: "Lemon pepper", forNote: "Lunch bowls", aisle: "spices_baking", priceCents: 148 },
    ],
  },
  {
    name: "Week 2 — Around the world",
    dinners: [
      d(F.breast, F.red, F.pepperOnion, "fajita"),
      d(F.beef, F.red, F.broccoli, "Korean-style"),
      d(F.thighs, F.sweet, F.greenBeans, "Cajun"),
      d(F.groundChicken, F.red, F.salad, "Greek"),
      d(F.thighs, F.sweet, F.stirFry, "teriyaki"),
    ],
    sunday: { kind: "bfd" },
    lunchFlavors: ["Greek", "Korean-style"],
    extras: [
      { name: "Fajita seasoning", forNote: "Mon fajita", aisle: "spices_baking", priceCents: 98 },
      { name: "Soy sauce", forNote: "Tue Korean-style", aisle: "condiments", priceCents: 198 },
      { name: "Fresh ginger", forNote: "Tue Korean-style", aisle: "produce", priceCents: 50 },
      { name: "Cajun seasoning", forNote: "Wed Cajun", aisle: "spices_baking", priceCents: 148 },
      { name: "Greek seasoning", forNote: "Thu Greek", aisle: "spices_baking", priceCents: 148 },
      { name: "Light teriyaki sauce", forNote: "Fri teriyaki", aisle: "condiments", priceCents: 248 },
      { name: "Lemons (2)", forNote: "Greek", aisle: "produce", priceCents: 120, isPantry: false },
    ],
  },
  {
    name: "Week 3 — Comfort food",
    dinners: [
      d(F.beef, F.sweet, F.mixedVeg, "shepherd's pie"),
      d(F.beef, F.russet, F.pepperOnion, "chili"),
      d(F.breast, F.red, F.salad, "chicken parm"),
      d(F.breast, F.russet, F.broccoli, "loaded potato bar"),
      d(F.breast, F.russet, F.pepperOnion, "cheesesteak"),
    ],
    sunday: { kind: "flex", flavor: "Chili from the freezer" },
    lunchFlavors: ["buffalo", "honey-garlic"],
    extras: [
      { name: "Kidney beans (2 cans)", forNote: "Tue chili", aisle: "canned_jarred", priceCents: 180, isPantry: false },
      { name: "Diced tomatoes (2 cans)", forNote: "Tue chili", aisle: "canned_jarred", priceCents: 180, isPantry: false },
      { name: "Chili seasoning", forNote: "Tue chili", aisle: "spices_baking", priceCents: 98 },
      { name: "Marinara", forNote: "Wed chicken parm", aisle: "canned_jarred", priceCents: 198, isPantry: false },
      { name: "Part-skim mozzarella, 8 oz", forNote: "Wed chicken parm", aisle: "dairy_eggs", priceCents: 248, isPantry: false },
      { name: "Provolone slices", forNote: "Fri cheesesteak", aisle: "deli", priceCents: 298, isPantry: false },
      { name: "Buffalo sauce", forNote: "Lunch bowls", aisle: "condiments", priceCents: 248 },
    ],
  },
  {
    name: "Week 4 — Sheet pan & skillet",
    dinners: [
      d(F.breast, F.red, F.greenBeans, "lemon-pepper"),
      d(F.beef, F.russet, F.pepperOnion, "hash skillet"),
      d(F.breast, F.sweet, F.carrots, "buffalo"),
      d(F.beef, F.red, F.zucchini, "Italian meatballs"),
      d(F.thighs, F.red, F.cucumbers, "shawarma"),
    ],
    sunday: { kind: "bfd" },
    lunchFlavors: ["garlic-herb", "chipotle"],
    extras: [
      { name: "Marinara", forNote: "Thu meatballs", aisle: "canned_jarred", priceCents: 198, isPantry: false },
      { name: "Celery", forNote: "Wed buffalo", aisle: "produce", priceCents: 178, isPantry: false },
      { name: "Lemons (2)", forNote: "Mon lemon-pepper", aisle: "produce", priceCents: 120, isPantry: false },
      { name: "Buffalo sauce", forNote: "Wed buffalo", aisle: "condiments", priceCents: 248 },
      { name: "Italian seasoning", forNote: "Thu meatballs", aisle: "spices_baking", priceCents: 148 },
      { name: "Chipotle powder", forNote: "Lunch bowls", aisle: "spices_baking", priceCents: 198 },
    ],
  },
];

export const SEED_SETTINGS = { weeklyBudgetCents: 17500, prepWeekdays: [0, 3], doubleWeekdays: [1, 3], guestsDefault: false };

export const GABRIEL_TARGETS = { kcal: 2400, protein: 195 };
export const ANNA_TARGETS = { kcal: 1700, protein: 125 };

// ---------------------------------------------------------------------------
// Rows

export type SeedMember = { userId: string; displayName: string; role: "owner" | "member" };

export type SeedRows = {
  eaters: {
    id: string;
    kind: "member" | "guest";
    userId: string | null;
    name: string;
    color: "a" | "b" | "neutral";
    slots: MealSlot[];
    kcalTarget: number | null;
    proteinTargetG: number | null;
    isActive: boolean;
    position: number;
  }[];
  foods: {
    id: string;
    name: string;
    category: CoreFoodCategory;
    unitKind: "weight" | "count";
    gramsPerCount: number | null;
    kcal100g: number;
    protein100g: number;
    carbs100g: number;
    fat100g: number;
    fiber100g: number;
    cookedYield: number;
    displayCupG: number | null;
    packageLabel: string;
    packageAmount: number;
    packagePriceCents: number;
    buyMode: CoreBuyMode;
    restockWeeks: number | null;
    aisle: Aisle;
  }[];
  meals: { id: string; key: string; name: string; slot: MealSlot; isFlex: boolean; flavorIdeas: string[]; position: number }[];
  components: {
    id: string;
    coreMealId: string;
    key: string;
    role: CoreComponentRole;
    swapCategory: CoreFoodCategory | null;
    defaultFoodId: string;
    prepAs: string | null;
    position: number;
  }[];
  portions: { componentId: string; eaterId: string; amount: number }[];
  templates: { id: string; name: string }[];
  templateMeals: {
    id: string;
    templateId: string;
    weekday: number;
    slot: MealSlot;
    coreMealId: string | null;
    leftoverOfWeekday: number | null;
    choices: Record<string, string>;
    flavor: string | null;
    isDouble: boolean;
    noPrep: boolean;
    position: number;
  }[];
  templateExtras: { id: string; templateId: string; name: string; forNote: string | null; aisle: Aisle; priceCents: number; isPantry: boolean }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The member treated as Gabriel: display name starting "Gabriel", else the owner, else the first. */
export function pickGabriel(members: SeedMember[]): SeedMember | null {
  return (
    members.find((m) => /^gabriel\b/i.test(m.displayName.trim())) ??
    members.find((m) => m.role === "owner") ??
    members[0] ??
    null
  );
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

/** Every row the seed inserts. `newId` makes ids (crypto.randomUUID in the app). */
export function buildSeed(members: SeedMember[], newId: () => string): SeedRows {
  const gabriel = pickGabriel(members);
  const ordered = gabriel ? [gabriel, ...members.filter((m) => m !== gabriel)] : [];
  const eaters: SeedRows["eaters"] = ordered.map((m, i) => ({
    id: newId(),
    kind: "member",
    userId: m.userId,
    name: firstName(m.displayName),
    color: i === 0 ? "a" : "b",
    slots: ["breakfast", "lunch", "dinner", "snack"],
    kcalTarget: i === 0 ? GABRIEL_TARGETS.kcal : ANNA_TARGETS.kcal,
    proteinTargetG: i === 0 ? GABRIEL_TARGETS.protein : ANNA_TARGETS.protein,
    isActive: true,
    position: i,
  }));
  const guests: SeedRows["eaters"] = ["Mom", "Dad"].map((name, i) => ({
    id: newId(),
    kind: "guest",
    userId: null,
    name,
    color: "neutral",
    slots: ["dinner"],
    kcalTarget: null,
    proteinTargetG: null,
    isActive: false,
    position: eaters.length + i,
  }));

  const foods: SeedRows["foods"] = SEED_FOODS.map((f) => ({
    id: newId(),
    name: f.name,
    category: f.category,
    unitKind: f.gramsPerCount ? "count" : "weight",
    gramsPerCount: f.gramsPerCount,
    kcal100g: f.n[0],
    protein100g: f.n[1],
    carbs100g: f.n[2],
    fat100g: f.n[3],
    fiber100g: f.n[4],
    cookedYield: f.cookedYield,
    displayCupG: f.displayCupG ?? null,
    packageLabel: f.packageLabel,
    packageAmount: f.packageAmount,
    packagePriceCents: f.priceCents,
    buyMode: f.restockWeeks ? "restock" : "by_amount",
    restockWeeks: f.restockWeeks ?? null,
    aisle: f.aisle,
  }));
  const foodByName = new Map(foods.map((f) => [f.name, f]));
  const food = (name: string) => {
    const f = foodByName.get(name);
    if (!f) throw new Error(`Seed food missing: ${name}`);
    return f;
  };

  const meals: SeedRows["meals"] = [];
  const components: SeedRows["components"] = [];
  const portions: SeedRows["portions"] = [];
  const memberEaters = eaters;
  SEED_MEALS.forEach((m, mi) => {
    const mealId = newId();
    meals.push({ id: mealId, key: m.key, name: m.name, slot: m.slot, isFlex: m.isFlex ?? false, flavorIdeas: m.flavorIdeas ?? [], position: mi });
    m.components.forEach((c, ci) => {
      const componentId = newId();
      const f = food(c.food);
      components.push({
        id: componentId,
        coreMealId: mealId,
        key: c.key,
        role: c.role,
        swapCategory: c.swap ?? null,
        defaultFoodId: f.id,
        prepAs: c.prepAs ?? null,
        position: ci,
      });
      const toStored = (a: Amount) => round2(typeof a === "number" ? a : f.gramsPerCount ? a.g / f.gramsPerCount : a.g);
      // Gabriel's column, then Anna's for every other member, then guests.
      memberEaters.forEach((e, i) => portions.push({ componentId, eaterId: e.id, amount: toStored(c.portions[i === 0 ? 0 : 1]) }));
      const guestPortion = c.portions[2];
      if (guestPortion !== null) for (const e of guests) portions.push({ componentId, eaterId: e.id, amount: toStored(guestPortion) });
    });
  });
  const mealByKey = new Map(meals.map((m) => [m.key, m]));
  const componentOf = (mealKey: string, key: string) => components.find((c) => c.coreMealId === mealByKey.get(mealKey)!.id && c.key === key)!;

  const templates: SeedRows["templates"] = [];
  const templateMeals: SeedRows["templateMeals"] = [];
  const templateExtras: SeedRows["templateExtras"] = [];
  for (const t of SEED_TEMPLATES) {
    const templateId = newId();
    templates.push({ id: templateId, name: t.name });
    const add = (row: Omit<SeedRows["templateMeals"][number], "id" | "templateId" | "choices" | "flavor" | "isDouble" | "noPrep" | "leftoverOfWeekday" | "position"> & Partial<SeedRows["templateMeals"][number]>) =>
      templateMeals.push({
        id: newId(),
        templateId,
        choices: {},
        flavor: null,
        isDouble: false,
        noPrep: false,
        leftoverOfWeekday: null,
        position: 0,
        ...row,
      });
    for (let weekday = 1; weekday <= 7; weekday++) {
      add({ weekday, slot: "breakfast", coreMealId: mealByKey.get("scramble")!.id });
      add({ weekday, slot: "snack", coreMealId: mealByKey.get("yogurtBowl")!.id, position: 0 });
      add({ weekday, slot: "snack", coreMealId: mealByKey.get("shake")!.id, position: 1 });
      // Lunch
      if (weekday === 2 || weekday === 4) add({ weekday, slot: "lunch", coreMealId: null, leftoverOfWeekday: weekday - 1 });
      else if (weekday === 7) add({ weekday, slot: "lunch", coreMealId: mealByKey.get("bowl")!.id, noPrep: true });
      else add({ weekday, slot: "lunch", coreMealId: mealByKey.get("bowl")!.id, flavor: weekday <= 3 ? t.lunchFlavors[0] : t.lunchFlavors[1] });
      // Dinner
      if (weekday <= 5) {
        const dinner = t.dinners[weekday - 1];
        add({
          weekday,
          slot: "dinner",
          coreMealId: mealByKey.get("plate")!.id,
          choices: {
            [componentOf("plate", "protein").id]: food(dinner.protein).id,
            [componentOf("plate", "starch").id]: food(dinner.starch).id,
            [componentOf("plate", "veg").id]: food(dinner.veg).id,
          },
          flavor: dinner.flavor,
          isDouble: weekday === 1 || weekday === 3,
        });
      } else if (weekday === 6) {
        add({ weekday, slot: "dinner", coreMealId: mealByKey.get("flex")!.id, flavor: "Leftovers or a planned meal out" });
      } else if (t.sunday.kind === "bfd") {
        add({ weekday, slot: "dinner", coreMealId: mealByKey.get("bfd")!.id });
      } else {
        add({ weekday, slot: "dinner", coreMealId: mealByKey.get("flex")!.id, flavor: t.sunday.flavor });
      }
    }
    for (const e of t.extras) {
      templateExtras.push({
        id: newId(),
        templateId,
        name: e.name,
        forNote: e.forNote ?? null,
        aisle: e.aisle,
        priceCents: e.priceCents,
        isPantry: e.isPantry ?? true,
      });
    }
  }

  return { eaters: [...eaters, ...guests], foods, meals, components, portions, templates, templateMeals, templateExtras };
}
