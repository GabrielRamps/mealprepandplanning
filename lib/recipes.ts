import "server-only";
import { and, asc, desc, eq, gte, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { atomic, type Database, getDb, schema, type Statement } from "@/lib/db";
import type { Aisle, RecipeSource, RecipeStatus } from "@/lib/enums";
import { guessAisle } from "@/lib/grocery/aisles";
import { isUuid, type LibraryFilters } from "@/lib/library-filters";
import { coverUrl } from "@/lib/photos";
import { ingredientText } from "@/lib/quantity";
import { canonicalName, type RecipeDraft, uniqueTags } from "@/lib/recipe-draft";
import { isUnitCode, type UnitCode } from "@/lib/units";

const { recipes, recipeIngredients, recipeTags, recipeUserPrefs, tags, ingredients, householdMembers } = schema;

// ---------------------------------------------------------------------------
// Reads. Every query is scoped to the caller's household (PRD 3).

export type RecipeCard = {
  id: string;
  title: string;
  coverUrl: string | null;
  totalMinutes: number | null;
  myRating: number | null;
  othersRating: number | null; // average of the other members' ratings
  isFavorite: boolean;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listRecipes(householdId: string, userId: string, f: LibraryFilters): Promise<RecipeCard[]> {
  const mine = alias(recipeUserPrefs, "mine");
  const othersRating = sql<number | null>`(
    select avg(p.rating) from ${recipeUserPrefs} p
    where p.recipe_id = ${recipes.id} and p.user_id <> ${userId} and p.rating is not null
  )`.mapWith(Number);

  const where: (SQL | undefined)[] = [
    eq(recipes.householdId, householdId),
    isNull(recipes.deletedAt),
    eq(recipes.status, f.status),
  ];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    where.push(
      or(
        ilike(recipes.title, like),
        sql`exists (select 1 from ${recipeTags} rt join ${tags} t on t.id = rt.tag_id
                    where rt.recipe_id = ${recipes.id} and t.name ilike ${like})`,
        sql`exists (select 1 from ${recipeIngredients} ri
                    where ri.recipe_id = ${recipes.id} and ri.name ilike ${like})`,
      ),
    );
  }
  if (f.tag) {
    where.push(sql`exists (select 1 from ${recipeTags} rt where rt.recipe_id = ${recipes.id} and rt.tag_id = ${f.tag})`);
  }
  if (f.favorites) where.push(eq(mine.isFavorite, true));
  if (f.minRating) {
    where.push(
      f.ratedBy === "me"
        ? gte(mine.rating, f.minRating)
        : sql`exists (select 1 from ${recipeUserPrefs} p
                      where p.recipe_id = ${recipes.id} and p.user_id <> ${userId} and p.rating >= ${f.minRating})`,
    );
  }
  if (f.source) where.push(eq(recipes.sourceType, f.source));

  const orderBy: SQL[] = {
    newest: [desc(recipes.createdAt)],
    title: [asc(sql`lower(${recipes.title})`), desc(recipes.createdAt)],
    rating: [
      sql`(select avg(p.rating) from ${recipeUserPrefs} p where p.recipe_id = ${recipes.id}) desc nulls last`,
      desc(recipes.createdAt),
    ],
    planned: [
      sql`(select max(e.day) from ${schema.mealPlanEntries} e where e.recipe_id = ${recipes.id}) desc nulls last`,
      desc(recipes.createdAt),
    ],
  }[f.sort];

  const rows = await getDb()
    .select({
      id: recipes.id,
      title: recipes.title,
      coverImageKey: recipes.coverImageKey,
      prepMinutes: recipes.prepMinutes,
      cookMinutes: recipes.cookMinutes,
      myRating: mine.rating,
      isFavorite: mine.isFavorite,
      othersRating,
    })
    .from(recipes)
    .leftJoin(mine, and(eq(mine.recipeId, recipes.id), eq(mine.userId, userId)))
    .where(and(...where))
    .orderBy(...orderBy)
    .limit(300);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    coverUrl: coverUrl(r.coverImageKey),
    totalMinutes: r.prepMinutes === null && r.cookMinutes === null ? null : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0),
    myRating: r.myRating,
    othersRating: r.othersRating,
    isFavorite: r.isFavorite ?? false,
  }));
}

/** Active recipes for pickers (new list, planner): title order. */
export async function pickableRecipes(
  householdId: string,
): Promise<{ id: string; title: string; servings: number; coverUrl: string | null }[]> {
  const rows = await getDb()
    .select({ id: recipes.id, title: recipes.title, servings: recipes.servings, coverImageKey: recipes.coverImageKey })
    .from(recipes)
    .where(and(eq(recipes.householdId, householdId), isNull(recipes.deletedAt), eq(recipes.status, "active")))
    .orderBy(asc(sql`lower(${recipes.title})`))
    .limit(500);
  return rows.map(({ coverImageKey, ...r }) => ({ ...r, coverUrl: coverUrl(coverImageKey) }));
}

export async function listTags(householdId: string): Promise<{ id: string; name: string }[]> {
  return getDb()
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.householdId, householdId))
    .orderBy(asc(sql`lower(${tags.name})`));
}

export type RecipeIngredientRow = {
  id: string;
  section: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: UnitCode | null;
  name: string;
  prepNote: string | null;
  isOptional: boolean;
};

export type MemberPrefs = { userId: string; displayName: string; rating: number | null; isFavorite: boolean };

export type RecipeDetail = {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  sourceType: RecipeSource;
  sourceUrl: string | null;
  creatorName: string | null;
  creatorHandle: string | null;
  coverImageKey: string | null;
  coverUrl: string | null;
  steps: { section: string | null; text: string }[];
  notes: string | null;
  status: RecipeStatus;
  dislikedReason: string | null;
  ingredients: RecipeIngredientRow[];
  tags: string[];
  prefs: MemberPrefs[]; // one per household member
};

/** A recipe in this household, or null (also for bad ids and deleted recipes). */
export async function getRecipe(householdId: string, recipeId: string): Promise<RecipeDetail | null> {
  if (!isUuid(recipeId)) return null;
  const db = getDb();
  const [[recipe], ingredientRows, tagRows, prefRows] = await Promise.all([
    db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId), isNull(recipes.deletedAt)))
      .limit(1),
    db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId))
      .orderBy(asc(recipeIngredients.position)),
    db
      .select({ name: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(tags.id, recipeTags.tagId))
      .where(eq(recipeTags.recipeId, recipeId))
      .orderBy(asc(sql`lower(${tags.name})`)),
    db
      .select({
        userId: householdMembers.userId,
        displayName: householdMembers.displayName,
        rating: recipeUserPrefs.rating,
        isFavorite: recipeUserPrefs.isFavorite,
      })
      .from(householdMembers)
      .leftJoin(
        recipeUserPrefs,
        and(eq(recipeUserPrefs.userId, householdMembers.userId), eq(recipeUserPrefs.recipeId, recipeId)),
      )
      .where(eq(householdMembers.householdId, householdId))
      .orderBy(asc(householdMembers.joinedAt)),
  ]);
  if (!recipe) return null;

  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    sourceType: recipe.sourceType,
    sourceUrl: recipe.sourceUrl,
    creatorName: recipe.creatorName,
    creatorHandle: recipe.creatorHandle,
    coverImageKey: recipe.coverImageKey,
    coverUrl: coverUrl(recipe.coverImageKey),
    steps: recipe.steps,
    notes: recipe.notes,
    status: recipe.status,
    dislikedReason: recipe.dislikedReason,
    ingredients: ingredientRows.map((i) => ({
      id: i.id,
      section: i.section,
      quantity: i.quantity,
      quantityMax: i.quantityMax,
      unit: isUnitCode(i.unit) ? i.unit : null,
      name: i.name,
      prepNote: i.prepNote,
      isOptional: i.isOptional,
    })),
    tags: tagRows.map((t) => t.name),
    prefs: prefRows.map((p) => ({ ...p, isFavorite: p.isFavorite ?? false })),
  };
}

/** True if the recipe exists, isn't deleted, and belongs to this household. */
export async function recipeInHousehold(householdId: string, recipeId: string): Promise<boolean> {
  if (!isUuid(recipeId)) return false;
  const [row] = await getDb()
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId), isNull(recipes.deletedAt)))
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Writes.

function recipeColumns(draft: RecipeDraft, sourceUrl: string | null) {
  return {
    title: draft.title,
    description: draft.description,
    servings: draft.servings,
    prepMinutes: draft.prep_minutes,
    cookMinutes: draft.cook_minutes,
    steps: draft.steps.map((s) => ({ section: s.section, text: s.text })),
    notes: draft.notes,
    sourceUrl,
    creatorName: draft.creator_name,
    creatorHandle: draft.creator_handle,
  };
}

/** Canonical ingredients (one per food per household), then this recipe's rows linked to them. */
function ingredientStatements(q: Database, householdId: string, recipeId: string, draft: RecipeDraft): Statement[] {
  if (draft.ingredients.length === 0) return [];
  const canonical = new Map<string, Aisle>();
  for (const i of draft.ingredients) {
    const name = canonicalName(i.name);
    if (!canonical.has(name)) canonical.set(name, i.aisle ?? guessAisle(name));
  }
  return [
    q
      .insert(ingredients)
      .values([...canonical].map(([name, aisle]) => ({ householdId, name, aisle })))
      .onConflictDoNothing({ target: [ingredients.householdId, ingredients.name] }),
    q.insert(recipeIngredients).values(
      draft.ingredients.map((i, position) => {
        const name = canonicalName(i.name);
        return {
          recipeId,
          position,
          section: i.section,
          rawText:
            i.raw_text ||
            ingredientText({
              quantity: i.quantity,
              quantityMax: i.quantity_max,
              unit: i.unit,
              name,
              prepNote: i.prep_note,
            }),
          quantity: i.quantity,
          quantityMax: i.quantity_max,
          unit: i.unit,
          name,
          prepNote: i.prep_note,
          isOptional: i.is_optional,
          ingredientId: sql`(select ${ingredients.id} from ${ingredients}
                             where ${ingredients.householdId} = ${householdId} and ${ingredients.name} = ${name})`,
        };
      }),
    ),
  ];
}

/** Household tags, created inline and unique ignoring case (PRD B6), then this recipe's links. */
function tagStatements(q: Database, householdId: string, recipeId: string, tagNames: string[]): Statement[] {
  const names = uniqueTags(tagNames);
  if (names.length === 0) return [];
  return [
    q
      .insert(tags)
      .values(names.map((name) => ({ householdId, name })))
      .onConflictDoNothing(),
    q.insert(recipeTags).values(
      names.map((name) => ({
        recipeId,
        tagId: sql`(select ${tags.id} from ${tags}
                    where ${tags.householdId} = ${householdId} and lower(${tags.name}) = lower(${name}))`,
      })),
    ),
  ];
}

export async function createRecipe(input: {
  householdId: string;
  userId: string;
  draft: RecipeDraft;
  sourceUrl: string | null;
  sourceType?: RecipeSource;
  coverImageKey: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const { householdId, draft } = input;
  await atomic((q) => [
    q.insert(recipes).values({
      id,
      householdId,
      createdBy: input.userId,
      sourceType: input.sourceType ?? "manual",
      coverImageKey: input.coverImageKey,
      ...recipeColumns(draft, input.sourceUrl),
    }),
    ...ingredientStatements(q, householdId, id, draft),
    ...tagStatements(q, householdId, id, draft.tags),
  ]);
  return id;
}

/** Replaces a recipe's fields, ingredients and tags. `coverImageKey` undefined keeps the cover. */
export async function updateRecipe(input: {
  householdId: string;
  recipeId: string;
  draft: RecipeDraft;
  sourceUrl: string | null;
  coverImageKey?: string | null;
}): Promise<void> {
  const { householdId, recipeId, draft } = input;
  await atomic((q) => [
    q
      .update(recipes)
      .set({
        ...recipeColumns(draft, input.sourceUrl),
        ...(input.coverImageKey !== undefined ? { coverImageKey: input.coverImageKey } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId))),
    q.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)),
    ...ingredientStatements(q, householdId, recipeId, draft),
    q.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId)),
    ...tagStatements(q, householdId, recipeId, draft.tags),
  ]);
}

export async function setRating(recipeId: string, userId: string, rating: number | null): Promise<void> {
  await getDb()
    .insert(recipeUserPrefs)
    .values({ recipeId, userId, rating })
    .onConflictDoUpdate({
      target: [recipeUserPrefs.recipeId, recipeUserPrefs.userId],
      set: { rating, updatedAt: new Date() },
    });
}

export async function setFavorite(recipeId: string, userId: string, isFavorite: boolean): Promise<void> {
  await getDb()
    .insert(recipeUserPrefs)
    .values({ recipeId, userId, isFavorite })
    .onConflictDoUpdate({
      target: [recipeUserPrefs.recipeId, recipeUserPrefs.userId],
      set: { isFavorite, updatedAt: new Date() },
    });
}

export async function setStatus(input: {
  householdId: string;
  recipeId: string;
  status: RecipeStatus;
  reason: string | null;
  userId: string;
}): Promise<void> {
  const disliked = input.status === "disliked";
  await getDb()
    .update(recipes)
    .set({
      status: input.status,
      dislikedReason: disliked ? input.reason : null,
      dislikedBy: disliked ? input.userId : null,
      updatedAt: new Date(),
    })
    .where(and(eq(recipes.id, input.recipeId), eq(recipes.householdId, input.householdId)));
}

/** Soft delete (PRD B5): the row stays, with deleted_at set. */
export async function softDeleteRecipe(householdId: string, recipeId: string): Promise<void> {
  await getDb()
    .update(recipes)
    .set({ deletedAt: new Date() })
    .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)));
}
