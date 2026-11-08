import "server-only";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { atomic, getDb, schema } from "@/lib/db";
import { weekListName } from "@/lib/plan/week";
import { type Catalog, foodsByIngredient, type LoadedWeek } from "@/lib/prep/load";
import { type PrepItem, prepListItems } from "@/lib/prep/list-items";

// makePrepList / updatePrepList (PRD-prep P-8), following the insert pattern
// of createList and the update rules of PRD 8.4.

const { groceryLists, groceryListRecipes, groceryItems, prepWeeks } = schema;

function itemsFor(catalog: Catalog, loaded: LoadedWeek): PrepItem[] {
  return prepListItems(loaded.input, {
    shelf: (food) => {
      const rec = catalog.foods.get(food.id)!;
      return { ingredientId: rec.ingredientId, aisle: rec.aisle, isPantry: rec.isPantry };
    },
    extras: loaded.extras,
    recipes: loaded.buildRecipes,
    foodByIngredient: foodsByIngredient(catalog.foods),
  });
}

/** Recipe servings on the list, summed per recipe (as grocery_list_recipes keeps them). */
function recipeServings(loaded: LoadedWeek): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of loaded.input.weekMeals) {
    if (!m.recipeId || !loaded.buildRecipes.has(m.recipeId)) continue;
    out.set(m.recipeId, (out.get(m.recipeId) ?? 0) + (m.servings ?? loaded.buildRecipes.get(m.recipeId)!.servings));
  }
  return out;
}

const row = (listId: string, i: PrepItem, position: number) => ({
  listId,
  ingredientId: i.ingredientId,
  mergeKey: i.mergeKey,
  name: i.name,
  quantity: i.quantity,
  unit: i.unit,
  note: i.note,
  priceCents: i.priceCents,
  aisle: i.aisle,
  isPantry: i.isPantry,
  sources: i.sources,
  position,
});

/** "Prep · Week of Nov 9" */
export function prepListName(weekStart: string): string {
  return `Prep · ${weekListName(weekStart)}`;
}

export async function makePrepList(householdId: string, userId: string, catalog: Catalog, loaded: LoadedWeek): Promise<string> {
  const items = itemsFor(catalog, loaded);
  const servings = recipeServings(loaded);
  const listId = crypto.randomUUID();
  const now = new Date();
  await atomic((q) => [
    q.insert(groceryLists).values({
      id: listId,
      householdId,
      name: prepListName(loaded.week.weekStart),
      prepWeekId: loaded.week.id,
      createdBy: userId,
    }),
    ...(servings.size ? [q.insert(groceryListRecipes).values([...servings].map(([recipeId, s]) => ({ listId, recipeId, servings: s })))] : []),
    ...(items.length ? [q.insert(groceryItems).values(items.map((i, n) => row(listId, i, n)))] : []),
    q.update(prepWeeks).set({ listBuiltAt: now }).where(eq(prepWeeks.id, loaded.week.id)),
  ]);
  return listId;
}

/**
 * Rebuilds a Prep list: items whose merge_key is still needed keep their
 * check, items added by hand stay, everything else is replaced.
 */
export async function updatePrepList(catalog: Catalog, loaded: LoadedWeek, listId: string): Promise<void> {
  const built = itemsFor(catalog, loaded);
  const current = await getDb()
    .select({ id: groceryItems.id, mergeKey: groceryItems.mergeKey })
    .from(groceryItems)
    .where(and(eq(groceryItems.listId, listId), eq(groceryItems.isManual, false)));
  const existing = new Map(current.filter((i) => i.mergeKey).map((i) => [i.mergeKey!, i.id]));
  const keep = built.map((b) => b.mergeKey);
  const fresh = built.filter((b) => !existing.has(b.mergeKey));
  const servings = recipeServings(loaded);
  const now = new Date();

  await atomic((q) => [
    q
      .delete(groceryItems)
      .where(
        and(
          eq(groceryItems.listId, listId),
          eq(groceryItems.isManual, false),
          keep.length ? sql`(${groceryItems.mergeKey} is null or ${notInArray(groceryItems.mergeKey, keep)})` : undefined,
        ),
      ),
    ...built
      .filter((b) => existing.has(b.mergeKey))
      .map((b, n) => {
        const { listId: _l, position: _p, mergeKey: _k, ...patch } = row(listId, b, n);
        return q
          .update(groceryItems)
          .set({ ...patch, updatedAt: now })
          .where(and(eq(groceryItems.id, existing.get(b.mergeKey)!), eq(groceryItems.listId, listId)));
      }),
    ...(fresh.length ? [q.insert(groceryItems).values(fresh.map((b, n) => row(listId, b, current.length + n)))] : []),
    q.delete(groceryListRecipes).where(eq(groceryListRecipes.listId, listId)),
    ...(servings.size ? [q.insert(groceryListRecipes).values([...servings].map(([recipeId, s]) => ({ listId, recipeId, servings: s })))] : []),
    q.update(prepWeeks).set({ listBuiltAt: now }).where(eq(prepWeeks.id, loaded.week.id)),
  ]);
}

/** True when the week changed after its list was made. */
export function weekChangedSinceList(week: { updatedAt: Date; listBuiltAt: Date | null }): boolean {
  return week.listBuiltAt !== null && week.updatedAt.getTime() > week.listBuiltAt.getTime() + 1;
}

/** Prep weeks (in this household) of these lists, for the list screen's banner. */
export async function prepWeekForList(householdId: string, prepWeekId: string) {
  const [w] = await getDb()
    .select({ id: prepWeeks.id, weekStart: prepWeeks.weekStart, updatedAt: prepWeeks.updatedAt, listBuiltAt: prepWeeks.listBuiltAt })
    .from(prepWeeks)
    .where(and(eq(prepWeeks.id, prepWeekId), eq(prepWeeks.householdId, householdId)))
    .limit(1);
  return w ?? null;
}

