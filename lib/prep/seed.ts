import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { atomic, getDb, schema } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { localToday } from "@/lib/plan/week";
import { buildSeed, SEED_SETTINGS } from "@/lib/prep/seed-data";
import { canonicalName } from "@/lib/recipe-draft";

const {
  prepSettings,
  prepEaters,
  coreFoods,
  coreFoodPrices,
  coreMeals,
  coreMealComponents,
  coreMealPortions,
  prepTemplates,
  prepTemplateMeals,
  prepTemplateExtras,
  ingredients,
  householdMembers,
} = schema;

export class SetupError extends Error {}

/**
 * seedPrep (P-1): every row in one transaction. prep_settings goes first; if
 * it already exists the insert fails and nothing else is written, so running
 * it twice creates nothing new. Returns false when Prep was already set up.
 */
export async function seedPrep(householdId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const members = (
    await db
      .select({ userId: householdMembers.userId, displayName: householdMembers.displayName, role: householdMembers.role })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId))
      .orderBy(asc(householdMembers.joinedAt))
  ).map((m) => ({ ...m, role: m.role === "owner" ? ("owner" as const) : ("member" as const) }));
  const rows = buildSeed(members, () => crypto.randomUUID());

  // Link foods to the household's ingredients by name, making the missing ones.
  const names = rows.foods.map((f) => canonicalName(f.name));
  const existing = await db
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(and(eq(ingredients.householdId, householdId), inArray(ingredients.name, names)));
  const ingredientIds = new Map(existing.map((i) => [i.name, i.id]));
  const newIngredients: (typeof ingredients.$inferInsert)[] = [];
  for (const f of rows.foods) {
    const name = canonicalName(f.name);
    if (ingredientIds.has(name)) continue;
    const id = crypto.randomUUID();
    ingredientIds.set(name, id);
    newIngredients.push({ id, householdId, name, aisle: f.aisle });
  }

  const today = localToday();
  try {
    await atomic((q) => [
      q.insert(prepSettings).values({
        householdId,
        weeklyBudgetCents: SEED_SETTINGS.weeklyBudgetCents,
        prepWeekdays: SEED_SETTINGS.prepWeekdays,
        doubleWeekdays: SEED_SETTINGS.doubleWeekdays,
        guestsDefault: SEED_SETTINGS.guestsDefault,
        rotation: rows.templates.map((t) => t.id),
      }),
      ...(newIngredients.length ? [q.insert(ingredients).values(newIngredients)] : []),
      q.insert(prepEaters).values(rows.eaters.map((e) => ({ ...e, householdId }))),
      q.insert(coreFoods).values(
        rows.foods.map(({ aisle: _aisle, ...f }) => ({
          ...f,
          householdId,
          ingredientId: ingredientIds.get(canonicalName(f.name))!,
          priceIsEstimate: true,
        })),
      ),
      q.insert(coreFoodPrices).values(
        rows.foods.map((f) => ({
          coreFoodId: f.id,
          priceCents: f.packagePriceCents,
          packageAmount: f.packageAmount,
          source: "seed" as const,
          observedOn: today,
          createdBy: userId,
        })),
      ),
      q.insert(coreMeals).values(rows.meals.map(({ key: _key, ...m }) => ({ ...m, householdId }))),
      q.insert(coreMealComponents).values(rows.components.map(({ key: _key, ...c }) => c)),
      q.insert(coreMealPortions).values(rows.portions),
      q.insert(prepTemplates).values(rows.templates.map((t) => ({ ...t, householdId }))),
      q.insert(prepTemplateMeals).values(rows.templateMeals),
      q.insert(prepTemplateExtras).values(rows.templateExtras),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [done] = await db.select({ id: prepSettings.householdId }).from(prepSettings).where(eq(prepSettings.householdId, householdId));
      if (done) return false;
    }
    console.error("[prep] setup failed", err);
    throw new SetupError("Setup didn't finish — try again.");
  }
  return true;
}
