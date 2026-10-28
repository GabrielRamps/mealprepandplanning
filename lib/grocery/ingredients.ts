import "server-only";
import { and, asc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { atomic, getDb, schema } from "@/lib/db";
import type { Aisle } from "@/lib/enums";

// Household settings for the store (PRD F2): the order aisles are walked in,
// and each ingredient's aisle and pantry-staple flag.

const { households, ingredients, recipeIngredients, recipes, groceryItems, groceryLists } = schema;

export const INGREDIENT_PAGE_SIZE = 100;

export async function getAisleOrder(householdId: string): Promise<Aisle[]> {
  const [row] = await getDb()
    .select({ aisleOrder: households.aisleOrder })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  return row?.aisleOrder ?? [];
}

/** Lists read the order when shown, so open lists regroup straight away. */
export async function setAisleOrder(householdId: string, order: Aisle[]): Promise<void> {
  await getDb().update(households).set({ aisleOrder: order }).where(eq(households.id, householdId));
}

export type IngredientSetting = {
  id: string;
  name: string;
  aisle: Aisle;
  isPantryStaple: boolean;
  recipeCount: number;
};

/** The household's ingredients by name; `q` matches anywhere in the name. */
export async function listIngredients(
  householdId: string,
  { q, pantryOnly }: { q?: string; pantryOnly?: boolean } = {},
): Promise<{ items: IngredientSetting[]; more: boolean }> {
  const term = q?.trim().toLowerCase();
  const conditions = [eq(ingredients.householdId, householdId)];
  if (term) conditions.push(ilike(ingredients.name, `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  if (pantryOnly) conditions.push(eq(ingredients.isPantryStaple, true));

  const recipeCount = sql<number>`count(distinct ${recipes.id})::int`;
  const rows = await getDb()
    .select({
      id: ingredients.id,
      name: ingredients.name,
      aisle: ingredients.aisle,
      isPantryStaple: ingredients.isPantryStaple,
      recipeCount,
    })
    .from(ingredients)
    .leftJoin(recipeIngredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .leftJoin(recipes, and(eq(recipes.id, recipeIngredients.recipeId), isNull(recipes.deletedAt)))
    .where(and(...conditions))
    .groupBy(ingredients.id)
    .orderBy(asc(ingredients.name))
    .limit(INGREDIENT_PAGE_SIZE + 1);
  return { items: rows.slice(0, INGREDIENT_PAGE_SIZE), more: rows.length > INGREDIENT_PAGE_SIZE };
}

export type IngredientPatch = { aisle?: Aisle; isPantryStaple?: boolean };

/**
 * Saves the ingredient and carries the change to its unchecked items on active
 * lists, the same as changing it from a list. Returns false if it isn't the
 * household's.
 */
export async function updateIngredient(householdId: string, ingredientId: string, patch: IngredientPatch): Promise<boolean> {
  const db = getDb();
  const [owned] = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, householdId)))
    .limit(1);
  if (!owned) return false;

  const itemPatch = {
    ...(patch.aisle !== undefined ? { aisle: patch.aisle } : {}),
    ...(patch.isPantryStaple !== undefined ? { isPantry: patch.isPantryStaple } : {}),
  };
  await atomic((q) => [
    q.update(ingredients).set(patch).where(eq(ingredients.id, ingredientId)),
    q
      .update(groceryItems)
      .set({ ...itemPatch, updatedAt: new Date() })
      .where(
        and(
          eq(groceryItems.ingredientId, ingredientId),
          eq(groceryItems.isChecked, false),
          inArray(
            groceryItems.listId,
            q
              .select({ id: groceryLists.id })
              .from(groceryLists)
              .where(and(eq(groceryLists.householdId, householdId), eq(groceryLists.status, "active"))),
          ),
        ),
      ),
  ]);
  return true;
}
