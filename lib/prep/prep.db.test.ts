// Prep against a real Postgres (PRD-prep 13): seed, weeks from templates,
// doubles, lists and delete guards. Runs only with TEST_DATABASE_URL set to a
// throwaway database that has the migrations applied (never production).
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("prep (database)", async () => {
  const { getDb, schema } = await import("@/lib/db");
  const { seedPrep } = await import("./seed");
  const { loadCatalog, getWeekRow, loadWeek, weekMeals, latestPrepList } = await import("./load");
  const weeks = await import("./weeks");
  const prepList = await import("./list");
  const menu = await import("./menu");
  const lists = await import("@/lib/grocery/lists");

  let db!: ReturnType<typeof getDb>;
  const gabriel = `test-user-${crypto.randomUUID()}`;
  const anna = `test-user-${crypto.randomUUID()}`;
  const outsider = `test-user-${crypto.randomUUID()}`;
  const householdId = crypto.randomUUID();
  const otherHouseholdId = crypto.randomUUID();
  const weekStart = "2026-11-09";

  beforeAll(async () => {
    db = getDb();
    await db.insert(schema.households).values([
      { id: householdId, name: "Test household" },
      { id: otherHouseholdId, name: "Other household" },
    ]);
    await db.insert(schema.householdMembers).values([
      { householdId, userId: anna, displayName: "Anna Test", role: "owner" },
      { householdId, userId: gabriel, displayName: "Gabriel Henley", role: "member" },
      { householdId: otherHouseholdId, userId: outsider, displayName: "Someone Else", role: "owner" },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.households).where(inArray(schema.households.id, [householdId, otherHouseholdId]));
  });

  const catalog = async () => (await loadCatalog(householdId))!;

  it("seeds once, with Gabriel by name, estimates everywhere, and is idempotent", async () => {
    expect(await seedPrep(householdId, gabriel)).toBe(true);
    expect(await seedPrep(householdId, gabriel)).toBe(false);
    const c = await catalog();
    expect(c.foods.size).toBe(32);
    expect(c.meals.size).toBe(12);
    expect([...c.foods.values()].every((f) => f.priceIsEstimate && f.ingredientId)).toBe(true);
    const members = c.eaters.filter((e) => e.kind === "member");
    expect(members.map((e) => [e.name, e.kcalTarget, e.color])).toEqual([
      ["Gabriel", 2400, "a"],
      ["Anna", 1700, "b"],
    ]);
    expect(c.eaters.filter((e) => e.kind === "guest").map((e) => [e.name, e.isActive])).toEqual([
      ["Mom", false],
      ["Dad", false],
    ]);
    expect(c.settings.rotation).toHaveLength(4);
    const prices = await db.select().from(schema.coreFoodPrices).innerJoin(schema.coreFoods, eq(schema.coreFoods.id, schema.coreFoodPrices.coreFoodId)).where(eq(schema.coreFoods.householdId, householdId));
    expect(prices).toHaveLength(32);
    expect(prices.every((p) => p.core_food_prices.source === "seed")).toBe(true);
    // The other household has nothing.
    expect(await loadCatalog(otherHouseholdId)).toBeNull();
  });

  let weekId = "";

  it("starts a week from Week 1 with leftover links rebuilt and extras copied", async () => {
    const c = await catalog();
    weekId = await weeks.startWeek(householdId, gabriel, weekStart, { templateId: c.settings.rotation[0] });
    expect(await weeks.startWeek(householdId, gabriel, weekStart, "blank")).toBe(weekId);
    const meals = await weekMeals(weekId);
    const monDinner = meals.find((m) => m.day === "2026-11-09" && m.slot === "dinner")!;
    const tueLunch = meals.find((m) => m.day === "2026-11-10" && m.slot === "lunch")!;
    expect(monDinner.isDouble).toBe(true);
    expect(tueLunch.leftoverOf).toBe(monDinner.id);
    const week = (await getWeekRow(householdId, weekStart))!;
    expect(week.budgetCents).toBe(17500);
    expect(week.guestsOn).toBe(false);
    const loaded = await loadWeek(householdId, c, week);
    expect(loaded.extras.map((e) => e.name)).toContain("BBQ sauce");
  });

  it("Double on Thursday asks before replacing Friday's planned lunch, then replaces it", async () => {
    const c = await catalog();
    const week = (await getWeekRow(householdId, weekStart))!;
    const thu = (await weekMeals(weekId)).find((m) => m.day === "2026-11-12" && m.slot === "dinner")!;
    const slot = {
      entryId: thu.id,
      day: thu.day,
      slot: thu.slot,
      entry: { kind: "meal" as const, coreMealId: thu.coreMealId!, choices: thu.choices },
      flavor: thu.flavor,
      isDouble: true,
      noPrep: false,
      position: 0,
      confirmReplace: false,
    };
    expect(await weeks.saveSlot(householdId, c, week, slot)).toEqual({ ok: false, confirm: "Replace Friday's lunch with leftovers?" });
    expect(await weeks.saveSlot(householdId, c, week, { ...slot, confirmReplace: true })).toEqual({ ok: true, id: thu.id });
    let fri = (await weekMeals(weekId)).filter((m) => m.day === "2026-11-13" && m.slot === "lunch");
    expect(fri.map((m) => m.leftoverOf)).toEqual([thu.id]);
    // Double off clears the leftovers it made.
    await weeks.saveSlot(householdId, c, week, { ...slot, isDouble: false });
    fri = (await weekMeals(weekId)).filter((m) => m.day === "2026-11-13" && m.slot === "lunch");
    expect(fri).toEqual([]);
    // A Sunday double has nowhere to go.
    const sun = (await weekMeals(weekId)).find((m) => m.day === "2026-11-15" && m.slot === "dinner")!;
    const result = await weeks.saveSlot(householdId, c, week, {
      ...slot,
      entryId: sun.id,
      day: sun.day,
      entry: { kind: "meal", coreMealId: sun.coreMealId!, choices: {} },
    });
    expect(result).toEqual({ ok: false, error: "Sunday leftovers fall in next week." });
  });

  it("deleting a double dinner removes its leftovers too", async () => {
    const week = (await getWeekRow(householdId, weekStart))!;
    const wed = (await weekMeals(weekId)).find((m) => m.day === "2026-11-11" && m.slot === "dinner")!;
    await weeks.deleteSlotEntry(week, wed.id);
    const after = await weekMeals(weekId);
    expect(after.some((m) => m.id === wed.id || m.leftoverOf === wed.id)).toBe(false);
  });

  let listId = "";

  it("makes a list with package counts, prices and a pantry group", async () => {
    // Fresh Week 1 on another week, untouched.
    const c = await catalog();
    const id = await weeks.startWeek(householdId, gabriel, "2026-11-16", { templateId: c.settings.rotation[0] });
    const week = (await getWeekRow(householdId, "2026-11-16"))!;
    listId = await prepList.makePrepList(householdId, gabriel, c, await loadWeek(householdId, c, week));
    expect(await latestPrepList(householdId, id)).toBe(listId);
    const list = (await lists.getList(householdId, listId))!;
    expect(list.name).toBe("Prep · Week of Nov 16");
    expect(list.prepWeekId).toBe(id);
    const breast = list.items.find((i) => i.name === "Chicken breast")!;
    expect(breast).toMatchObject({ quantity: 3, unit: "package", priceCents: 3591, aisle: "meat_seafood", isPantry: false });
    expect(breast.note).toBe("3 lb family pack · $11.97 each · 7 lb needed");
    expect(list.items.find((i) => i.name === "Whey protein")).toMatchObject({ isPantry: true, priceCents: null });
    expect(list.items.find((i) => i.name === "Salsa")).toMatchObject({ isPantry: true, aisle: "canned_jarred" });
    const after = (await getWeekRow(householdId, "2026-11-16"))!;
    expect(prepList.weekChangedSinceList(after)).toBe(false);
  });

  it("updating the list keeps checks and hand-added items", async () => {
    const c = await catalog();
    let list = (await lists.getList(householdId, listId))!;
    const breast = list.items.find((i) => i.name === "Chicken breast")!;
    await lists.setItemChecked(listId, breast.id, true, gabriel);
    await lists.addManualItem(householdId, listId, { name: "paper towels", quantity: null, unit: null, aisle: null });
    const week = (await getWeekRow(householdId, "2026-11-16"))!;
    // Guests on: more chicken, and the week shows it changed.
    await weeks.setWeekOptions(c, week, { guestsOn: true });
    await db.update(schema.prepEaters).set({ isActive: true }).where(and(eq(schema.prepEaters.householdId, householdId), eq(schema.prepEaters.kind, "guest")));
    const c2 = await catalog();
    const changed = (await getWeekRow(householdId, "2026-11-16"))!;
    expect(prepList.weekChangedSinceList(changed)).toBe(true);
    await prepList.updatePrepList(c2, await loadWeek(householdId, c2, changed), listId);
    list = (await lists.getList(householdId, listId))!;
    const breastAfter = list.items.find((i) => i.name === "Chicken breast")!;
    expect(breastAfter.id).toBe(breast.id);
    expect(breastAfter.isChecked).toBe(true);
    // 3,176 g + the guests' 908 g is 3.0007 packs: still 3, with a note that it's a hair short.
    expect(breastAfter.note).toBe("3 lb family pack · $11.97 each · ≈ ½ oz short");
    expect(list.items.some((i) => i.name === "paper towels" && i.isManual)).toBe(true);
    expect(prepList.weekChangedSinceList((await getWeekRow(householdId, "2026-11-16"))!)).toBe(false);
  });

  it("won't delete a food used by a meal; does delete an unused one", async () => {
    const c = await catalog();
    const breast = [...c.foods.values()].find((f) => f.name === "Chicken breast")!;
    const result = await menu.deleteCoreFood(householdId, c, breast.id);
    // Plus any of this test's weeks still ahead of today.
    expect(result.error).toMatch(/^Used in Lunch bowl(, Dinner plate and \d+ weeks?| and Dinner plate)\. Swap it out first\.$/);
    const coleslaw = [...c.foods.values()].find((f) => f.name === "Coleslaw mix")!;
    expect(await menu.deleteCoreFood(householdId, c, coleslaw.id)).toEqual({});
    expect((await catalog()).foods.get(coleslaw.id)!.deleted).toBe(true);
  });

  it("a price edit writes history and clears the estimate", async () => {
    const c = await catalog();
    const breast = [...c.foods.values()].find((f) => f.name === "Chicken breast")!;
    await menu.upsertCoreFood(householdId, gabriel, {
      id: breast.id,
      name: breast.name,
      category: breast.category,
      unitKind: breast.unitKind,
      gramsPerCount: null,
      kcal100g: 120,
      protein100g: 22.5,
      carbs100g: 0,
      fat100g: 2.6,
      fiber100g: 0,
      cookedYield: 0.75,
      displayCupG: null,
      packageLabel: "3 lb family pack",
      packageAmount: 1361,
      packagePriceCents: 1097,
      priceIsEstimate: false,
      buyMode: "by_amount",
      restockWeeks: null,
      walmartName: null,
      walmartUrl: null,
      notes: null,
      aisle: "meat_seafood",
    });
    const after = (await catalog()).foods.get(breast.id)!;
    expect(after.packagePriceCents).toBe(1097);
    expect(after.priceIsEstimate).toBe(false);
    const history = await menu.priceHistory(breast.id);
    expect(history[0]).toMatchObject({ priceCents: 1097, source: "manual" });
  });

  it("a new guest gets portions copied from the biggest plate, marked for review", async () => {
    const c = await catalog();
    const id = await menu.saveEater(householdId, c, { id: null, kind: "guest", userId: null, name: "Aunt May", isActive: true, slots: ["dinner"], kcalTarget: null, proteinTargetG: null }, new Map());
    const portions = await db.select().from(schema.coreMealPortions).where(eq(schema.coreMealPortions.eaterId, id));
    expect(portions.length).toBeGreaterThan(10);
    expect(portions.every((p) => p.needsReview)).toBe(true);
  });

  it("saving a week as a template and starting over", async () => {
    const week = (await getWeekRow(householdId, "2026-11-16"))!;
    const templateId = await weeks.saveWeekAsTemplate(householdId, week, "Guests week", false);
    const c = await catalog();
    expect(c.settings.rotation.at(-1)).toBe(templateId);
    await weeks.deleteWeek(week);
    expect(await getWeekRow(householdId, "2026-11-16")).toBeNull();
    // Its list stays.
    expect(await lists.getList(householdId, listId)).not.toBeNull();
    const again = await weeks.startWeek(householdId, gabriel, "2026-11-16", { templateId });
    const meals = await weekMeals(again);
    const mon = meals.find((m) => m.day === "2026-11-16" && m.slot === "dinner")!;
    expect(meals.find((m) => m.day === "2026-11-17" && m.slot === "lunch")!.leftoverOf).toBe(mon.id);
  });

  it("task check-offs are shared per week", async () => {
    const week = (await getWeekRow(householdId, weekStart))!;
    await weeks.checkTask(week, "2026-11-08:freeze", true, anna);
    await weeks.checkTask(week, "2026-11-08:freeze", true, gabriel);
    let checks = await weeks.taskChecks([week.id]);
    expect(checks.get(`${week.id}|2026-11-08:freeze`)?.checkedBy).toBe(anna);
    await weeks.checkTask(week, "2026-11-08:freeze", false, gabriel);
    checks = await weeks.taskChecks([week.id]);
    expect(checks.size).toBe(0);
  });
});
