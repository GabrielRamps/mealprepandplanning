// Grocery lists against a real Postgres: delete, History, save for reorder,
// reorder, rename. Runs only with TEST_DATABASE_URL set to a throwaway
// database that has the migrations applied (never production), e.g.
//   TEST_DATABASE_URL=postgres://… DATABASE_DRIVER=neon-http npm test
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("grocery lists (database)", async () => {
  const { getDb, schema } = await import("@/lib/db");
  const lists = await import("./lists");
  const saved = await import("./saved");

  // Connect only once the suite runs; a skipped suite is still collected.
  let db!: ReturnType<typeof getDb>;
  const user = `test-user-${crypto.randomUUID()}`;
  const outsider = `test-user-${crypto.randomUUID()}`;
  const householdId = crypto.randomUUID();
  const otherHouseholdId = crypto.randomUUID();
  const tacos = crypto.randomUUID();
  const pasta = crypto.randomUUID();

  beforeAll(async () => {
    db = getDb();
    await db.insert(schema.households).values([
      { id: householdId, name: "Test household" },
      { id: otherHouseholdId, name: "Other household" },
    ]);
    await db.insert(schema.householdMembers).values([
      { householdId, userId: user, displayName: "Test Person", role: "owner" },
      { householdId: otherHouseholdId, userId: outsider, displayName: "Someone Else", role: "owner" },
    ]);
    await db.insert(schema.recipes).values([
      { id: tacos, householdId, title: "Chicken tacos", servings: 4, createdBy: user },
      { id: pasta, householdId, title: "Pasta bake", servings: 2, createdBy: user },
    ]);
    await db.insert(schema.recipeIngredients).values([
      { recipeId: tacos, position: 0, rawText: "1 lb chicken thighs", quantity: 1, unit: "lb", name: "chicken thighs" },
      { recipeId: tacos, position: 1, rawText: "8 tortillas", quantity: 8, unit: null, name: "tortilla" },
      { recipeId: pasta, position: 0, rawText: "1 lb penne", quantity: 1, unit: "lb", name: "penne" },
    ]);
  });

  afterAll(async () => {
    // Everything else goes with the households (on delete cascade).
    await db.delete(schema.households).where(inArray(schema.households.id, [householdId, otherHouseholdId]));
  });

  let firstListId = "";
  let savedId = "";
  let reorderedId = "";

  it("makes a list with a hand-added item, shown under Active", async () => {
    firstListId = await lists.createList({
      householdId,
      userId: user,
      name: "Week one",
      picks: [
        { recipeId: tacos, servings: 8 },
        { recipeId: pasta, servings: 2 },
      ],
    });
    await lists.addManualItem(householdId, firstListId, { name: "paper towels", quantity: 2, unit: null, aisle: "household" });

    const active = await lists.listLists(householdId, "active");
    expect(active.map((l) => l.id)).toEqual([firstListId]);
    expect(active[0]).toMatchObject({ name: "Week one", status: "active", total: 4, checked: 0, savedList: null });
    expect(await lists.listLists(householdId, "completed")).toEqual([]);
    expect(await lists.listCounts(householdId)).toEqual({ active: 1, history: 0, saved: 0 });
  });

  it("saves the list for reorder with its meals, servings and added items", async () => {
    savedId = await saved.saveListAs({ householdId, userId: user, listId: firstListId, name: "Taco week", update: false });

    const all = await saved.listSavedLists(householdId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: savedId, name: "Taco week", lastOrderedAt: null });
    expect(all[0].recipes).toEqual([
      { recipeId: tacos, title: "Chicken tacos", servings: 8, available: true },
      { recipeId: pasta, title: "Pasta bake", servings: 2, available: true },
    ]);
    expect(all[0].items).toEqual([{ name: "paper towels", quantity: 2, unit: null, aisle: "household", isPantry: false }]);

    const detail = await lists.getList(householdId, firstListId);
    expect(detail?.savedList).toEqual({ id: savedId, name: "Taco week" });
    expect((await lists.listLists(householdId, "active"))[0].savedList).toEqual({ id: savedId, name: "Taco week" });
    expect((await lists.listCounts(householdId)).saved).toBe(1);
  });

  it("won't save an empty list", async () => {
    const empty = await lists.createList({ householdId, userId: user, name: "Empty", picks: [] });
    await expect(saved.saveListAs({ householdId, userId: user, listId: empty, name: "Nothing", update: false })).rejects.toBeInstanceOf(
      saved.SavedListError,
    );
    expect(await lists.deleteList(householdId, empty)).toBe("active");
  });

  it("moves a done list to History, and back when reopened", async () => {
    await lists.setListStatus(householdId, firstListId, "completed");
    expect(await lists.listLists(householdId, "active")).toEqual([]);
    const history = await lists.listLists(householdId, "completed");
    expect(history.map((l) => l.id)).toEqual([firstListId]);
    expect(history[0].completedAt).toBeInstanceOf(Date);
    expect(await lists.listCounts(householdId)).toEqual({ active: 0, history: 1, saved: 1 });

    await lists.setListStatus(householdId, firstListId, "active");
    expect((await lists.listLists(householdId, "active")).map((l) => l.id)).toEqual([firstListId]);
    await lists.setListStatus(householdId, firstListId, "completed");
  });

  it("reorders a saved list into a new active list with the same meals and items", async () => {
    reorderedId = await saved.reorderSavedList({ householdId, userId: user, savedListId: savedId });
    expect(reorderedId).not.toBe(firstListId);

    const [original, copy] = await Promise.all([lists.getList(householdId, firstListId), lists.getList(householdId, reorderedId)]);
    expect(copy).toMatchObject({ name: "Taco week", status: "active", savedList: { id: savedId, name: "Taco week" } });
    const shape = (items: NonNullable<typeof copy>["items"]) =>
      items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, aisle: i.aisle, isManual: i.isManual })).sort((a, b) => a.name.localeCompare(b.name));
    expect(shape(copy!.items)).toEqual(shape(original!.items));
    expect(copy!.items.every((i) => !i.isChecked)).toBe(true);

    const servings = await db
      .select({ recipeId: schema.groceryListRecipes.recipeId, servings: schema.groceryListRecipes.servings })
      .from(schema.groceryListRecipes)
      .where(eq(schema.groceryListRecipes.listId, reorderedId));
    expect(Object.fromEntries(servings.map((s) => [s.recipeId, s.servings]))).toEqual({ [tacos]: 8, [pasta]: 2 });

    const [after] = await saved.listSavedLists(householdId);
    expect(after.lastOrderedAt).toBeInstanceOf(Date);
    expect(await lists.listCounts(householdId)).toEqual({ active: 1, history: 1, saved: 1 });
  });

  it("updates the linked saved list in place, or saves a separate one", async () => {
    await lists.addManualItem(householdId, reorderedId, { name: "milk", quantity: null, unit: null, aisle: null });
    const same = await saved.saveListAs({ householdId, userId: user, listId: reorderedId, name: "Taco week v2", update: true });
    expect(same).toBe(savedId);
    const [updated] = await saved.listSavedLists(householdId);
    expect(updated.name).toBe("Taco week v2");
    expect(updated.items.map((i) => i.name).sort()).toEqual(["milk", "paper towels"]);
    expect(updated.recipes).toHaveLength(2);

    const separate = await saved.saveListAs({ householdId, userId: user, listId: reorderedId, name: "Copy", update: false });
    expect(separate).not.toBe(savedId);
    expect(await saved.listSavedLists(householdId)).toHaveLength(2);
    // The list now points at the newest save.
    expect((await lists.getList(householdId, reorderedId))?.savedList?.id).toBe(separate);
    expect(await saved.deleteSavedList(householdId, separate)).toBe(true);
    expect((await lists.getList(householdId, reorderedId))?.savedList).toBeNull();
  });

  it("renames a saved list", async () => {
    expect(await saved.renameSavedList(householdId, savedId, "Taco Tuesday")).toBe(true);
    expect((await saved.getSavedList(householdId, savedId))?.name).toBe("Taco Tuesday");
  });

  it("skips recipes deleted since, and refuses when nothing is left", async () => {
    await db.update(schema.recipes).set({ deletedAt: new Date() }).where(eq(schema.recipes.id, pasta));
    const s = await saved.getSavedList(householdId, savedId);
    expect(s?.recipes.find((r) => r.recipeId === pasta)?.available).toBe(false);
    const listId = await saved.reorderSavedList({ householdId, userId: user, savedListId: savedId });
    const list = await lists.getList(householdId, listId);
    expect(list?.items.some((i) => i.name === "penne")).toBe(false);
    expect(list?.items.some((i) => i.name.includes("tortilla"))).toBe(true);
    await lists.deleteList(householdId, listId);

    // A saved list with only deleted recipes and no added items has nothing to order.
    const tacosOnly = await lists.createList({ householdId, userId: user, name: "Tacos only", picks: [{ recipeId: tacos, servings: 4 }] });
    const tacosSaved = await saved.saveListAs({ householdId, userId: user, listId: tacosOnly, name: "Tacos only", update: false });
    await db.update(schema.recipes).set({ deletedAt: new Date() }).where(eq(schema.recipes.id, tacos));
    await expect(saved.reorderSavedList({ householdId, userId: user, savedListId: tacosSaved })).rejects.toBeInstanceOf(
      saved.SavedListError,
    );
    await db.update(schema.recipes).set({ deletedAt: null }).where(inArray(schema.recipes.id, [tacos, pasta]));
    await saved.deleteSavedList(householdId, tacosSaved);
    await lists.deleteList(householdId, tacosOnly);
  });

  it("keeps other households out", async () => {
    expect(await lists.deleteList(otherHouseholdId, firstListId)).toBeNull();
    expect(await lists.getList(otherHouseholdId, firstListId)).toBeNull();
    expect(await saved.getSavedList(otherHouseholdId, savedId)).toBeNull();
    expect(await saved.renameSavedList(otherHouseholdId, savedId, "Mine now")).toBe(false);
    expect(await saved.deleteSavedList(otherHouseholdId, savedId)).toBe(false);
    await expect(saved.reorderSavedList({ householdId: otherHouseholdId, userId: outsider, savedListId: savedId })).rejects.toBeInstanceOf(
      saved.SavedListError,
    );
    await expect(
      saved.saveListAs({ householdId: otherHouseholdId, userId: outsider, listId: firstListId, name: "Stolen", update: false }),
    ).rejects.toBeInstanceOf(saved.SavedListError);
    expect(await saved.listSavedLists(otherHouseholdId)).toEqual([]);
    expect((await saved.getSavedList(householdId, savedId))?.name).toBe("Taco Tuesday");
  });

  it("deletes a list with its items for good, leaving its saved list", async () => {
    expect(await lists.deleteList(householdId, firstListId)).toBe("completed");
    expect(await lists.getList(householdId, firstListId)).toBeNull();
    const [items, recipesLeft] = await Promise.all([
      db.select().from(schema.groceryItems).where(eq(schema.groceryItems.listId, firstListId)),
      db.select().from(schema.groceryListRecipes).where(eq(schema.groceryListRecipes.listId, firstListId)),
    ]);
    expect(items).toEqual([]);
    expect(recipesLeft).toEqual([]);
    expect(await saved.getSavedList(householdId, savedId)).not.toBeNull();
    expect(await lists.deleteList(householdId, firstListId)).toBeNull(); // already gone
    expect(await lists.listCounts(householdId)).toEqual({ active: 1, history: 0, saved: 1 });
  });

  it("deletes a saved list for good; lists made from it stay", async () => {
    expect(await saved.deleteSavedList(householdId, savedId)).toBe(true);
    expect(await saved.listSavedLists(householdId)).toEqual([]);
    const [recipeRows, itemRows] = await Promise.all([
      db.select().from(schema.savedListRecipes).where(eq(schema.savedListRecipes.savedListId, savedId)),
      db.select().from(schema.savedListItems).where(eq(schema.savedListItems.savedListId, savedId)),
    ]);
    expect(recipeRows).toEqual([]);
    expect(itemRows).toEqual([]);
    const still = await lists.getList(householdId, reorderedId);
    expect(still).toMatchObject({ id: reorderedId, savedList: null });
    const [row] = await db
      .select({ savedListId: schema.groceryLists.savedListId })
      .from(schema.groceryLists)
      .where(and(eq(schema.groceryLists.id, reorderedId), eq(schema.groceryLists.householdId, householdId)));
    expect(row.savedListId).toBeNull();
  });
});
