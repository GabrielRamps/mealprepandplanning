import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { atomic, getDb, schema } from "@/lib/db";
import type { Aisle } from "@/lib/enums";
import { guessAisle } from "@/lib/grocery/aisles";
import { type BuildRecipe, type BuildRequest, buildList, type ItemSource } from "@/lib/grocery/build";
import { isUuid } from "@/lib/library-filters";
import { canonicalName } from "@/lib/recipe-draft";
import { isUnitCode, type UnitCode } from "@/lib/units";

const { groceryLists, groceryListRecipes, groceryItems, recipes, recipeIngredients, ingredients, households } = schema;

export type ListItem = {
  id: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: UnitCode | null;
  aisle: Aisle;
  isPantry: boolean;
  isManual: boolean;
  isChecked: boolean;
  checkedBy: string | null;
  sources: ItemSource[];
  updatedAt: string; // ISO; newer wins when polling
};

type ItemRow = typeof groceryItems.$inferSelect;

function toItem(row: ItemRow): ListItem {
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    name: row.name,
    quantity: row.quantity,
    unit: isUnitCode(row.unit) ? row.unit : null,
    aisle: row.aisle,
    isPantry: row.isPantry,
    isManual: row.isManual,
    isChecked: row.isChecked,
    checkedBy: row.checkedBy,
    sources: row.sources as ItemSource[],
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Building

/** Recipes in this household (not deleted) with what buildList needs. */
async function recipesForBuild(householdId: string, recipeIds: string[]): Promise<Map<string, BuildRecipe>> {
  const db = getDb();
  const ids = [...new Set(recipeIds)].filter(isUuid);
  if (ids.length === 0) return new Map();
  const [recipeRows, ingredientRows] = await Promise.all([
    db
      .select({ id: recipes.id, title: recipes.title, servings: recipes.servings })
      .from(recipes)
      .where(and(eq(recipes.householdId, householdId), inArray(recipes.id, ids), isNull(recipes.deletedAt))),
    db
      .select({
        recipeId: recipeIngredients.recipeId,
        ingredientId: recipeIngredients.ingredientId,
        name: recipeIngredients.name,
        quantity: recipeIngredients.quantity,
        quantityMax: recipeIngredients.quantityMax,
        unit: recipeIngredients.unit,
        rawText: recipeIngredients.rawText,
        isOptional: recipeIngredients.isOptional,
        aisle: ingredients.aisle,
        isPantryStaple: ingredients.isPantryStaple,
      })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
      .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
      .where(and(eq(recipes.householdId, householdId), inArray(recipeIngredients.recipeId, ids)))
      .orderBy(asc(recipeIngredients.position)),
  ]);

  const out = new Map<string, BuildRecipe>(recipeRows.map((r) => [r.id, { ...r, ingredients: [] }]));
  for (const row of ingredientRows) {
    out.get(row.recipeId)?.ingredients.push({
      ingredientId: row.ingredientId,
      name: row.name,
      quantity: row.quantity,
      quantityMax: row.quantityMax,
      unit: isUnitCode(row.unit) ? row.unit : null,
      rawText: row.rawText,
      isOptional: row.isOptional,
      // Ingredients saved before aisle guessing existed sit in "other".
      aisle: row.aisle && row.aisle !== "other" ? row.aisle : guessAisle(row.name),
      isPantryStaple: row.isPantryStaple ?? false,
    });
  }
  return out;
}

export class ListBuildError extends Error {}

/** createListFromRecipes / createListFromPlan (PRD 9.2): build, then save list, sources and items together. */
export async function createList(input: {
  householdId: string;
  userId: string;
  name: string;
  picks: { recipeId: string; servings: number }[];
  mealPlanId?: string | null;
}): Promise<string> {
  const found = await recipesForBuild(
    input.householdId,
    input.picks.map((p) => p.recipeId),
  );
  const requests: BuildRequest[] = [];
  for (const p of input.picks) {
    const recipe = found.get(p.recipeId);
    if (!recipe) throw new ListBuildError("One of those recipes is no longer in your library.");
    requests.push({ recipe, servings: p.servings });
  }
  const items = buildList(requests);

  const servingsByRecipe = new Map<string, number>();
  for (const p of input.picks) servingsByRecipe.set(p.recipeId, (servingsByRecipe.get(p.recipeId) ?? 0) + p.servings);

  const listId = crypto.randomUUID();
  await atomic((q) => [
    q.insert(groceryLists).values({
      id: listId,
      householdId: input.householdId,
      name: input.name,
      mealPlanId: input.mealPlanId ?? null,
      createdBy: input.userId,
    }),
    ...(servingsByRecipe.size
      ? [
          q
            .insert(groceryListRecipes)
            .values([...servingsByRecipe].map(([recipeId, servings]) => ({ listId, recipeId, servings }))),
        ]
      : []),
    ...(items.length
      ? [
          q.insert(groceryItems).values(
            items.map((i, position) => ({
              listId,
              ingredientId: i.ingredientId,
              mergeKey: i.mergeKey,
              name: i.name,
              quantity: i.quantity,
              unit: i.unit,
              aisle: i.aisle,
              isPantry: i.isPantry,
              sources: i.sources,
              position,
            })),
          ),
        ]
      : []),
  ]);
  return listId;
}

// ---------------------------------------------------------------------------
// Reads

export type ListSummary = {
  id: string;
  name: string;
  status: "active" | "completed";
  createdAt: Date;
  total: number;
  checked: number;
};

export async function listLists(householdId: string): Promise<ListSummary[]> {
  const rows = await getDb()
    .select({
      id: groceryLists.id,
      name: groceryLists.name,
      status: groceryLists.status,
      createdAt: groceryLists.createdAt,
      total: sql<number>`(select count(*) from ${groceryItems} gi where gi.list_id = ${groceryLists.id})`.mapWith(Number),
      checked: sql<number>`(select count(*) from ${groceryItems} gi where gi.list_id = ${groceryLists.id} and gi.is_checked)`.mapWith(Number),
    })
    .from(groceryLists)
    .where(eq(groceryLists.householdId, householdId))
    .orderBy(asc(sql`${groceryLists.status} = 'completed'`), desc(groceryLists.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r, status: r.status === "completed" ? "completed" : "active" }));
}

export type ListDetail = {
  id: string;
  name: string;
  status: "active" | "completed";
  mealPlanId: string | null;
  aisleOrder: Aisle[];
  items: ListItem[];
};

/** A list in this household with its items, or null (also for bad ids). */
export async function getList(householdId: string, listId: string): Promise<ListDetail | null> {
  if (!isUuid(listId)) return null;
  const db = getDb();
  const [[list], itemRows] = await Promise.all([
    db
      .select({
        id: groceryLists.id,
        name: groceryLists.name,
        status: groceryLists.status,
        mealPlanId: groceryLists.mealPlanId,
        aisleOrder: households.aisleOrder,
      })
      .from(groceryLists)
      .innerJoin(households, eq(households.id, groceryLists.householdId))
      .where(and(eq(groceryLists.id, listId), eq(groceryLists.householdId, householdId)))
      .limit(1),
    db.select().from(groceryItems).where(eq(groceryItems.listId, listId)).orderBy(asc(groceryItems.position)),
  ]);
  if (!list) return null;
  return {
    ...list,
    status: list.status === "completed" ? "completed" : "active",
    items: itemRows.map(toItem),
  };
}

export async function listInHousehold(householdId: string, listId: string): Promise<boolean> {
  if (!isUuid(listId)) return false;
  const [row] = await getDb()
    .select({ id: groceryLists.id })
    .from(groceryLists)
    .where(and(eq(groceryLists.id, listId), eq(groceryLists.householdId, householdId)))
    .limit(1);
  return Boolean(row);
}

/** Polling (PRD 9.1): items changed since a time, plus every id so the client can drop deleted ones. */
export async function itemsSince(listId: string, since: Date | null): Promise<{ items: ListItem[]; ids: string[] }> {
  const db = getDb();
  const [changed, all] = await Promise.all([
    db
      .select()
      .from(groceryItems)
      .where(since ? and(eq(groceryItems.listId, listId), gt(groceryItems.updatedAt, since)) : eq(groceryItems.listId, listId)),
    db.select({ id: groceryItems.id }).from(groceryItems).where(eq(groceryItems.listId, listId)),
  ]);
  return { items: changed.map(toItem), ids: all.map((r) => r.id) };
}

// ---------------------------------------------------------------------------
// Item writes. Callers check the list belongs to the household first; every
// write also filters by list id so an item from another list can't be touched.

export async function setItemChecked(listId: string, itemId: string, checked: boolean, userId: string): Promise<ListItem | null> {
  const [row] = await getDb()
    .update(groceryItems)
    .set({
      isChecked: checked,
      checkedBy: checked ? userId : null,
      checkedAt: checked ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(groceryItems.id, itemId), eq(groceryItems.listId, listId)))
    .returning();
  return row ? toItem(row) : null;
}

/** A manual item takes the aisle and pantry flag of a matching household ingredient, else a guess. */
export async function addManualItem(
  householdId: string,
  listId: string,
  input: { name: string; quantity: number | null; unit: UnitCode | null; aisle: Aisle | null },
): Promise<ListItem> {
  const db = getDb();
  const [known] = await db
    .select({ id: ingredients.id, aisle: ingredients.aisle, isPantryStaple: ingredients.isPantryStaple })
    .from(ingredients)
    .where(and(eq(ingredients.householdId, householdId), eq(ingredients.name, canonicalName(input.name))))
    .limit(1);
  const [row] = await db
    .insert(groceryItems)
    .values({
      listId,
      ingredientId: known?.id ?? null,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      aisle: input.aisle ?? (known && known.aisle !== "other" ? known.aisle : guessAisle(input.name)),
      isPantry: known?.isPantryStaple ?? false,
      isManual: true,
      position: 10_000,
    })
    .returning();
  return toItem(row);
}

export type ItemPatch = {
  name?: string;
  quantity?: number | null;
  unit?: UnitCode | null;
  aisle?: Aisle;
  isPantry?: boolean;
};

/** Edits an item. A new aisle or pantry flag is also saved on the ingredient, so later lists remember it (F2). */
export async function updateItem(householdId: string, listId: string, itemId: string, patch: ItemPatch): Promise<ListItem | null> {
  const db = getDb();
  const [row] = await db
    .update(groceryItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(groceryItems.id, itemId), eq(groceryItems.listId, listId)))
    .returning();
  if (!row) return null;
  if (row.ingredientId && (patch.aisle !== undefined || patch.isPantry !== undefined)) {
    await db
      .update(ingredients)
      .set({
        ...(patch.aisle !== undefined ? { aisle: patch.aisle } : {}),
        ...(patch.isPantry !== undefined ? { isPantryStaple: patch.isPantry } : {}),
      })
      .where(and(eq(ingredients.id, row.ingredientId), eq(ingredients.householdId, householdId)));
  }
  return toItem(row);
}

export async function deleteItem(listId: string, itemId: string): Promise<void> {
  await getDb()
    .delete(groceryItems)
    .where(and(eq(groceryItems.id, itemId), eq(groceryItems.listId, listId)));
}

export async function setListStatus(householdId: string, listId: string, status: "active" | "completed"): Promise<void> {
  await getDb()
    .update(groceryLists)
    .set({ status, completedAt: status === "completed" ? new Date() : null })
    .where(and(eq(groceryLists.id, listId), eq(groceryLists.householdId, householdId)));
}
