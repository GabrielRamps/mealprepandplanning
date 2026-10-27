import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { atomic, getDb, schema } from "@/lib/db";
import type { Aisle } from "@/lib/enums";
import { createList, type ExtraItem } from "@/lib/grocery/lists";
import { isUuid } from "@/lib/library-filters";
import { isUnitCode, type UnitCode } from "@/lib/units";

// Saved lists back the Lists → Reorder view: a list's recipes, servings and
// hand-added items, kept so the same meals can be shopped for again in one tap.

const { savedLists, savedListRecipes, savedListItems, groceryLists, groceryListRecipes, groceryItems, recipes } = schema;

/** A message for the person, e.g. nothing to save. */
export class SavedListError extends Error {}

export type SavedRecipe = { recipeId: string; title: string; servings: number; available: boolean };
export type SavedItem = { name: string; quantity: number | null; unit: UnitCode | null; aisle: Aisle; isPantry: boolean };

export type SavedList = {
  id: string;
  name: string;
  createdAt: Date;
  lastOrderedAt: Date | null;
  recipes: SavedRecipe[];
  items: SavedItem[];
};

/** Saved lists in this household, most recently ordered (or saved) first. */
export async function listSavedLists(householdId: string): Promise<SavedList[]> {
  return loadSaved(householdId, null);
}

export async function getSavedList(householdId: string, savedListId: string): Promise<SavedList | null> {
  if (!isUuid(savedListId)) return null;
  const [saved] = await loadSaved(householdId, savedListId);
  return saved ?? null;
}

async function loadSaved(householdId: string, savedListId: string | null): Promise<SavedList[]> {
  const db = getDb();
  const rows = await db
    .select({ id: savedLists.id, name: savedLists.name, createdAt: savedLists.createdAt, lastOrderedAt: savedLists.lastOrderedAt })
    .from(savedLists)
    .where(and(eq(savedLists.householdId, householdId), savedListId ? eq(savedLists.id, savedListId) : undefined))
    .orderBy(desc(sql`coalesce(${savedLists.lastOrderedAt}, ${savedLists.createdAt})`), desc(savedLists.createdAt))
    .limit(100);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [recipeRows, itemRows] = await Promise.all([
    db
      .select({
        savedListId: savedListRecipes.savedListId,
        recipeId: savedListRecipes.recipeId,
        servings: savedListRecipes.servings,
        title: recipes.title,
        // Deleted, archived or disliked recipes are skipped on reorder, as in the planner.
        available: sql<boolean>`(${recipes.deletedAt} is null and ${recipes.status} = 'active')`,
      })
      .from(savedListRecipes)
      .innerJoin(recipes, eq(recipes.id, savedListRecipes.recipeId))
      .where(and(inArray(savedListRecipes.savedListId, ids), eq(recipes.householdId, householdId)))
      .orderBy(asc(savedListRecipes.position), asc(recipes.title)),
    db
      .select()
      .from(savedListItems)
      .where(inArray(savedListItems.savedListId, ids))
      .orderBy(asc(savedListItems.position)),
  ]);

  const byId = new Map<string, SavedList>(rows.map((r) => [r.id, { ...r, recipes: [], items: [] }]));
  for (const r of recipeRows) {
    byId.get(r.savedListId)?.recipes.push({ recipeId: r.recipeId, title: r.title, servings: r.servings, available: r.available });
  }
  for (const i of itemRows) {
    byId.get(i.savedListId)?.items.push({
      name: i.name,
      quantity: i.quantity,
      unit: isUnitCode(i.unit) ? i.unit : null,
      aisle: i.aisle,
      isPantry: i.isPantry,
    });
  }
  return [...byId.values()];
}

async function savedListInHousehold(householdId: string, savedListId: string): Promise<boolean> {
  if (!isUuid(savedListId)) return false;
  const [row] = await getDb()
    .select({ id: savedLists.id })
    .from(savedLists)
    .where(and(eq(savedLists.id, savedListId), eq(savedLists.householdId, householdId)))
    .limit(1);
  return Boolean(row);
}

/** What a reorder adds: recipes still in the library with their servings, and every hand-added item. */
export function reorderContents(saved: Pick<SavedList, "recipes" | "items">): {
  picks: { recipeId: string; servings: number }[];
  extraItems: ExtraItem[];
  skipped: string[];
} {
  return {
    picks: saved.recipes.filter((r) => r.available).map((r) => ({ recipeId: r.recipeId, servings: r.servings })),
    extraItems: saved.items.map((i) => ({ ...i })),
    skipped: saved.recipes.filter((r) => !r.available).map((r) => r.title),
  };
}

/**
 * Saves a list's recipes, servings and hand-added items under a name. With
 * `update`, the saved list this one is linked to (saved from it, or reordered
 * from it) is replaced instead of adding another; without a link it saves new.
 * Returns the saved list's id.
 */
export async function saveListAs(input: {
  householdId: string;
  userId: string;
  listId: string;
  name: string;
  update: boolean;
}): Promise<string> {
  const db = getDb();
  const [list] = await db
    .select({ id: groceryLists.id, savedListId: groceryLists.savedListId })
    .from(groceryLists)
    .where(and(eq(groceryLists.id, input.listId), eq(groceryLists.householdId, input.householdId)))
    .limit(1);
  if (!list) throw new SavedListError("That list was deleted.");

  const [recipeRows, itemRows] = await Promise.all([
    db
      .select({ recipeId: groceryListRecipes.recipeId, servings: groceryListRecipes.servings })
      .from(groceryListRecipes)
      .innerJoin(recipes, eq(recipes.id, groceryListRecipes.recipeId))
      .where(
        and(eq(groceryListRecipes.listId, list.id), eq(recipes.householdId, input.householdId), isNull(recipes.deletedAt)),
      )
      .orderBy(asc(sql`lower(${recipes.title})`)),
    db
      .select({
        name: groceryItems.name,
        quantity: groceryItems.quantity,
        unit: groceryItems.unit,
        aisle: groceryItems.aisle,
        isPantry: groceryItems.isPantry,
      })
      .from(groceryItems)
      .where(and(eq(groceryItems.listId, list.id), eq(groceryItems.isManual, true)))
      .orderBy(asc(groceryItems.position), asc(groceryItems.name)),
  ]);
  if (recipeRows.length === 0 && itemRows.length === 0) {
    throw new SavedListError("Nothing to save yet. Add recipes or items to the list first.");
  }

  const existing =
    input.update && list.savedListId && (await savedListInHousehold(input.householdId, list.savedListId))
      ? list.savedListId
      : null;
  const savedListId = existing ?? crypto.randomUUID();
  const now = new Date();

  await atomic((q) => [
    existing
      ? q.update(savedLists).set({ name: input.name, updatedAt: now }).where(eq(savedLists.id, savedListId))
      : q.insert(savedLists).values({ id: savedListId, householdId: input.householdId, name: input.name, createdBy: input.userId }),
    ...(existing
      ? [
          q.delete(savedListRecipes).where(eq(savedListRecipes.savedListId, savedListId)),
          q.delete(savedListItems).where(eq(savedListItems.savedListId, savedListId)),
        ]
      : []),
    ...(recipeRows.length
      ? [q.insert(savedListRecipes).values(recipeRows.map((r, position) => ({ savedListId, ...r, position })))]
      : []),
    ...(itemRows.length
      ? [q.insert(savedListItems).values(itemRows.map((i, position) => ({ savedListId, ...i, position })))]
      : []),
    q
      .update(groceryLists)
      .set({ savedListId })
      .where(and(eq(groceryLists.id, list.id), eq(groceryLists.householdId, input.householdId))),
  ]);
  return savedListId;
}

/** Reorder: a new active list from a saved list, linked back to it. Returns the new list's id. */
export async function reorderSavedList(input: { householdId: string; userId: string; savedListId: string }): Promise<string> {
  const saved = await getSavedList(input.householdId, input.savedListId);
  if (!saved) throw new SavedListError("That saved list was deleted.");
  const { picks, extraItems } = reorderContents(saved);
  if (picks.length === 0 && extraItems.length === 0) {
    throw new SavedListError("None of these recipes are in your library anymore, so there's nothing to add.");
  }
  const listId = await createList({
    householdId: input.householdId,
    userId: input.userId,
    name: saved.name,
    picks,
    savedListId: saved.id,
    extraItems,
  });
  await getDb()
    .update(savedLists)
    .set({ lastOrderedAt: new Date() })
    .where(and(eq(savedLists.id, saved.id), eq(savedLists.householdId, input.householdId)));
  return listId;
}

export async function renameSavedList(householdId: string, savedListId: string, name: string): Promise<boolean> {
  if (!isUuid(savedListId)) return false;
  const rows = await getDb()
    .update(savedLists)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(savedLists.id, savedListId), eq(savedLists.householdId, householdId)))
    .returning({ id: savedLists.id });
  return rows.length > 0;
}

/** Deletes a saved list for good. Lists made from it stay; they just lose the link. */
export async function deleteSavedList(householdId: string, savedListId: string): Promise<boolean> {
  if (!isUuid(savedListId)) return false;
  const rows = await getDb()
    .delete(savedLists)
    .where(and(eq(savedLists.id, savedListId), eq(savedLists.householdId, householdId)))
    .returning({ id: savedLists.id });
  return rows.length > 0;
}
