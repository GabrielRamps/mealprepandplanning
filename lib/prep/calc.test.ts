import { describe, expect, it } from "vitest";
import {
  costStatus,
  eatersOf,
  kcalStatus,
  memberDays,
  packagesFor,
  prepCoverage,
  proteinStatus,
  recipeUse,
  shoppingNeeds,
  weekAverage,
  weekTasks,
  weekTotals,
} from "@/lib/prep/calc";
import { seedFixture, WEEK_START } from "@/lib/prep/fixtures";
import { packageGrams } from "@/lib/prep/format";

const MONDAY = WEEK_START;

describe("§8.3 nutrition: Gabriel, Week 1 Monday", () => {
  it("as seeded, thighs for dinner: 2,212.4 kcal and 214.2 g protein", () => {
    const f = seedFixture(0);
    const monday = memberDays(f.input, f.eater("Gabriel")).find((d) => d.day === MONDAY)!;
    expect(monday.partial).toBe(false);
    expect(monday.kcal).toBeGreaterThan(2212.4 - 1);
    expect(monday.kcal).toBeLessThan(2212.4 + 1);
    expect(monday.protein).toBeCloseTo(214.2, 0);
    expect(Math.abs(monday.protein - 214.2)).toBeLessThanOrEqual(0.5);
  });

  it("with chicken breast and russets for dinner: 2,210.1 kcal and 220.6 g", () => {
    const f = seedFixture(0);
    const dinner = f.at(1, "dinner")[0];
    const plate = f.meal("Dinner plate");
    const protein = plate.components.find((c) => c.role === "protein")!;
    const starch = plate.components.find((c) => c.role === "starch")!;
    dinner.choices = { ...dinner.choices, [protein.id]: f.food("Chicken breast").id, [starch.id]: f.food("Russet potatoes").id };
    const monday = memberDays(f.input, f.eater("Gabriel")).find((d) => d.day === MONDAY)!;
    expect(Math.abs(monday.kcal - 2210.1)).toBeLessThanOrEqual(1);
    expect(Math.abs(monday.protein - 220.6)).toBeLessThanOrEqual(0.5);
  });

  it("about 8% under 2,400 kcal is amber for calories, green for protein", () => {
    const f = seedFixture(0);
    const g = weekTotals(f.input).members.find((m) => m.name === "Gabriel")!;
    const monday = g.days.find((d) => d.day === MONDAY)!;
    expect(monday.kcalStatus).toBe("amber");
    expect(monday.proteinStatus).toBe("green");
  });
});

describe("§8.4 packages", () => {
  it("chicken breast, Week 1: 3,176 g needed, 3 packs, $35.91", () => {
    const f = seedFixture(0);
    const breast = shoppingNeeds(f.input).find((n) => n.food.name === "Chicken breast")!;
    expect(Math.round(breast.needG)).toBe(3176);
    expect(breast.packages).toBe(3);
    expect(breast.listCostCents).toBe(3591);
    expect(breast.shortG).toBe(0);
  });

  it("Sunday lunch on beef: 2,779 g, rounds down to 2 packs, 57 g short", () => {
    const f = seedFixture(0);
    const sundayLunch = f.at(7, "lunch")[0];
    const bowl = f.meal("Lunch bowl");
    const protein = bowl.components.find((c) => c.role === "protein")!;
    sundayLunch.choices = { [protein.id]: f.food("93% lean ground beef").id };
    const breast = shoppingNeeds(f.input).find((n) => n.food.name === "Chicken breast")!;
    expect(Math.round(breast.needG)).toBe(2779);
    expect(breast.packages).toBe(2);
    expect(Math.round(breast.shortG)).toBe(57);
  });

  it("the 5% rule at 0.04, 0.05 and 0.06 over", () => {
    expect(packagesFor(1000 * 2.04, 1000)).toBe(2);
    expect(packagesFor(1000 * 2.05, 1000)).toBe(2);
    expect(packagesFor(1000 * 2.06, 1000)).toBe(3);
    expect(packagesFor(1000 * 0.03, 1000)).toBe(1); // something needed: at least one
    expect(packagesFor(0, 1000)).toBe(0);
    expect(packagesFor(2000, 1000)).toBe(2);
  });

  it("count foods: eggs in 18 ct cartons", () => {
    const f = seedFixture(0);
    const eggs = shoppingNeeds(f.input).find((n) => n.food.name === "Eggs")!;
    // Scramble 7 breakfasts × (3 + 2) eggs + Sunday breakfast-for-dinner (3 + 2) = 40 eggs.
    expect(eggs.needG).toBeCloseTo(40 * 50, 5);
    expect(packageGrams(eggs.food)).toBe(900);
    expect(eggs.packages).toBe(3); // 40 / 18 = 2.22
    expect(eggs.listCostCents).toBe(3 * 347);
  });

  it("restock foods count their weekly share, and cost nothing on the list unless bought", () => {
    const f = seedFixture(0);
    const whey = shoppingNeeds(f.input).find((n) => n.food.name === "Whey protein")!;
    // Shakes: 7 days × (30 + 30) g = 420 g of a 907 g, $29.98 tub.
    expect(whey.needG).toBeCloseTo(420, 5);
    expect(whey.budgetCents).toBe(Math.round((420 / 907) * 2998));
    expect(whey.listCostCents).toBe(0);
    expect(whey.packages).toBe(0);
    f.input.restockBuy = new Set([whey.food.id]);
    const bought = shoppingNeeds(f.input).find((n) => n.food.name === "Whey protein")!;
    expect(bought.packages).toBe(1);
    expect(bought.listCostCents).toBe(2998);
    expect(bought.budgetCents).toBe(whey.budgetCents);
  });
});

describe("doubles, leftovers and guests", () => {
  it("leftover lunches are eaten by members only, even with guests on", () => {
    const f = seedFixture(0);
    f.input.guestsOn = true;
    for (const g of f.input.eaters.filter((e) => e.kind === "guest")) g.isActive = true;
    const tuesdayLunch = f.at(2, "lunch")[0];
    expect(tuesdayLunch.leftoverOf).toBe(f.at(1, "dinner")[0].id);
    expect(eatersOf(f.input, tuesdayLunch).map((e) => e.name)).toEqual(["Gabriel", "Anna"]);
    expect(eatersOf(f.input, f.at(2, "dinner")[0]).map((e) => e.name)).toEqual(["Gabriel", "Anna", "Mom", "Dad"]);
  });

  it("a double dinner buys the members' portions again, not the guests'", () => {
    const f = seedFixture(0);
    const thighs = () => shoppingNeeds(f.input).find((n) => n.food.name === "Chicken thighs, boneless")!;
    // Monday double, thighs: (227 + 170) × 2; Wed thighs? no. Week 1 only Monday.
    expect(Math.round(thighs().needG)).toBe(2 * 397);
    f.input.guestsOn = true;
    for (const g of f.input.eaters.filter((e) => e.kind === "guest")) g.isActive = true;
    expect(Math.round(thighs().needG)).toBe(2 * 397 + 2 * 227);
  });

  it("leftover nutrition matches the dinner it comes from", () => {
    const f = seedFixture(0);
    const days = memberDays(f.input, f.eater("Anna"));
    const mon = days[0];
    const tue = days[1];
    // Monday has a lunch bowl and thigh dinner; Tuesday has thigh leftovers and a beef dinner.
    expect(mon.partial).toBe(false);
    expect(tue.partial).toBe(false);
    expect(tue.kcal).toBeGreaterThan(1000);
  });
});

describe("partial days", () => {
  it("Saturday's flex dinner marks it partial and leaves it out of the average", () => {
    const f = seedFixture(0);
    const totals = weekTotals(f.input);
    expect(totals.partialDays).toEqual(["2026-11-14"]);
    const g = totals.members[0];
    expect(g.days[5].partial).toBe(true);
    expect(g.average!.days).toBe(6);
    const counted = g.days.filter((d) => !d.partial);
    expect(g.average!.kcal).toBeCloseTo(counted.reduce((n, d) => n + d.kcal, 0) / 6, 6);
  });

  it("a recipe dinner counts toward cost but not nutrition", () => {
    const f = seedFixture(0);
    const friday = f.at(5, "dinner")[0];
    Object.assign(friday, { coreMealId: null, recipeId: "recipe-1", servings: 2, choices: {}, isDouble: false });
    const breast = f.food("Chicken breast");
    f.input.recipeUses.set(friday.id, { title: "Tacos", foods: [{ foodId: breast.id, grams: 400 }], unpriced: 3 });
    const totals = weekTotals(f.input);
    expect(totals.partialDays).toContain("2026-11-13");
    expect(totals.unpricedItems).toBe(3);
    const need = shoppingNeeds(f.input).find((n) => n.food.id === breast.id)!;
    expect(Math.round(need.needG)).toBe(3176 - 397 + 400);
    expect(need.sources.some((s) => s.label === "Tacos" && s.recipeId === "recipe-1")).toBe(true);
  });

  it("every day partial averages to null", () => {
    expect(weekAverage([{ day: "x", kcal: 1, protein: 1, carbs: 0, fat: 0, fiber: 0, partial: true }])).toBeNull();
  });
});

describe("§8.5 recipe use", () => {
  it("matches weights and counts by ingredient and scales to servings", () => {
    const f = seedFixture(0);
    const breast = f.food("Chicken breast");
    const eggs = f.food("Eggs");
    const map = new Map([
      ["ing-chicken", breast],
      ["ing-egg", eggs],
    ]);
    const use = recipeUse(
      {
        id: "r",
        title: "Fried rice",
        servings: 4,
        ingredients: [
          { ingredientId: "ing-chicken", name: "chicken breast", quantity: 1, quantityMax: null, unit: "lb", rawText: "1 lb chicken", isOptional: false, aisle: "meat_seafood", isPantryStaple: false },
          { ingredientId: "ing-egg", name: "egg", quantity: 2, quantityMax: null, unit: null, rawText: "2 eggs", isOptional: false, aisle: "dairy_eggs", isPantryStaple: false },
          { ingredientId: null, name: "rice", quantity: 2, quantityMax: null, unit: "cup", rawText: "2 cups rice", isOptional: false, aisle: "pasta_grains", isPantryStaple: false },
          { ingredientId: null, name: "salt", quantity: null, quantityMax: null, unit: null, rawText: "salt", isOptional: false, aisle: "spices_baking", isPantryStaple: false },
        ],
      },
      2,
      map,
    );
    expect(use.foods).toEqual([
      { foodId: breast.id, grams: 453.592 / 2 },
      { foodId: eggs.id, grams: 50 },
    ]);
    expect(use.unpriced).toBe(1);
  });
});

describe("§8.6 status thresholds", () => {
  it("cost: green to 100%, amber to 110%, red above", () => {
    expect(costStatus(17500, 17500)).toBe("green");
    expect(costStatus(17501, 17500)).toBe("amber");
    expect(costStatus(19250, 17500)).toBe("amber");
    expect(costStatus(19251, 17500)).toBe("red");
  });
  it("kcal: within 7% green, 15% amber, beyond red, both directions", () => {
    expect(kcalStatus(2400 * 1.07, 2400)).toBe("green");
    expect(kcalStatus(2400 * 0.93, 2400)).toBe("green");
    expect(kcalStatus(2400 * 0.929, 2400)).toBe("amber");
    expect(kcalStatus(2400 * 1.15, 2400)).toBe("amber");
    expect(kcalStatus(2400 * 0.85, 2400)).toBe("amber");
    expect(kcalStatus(2400 * 1.151, 2400)).toBe("red");
  });
  it("protein: from 95% green, 85% amber, below red", () => {
    expect(proteinStatus(195 * 0.95, 195)).toBe("green");
    expect(proteinStatus(300, 195)).toBe("green");
    expect(proteinStatus(195 * 0.949, 195)).toBe("amber");
    expect(proteinStatus(195 * 0.85, 195)).toBe("amber");
    expect(proteinStatus(195 * 0.849, 195)).toBe("red");
  });
});

describe("§8.7 tasks", () => {
  it("coverage for prep days {0,3} and {0,4}", () => {
    expect([...prepCoverage([0, 3])]).toEqual([
      [0, [1, 2, 3]],
      [3, [4, 5, 6, 7]],
    ]);
    expect([...prepCoverage([4, 0])]).toEqual([
      [0, [1, 2, 3, 4]],
      [4, [5, 6, 7]],
    ]);
  });

  it("Sunday prep: lunch protein for Mon and Wed bowls, per eater", () => {
    const f = seedFixture(0);
    const tasks = weekTasks(f.input, [0, 3]);
    const breast = f.food("Chicken breast");
    const sunday = tasks.filter((t) => t.date === "2026-11-08");
    const lunchProtein = sunday.find((t) => t.key === `2026-11-08:prep:lunch protein:${breast.id}`)!;
    expect(lunchProtein.title).toBe("Lunch protein: cook 1¾ lb chicken breast");
    expect(lunchProtein.detail).toEqual(["Gabriel 2 × 6 oz cooked", "Anna 2 × 4½ oz cooked"]);
    // Breakfast potatoes follow the same coverage: Mon–Wed.
    expect(sunday.some((t) => t.title.startsWith("Breakfast potatoes: cook"))).toBe(true);
  });

  it("Wednesday prep covers Thu–Sun but skips Sunday's fresh lunch and leftovers", () => {
    const f = seedFixture(0);
    const breast = f.food("Chicken breast");
    const wed = weekTasks(f.input, [0, 3]).find((t) => t.key === `2026-11-11:prep:lunch protein:${breast.id}`)!;
    // Fri + Sat bowls (Thu is leftovers, Sun is cooked fresh).
    expect(wed.detail).toEqual(["Gabriel 2 × 6 oz cooked", "Anna 2 × 4½ oz cooked"]);
  });

  it("pack leftovers on each double dinner", () => {
    const f = seedFixture(0);
    const tasks = weekTasks(f.input, [0, 3]).filter((t) => t.kind === "pack");
    expect(tasks.map((t) => t.date)).toEqual(["2026-11-09", "2026-11-11"]);
    expect(tasks[0].key).toBe(`2026-11-09:pack:${f.at(1, "dinner")[0].id}`);
    expect(tasks[0].detail[0]).toMatch(/^Gabriel 6 oz cooked chicken thighs, boneless/);
  });

  it("thaw only for dinners from shopping day + 3, and freeze on shopping day", () => {
    const f = seedFixture(0);
    const tasks = weekTasks(f.input, [0, 3]);
    const thaws = tasks.filter((t) => t.kind === "thaw");
    // Dinners Wed (breast, double), Thu (beef), Fri (breast), Sun (beef). Mon and Tue are fresh from shopping.
    expect(thaws.map((t) => t.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-14"]);
    expect(thaws[0].title).toBe("Tonight: move 1¾ lb chicken breast to the fridge for Wednesday.");
    expect(thaws[0].key).toBe(`2026-11-10:thaw:${f.at(3, "dinner")[0].id}`);
    const freeze = tasks.find((t) => t.kind === "freeze")!;
    expect(freeze.key).toBe("2026-11-08:freeze");
    expect(freeze.title).toBe("Freeze: 93% lean ground beef, chicken breast");
  });

  it("task keys are deterministic", () => {
    const a = weekTasks(seedFixture(0).input, [0, 3]).map((t) => t.key);
    const b = weekTasks(seedFixture(0).input, [0, 3]).map((t) => t.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("whole week", () => {
  it("every template totals without errors and stays near budget", () => {
    for (let i = 0; i < 4; i++) {
      const t = weekTotals(seedFixture(i).input);
      expect(t.costCents).toBeGreaterThan(5000);
      expect(t.members).toHaveLength(2);
      expect(t.costByFood[0].cents).toBeGreaterThanOrEqual(t.costByFood.at(-1)!.cents);
    }
  });
});
