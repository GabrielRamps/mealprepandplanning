// Aisle names for display, and a keyword guess for ingredients typed by hand
// (imports get an aisle from the AI instead, PRD 7.4).
import type { Aisle } from "@/lib/enums";

export const AISLE_LABELS: Record<Aisle, string> = {
  produce: "Produce",
  meat_seafood: "Meat & seafood",
  dairy_eggs: "Dairy & eggs",
  bakery: "Bakery",
  deli: "Deli",
  pantry: "Pantry",
  canned_jarred: "Canned & jarred",
  pasta_grains: "Pasta & grains",
  spices_baking: "Spices & baking",
  condiments: "Condiments & sauces",
  frozen: "Frozen",
  beverages: "Beverages",
  snacks: "Snacks",
  household: "Household",
  other: "Other",
};

// Phrases first, so "olive oil", "bell pepper" and "ground beef" aren't
// claimed by "olive", "pepper" or "ground"; then single words, in order.
const RULES: [Aisle, string[]][] = [
  ["spices_baking", ["red pepper flake", "black pepper", "white pepper", "cayenne pepper", "garlic powder", "onion powder", "chili powder", "ground ginger", "ground cinnamon", "ground cumin", "ground nutmeg", "dried oregano", "dried thyme", "dried basil", "dried rosemary", "dried parsley", "dried dill", "bay leaf", "baking soda", "baking powder", "brown sugar", "powdered sugar", "chocolate chip"]],
  ["pantry", ["olive oil", "vegetable oil", "canola oil", "sesame oil", "coconut oil", "avocado oil"]],
  ["canned_jarred", ["coconut milk", "coconut cream", "tomato paste", "tomato sauce", "crushed tomato", "diced tomato", "roasted red pepper", "artichoke heart"]],
  ["condiments", ["peanut butter", "almond butter", "soy sauce", "hot sauce", "fish sauce", "maple syrup"]],
  ["produce", ["bell pepper", "red pepper", "green pepper", "yellow pepper", "sweet potato", "green onion", "spring onion", "green bean"]],
  ["dairy_eggs", ["sour cream", "cream cheese", "half and half", "heavy cream"]],
  ["frozen", ["frozen", "ice cream"]],
  ["meat_seafood", ["ground beef", "ground turkey", "ground pork", "ground chicken"]],
  ["pasta_grains", ["egg noodle"]],
  ["deli", ["rotisserie chicken", "sliced turkey", "sliced ham", "deli"]],
  ["canned_jarred", ["broth", "stock", "canned", "beans", "chickpea", "garbanzo", "cannellini", "refried", "olive", "caper", "pickle", "salsa", "jam", "jelly", "tuna", "sardine", "anchovy"]],
  ["spices_baking", ["salt", "pepper", "paprika", "cumin", "cinnamon", "nutmeg", "oregano", "turmeric", "curry", "seasoning", "spice", "vanilla", "extract", "yeast", "flour", "sugar", "cornstarch", "cocoa", "sprinkle", "dried"]],
  ["condiments", ["sauce", "ketchup", "mustard", "mayo", "mayonnaise", "vinegar", "dressing", "sriracha", "soy", "tamari", "worcestershire", "honey", "syrup", "tahini", "hoisin", "miso", "relish", "pesto"]],
  ["pasta_grains", ["pasta", "spaghetti", "penne", "macaroni", "noodle", "linguine", "fettuccine", "lasagna", "orzo", "rice", "quinoa", "couscous", "oat", "barley", "farro", "polenta", "grits", "lentil"]],
  ["pantry", ["oil", "shortening", "nut", "almond", "walnut", "pecan", "cashew", "peanut", "seed", "raisin", "breadcrumb", "panko", "cracker", "cereal", "granola", "coconut"]],
  ["dairy_eggs", ["milk", "cream", "butter", "cheese", "parmesan", "mozzarella", "cheddar", "feta", "ricotta", "yogurt", "egg", "buttermilk", "ghee"]],
  ["deli", ["salami", "prosciutto", "pepperoni", "hummus"]],
  ["meat_seafood", ["chicken", "beef", "steak", "pork", "bacon", "sausage", "ham", "turkey", "lamb", "veal", "chorizo", "fish", "salmon", "cod", "tilapia", "halibut", "shrimp", "prawn", "scallop", "crab", "lobster", "mussel", "clam"]],
  ["bakery", ["bread", "baguette", "bun", "roll", "tortilla", "pita", "naan", "bagel", "croissant", "english muffin", "flatbread"]],
  ["produce", ["onion", "shallot", "garlic", "ginger", "scallion", "leek", "potato", "carrot", "celery", "tomato", "lettuce", "spinach", "kale", "arugula", "cabbage", "broccoli", "cauliflower", "zucchini", "squash", "cucumber", "jalapeno", "chile", "chili", "mushroom", "corn", "pea", "asparagus", "eggplant", "avocado", "lemon", "lime", "orange", "apple", "banana", "berry", "berries", "strawberry", "strawberries", "blueberry", "blueberries", "raspberry", "raspberries", "grape", "mango", "pineapple", "peach", "peaches", "pear", "melon", "herb", "basil", "parsley", "cilantro", "dill", "mint", "rosemary", "thyme", "sage", "chive", "sprout", "radish", "radishes", "beet", "yam"]],
  ["beverages", ["water", "juice", "soda", "coffee", "tea", "wine", "beer"]],
  ["snacks", ["chip", "pretzel", "popcorn", "cookie", "candy"]],
  ["household", ["paper towel", "foil", "plastic wrap", "parchment", "trash bag", "napkin", "detergent", "soap", "sponge"]],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMPILED = RULES.map(
  ([aisle, words]) => [aisle, words.map((w) => new RegExp(`\\b${escape(w)}s?\\b`, "i"))] as const,
);

/** Best-guess aisle for an ingredient name; "other" when nothing matches. */
export function guessAisle(name: string): Aisle {
  for (const [aisle, patterns] of COMPILED) {
    if (patterns.some((p) => p.test(name))) return aisle;
  }
  return "other";
}
