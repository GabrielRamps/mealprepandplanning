import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { atomic, getDb, schema, type Statement } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { isUuid } from "@/lib/library-filters";
import { localToday, weekStartOf } from "@/lib/plan/week";
import type { Catalog, EaterRecord } from "@/lib/prep/load";
import type { CoreFoodData, CoreMealData, EaterData, SettingsData } from "@/lib/prep/validation";
import { canonicalName } from "@/lib/recipe-draft";

// Menu writes (PRD-prep P-2, P-3, P-4, P-10, P-13): foods with price history,
// meals with components and portions, eaters, settings and templates.

const {
  coreFoods,
  coreFoodPrices,
  coreMeals,
  coreMealComponents,
  coreMealPortions,
  prepEaters,
  prepSettings,
  prepTemplates,
  prepWeeks,
  prepWeekMeals,
  ingredients,
} = schema;

export class MenuError extends Error {}

type Q = Parameters<Parameters<typeof atomic>[0]>[0];

/** The household ingredient for a food name (aisle and pantry flag live there), made if missing. */
async function ensureIngredient(householdId: string, name: string, aisle: CoreFoodData["aisle"]): Promise<string> {
  const db = getDb();
  const canonical = canonicalName(name);
  await db.insert(ingredients).values({ householdId, name: canonical, aisle }).onConflictDoNothing();
  const [row] = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(eq(ingredients.householdId, householdId), eq(ingredients.name, canonical)))
    .limit(1);
  await db.update(ingredients).set({ aisle }).where(eq(ingredients.id, row.id));
  return row.id;
}

/** upsertCoreFood: a price or package change writes price history (P-10). */
export async function upsertCoreFood(
  householdId: string,
  userId: string,
  input: CoreFoodData,
): Promise<string> {
  const db = getDb();
  let before: typeof coreFoods.$inferSelect | undefined;
  if (input.id) {
    [before] = await db
      .select()
      .from(coreFoods)
      .where(and(eq(coreFoods.id, input.id), eq(coreFoods.householdId, householdId), isNull(coreFoods.deletedAt)))
      .limit(1);
    if (!before) throw new MenuError("That food was deleted.");
  }
  const ingredientId = await ensureIngredient(householdId, input.name, input.aisle);
  const priceChanged = !before || before.packagePriceCents !== input.packagePriceCents || Math.abs(before.packageAmount - input.packageAmount) > 0.005;
  const id = before?.id ?? crypto.randomUUID();
  const now = new Date();
  const { id: _id, aisle: _aisle, ...fields } = input;
  const values = {
    ...fields,
    ingredientId,
    priceIsEstimate: priceChanged ? input.priceIsEstimate : (before?.priceIsEstimate ?? input.priceIsEstimate),
    ...(priceChanged ? { priceUpdatedAt: now } : {}),
    updatedAt: now,
  };
  try {
    await atomic((q) => [
      before
        ? q.update(coreFoods).set(values).where(and(eq(coreFoods.id, id), eq(coreFoods.householdId, householdId)))
        : q.insert(coreFoods).values({ id, householdId, ...values }),
      ...(priceChanged
        ? [
            q.insert(coreFoodPrices).values({
              coreFoodId: id,
              priceCents: input.packagePriceCents,
              packageAmount: input.packageAmount,
              source: "manual" as const,
              observedOn: localToday(),
              createdBy: userId,
            }),
          ]
        : []),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) throw new MenuError(`You already have a food called “${input.name}”.`);
    throw err;
  }
  return id;
}

export type PriceChange = { priceCents: number; packageAmount: number; source: "manual" | "receipt" | "seed"; observedOn: string; createdBy: string | null };

export async function priceHistory(foodId: string, limit = 10): Promise<PriceChange[]> {
  return getDb()
    .select({
      priceCents: coreFoodPrices.priceCents,
      packageAmount: coreFoodPrices.packageAmount,
      source: coreFoodPrices.source,
      observedOn: coreFoodPrices.observedOn,
      createdBy: coreFoodPrices.createdBy,
    })
    .from(coreFoodPrices)
    .where(eq(coreFoodPrices.coreFoodId, foodId))
    .orderBy(desc(coreFoodPrices.observedOn), desc(coreFoodPrices.createdAt))
    .limit(limit);
}

/** Weeks that haven't ended yet (this week and later). */
async function upcomingWeekMeals(householdId: string) {
  const from = weekStartOf(localToday());
  return getDb()
    .select({ weekId: prepWeeks.id, coreMealId: prepWeekMeals.coreMealId, choices: prepWeekMeals.choices, restockBuy: prepWeeks.restockBuy })
    .from(prepWeeks)
    .leftJoin(prepWeekMeals, eq(prepWeekMeals.prepWeekId, prepWeeks.id))
    .where(and(eq(prepWeeks.householdId, householdId), gte(prepWeeks.weekStart, from)));
}

function usedText(meals: string[], weeks: number): string {
  const parts: string[] = [];
  if (meals.length) parts.push(meals.length <= 2 ? meals.join(" and ") : `${meals.slice(0, 2).join(", ")} and ${meals.length - 2} more`);
  if (weeks) parts.push(`${weeks} week${weeks === 1 ? "" : "s"}`);
  return `Used in ${parts.join(" and ")}. Swap it out first.`;
}

/** deleteCoreFood: soft delete, refused while a meal or an upcoming week uses it (P-2). */
export async function deleteCoreFood(householdId: string, catalog: Catalog, foodId: string): Promise<{ error?: string }> {
  const food = catalog.foods.get(foodId);
  if (!food || food.deleted) return {};
  const meals = [...catalog.meals.values()]
    .filter((m) => !m.deleted && m.components.some((c) => c.defaultFoodId === foodId))
    .map((m) => m.name);
  const rows = await upcomingWeekMeals(householdId);
  const weeks = new Set(rows.filter((r) => Object.values(r.choices ?? {}).includes(foodId) || r.restockBuy.includes(foodId)).map((r) => r.weekId));
  if (meals.length || weeks.size) return { error: usedText(meals, weeks.size) };
  await getDb()
    .update(coreFoods)
    .set({ deletedAt: new Date() })
    .where(and(eq(coreFoods.id, foodId), eq(coreFoods.householdId, householdId)));
  return {};
}

/** Active eaters who eat a slot: every component needs a portion for each (P-3). */
export function eatersForSlot(eaters: EaterRecord[], slot: string): EaterRecord[] {
  return eaters.filter((e) => e.isActive && e.slots.includes(slot as EaterRecord["slots"][number]));
}

/** saveCoreMeal: components keep their ids (week choices point at them); portions are replaced. */
export async function saveCoreMeal(
  householdId: string,
  catalog: Catalog,
  input: CoreMealData,
): Promise<string> {
  const existing = input.id ? catalog.meals.get(input.id) : undefined;
  if (input.id && (!existing || existing.deleted)) throw new MenuError("That meal was deleted.");
  if (existing?.isFlex && input.components.length) throw new MenuError("A flex meal has no food in it.");
  const eaterIds = new Set(catalog.eaters.map((e) => e.id));
  const required = eatersForSlot(catalog.eaters, input.slot);

  for (const [i, c] of input.components.entries()) {
    const food = catalog.foods.get(c.defaultFoodId);
    if (!food || food.deleted) throw new MenuError(`Part ${i + 1}: pick a food from your menu.`);
    if (c.swapCategory && food.category !== c.swapCategory) throw new MenuError(`Part ${i + 1}: ${food.name} isn't in that group.`);
    if (c.id && !existing?.components.some((x) => x.id === c.id)) throw new MenuError("That meal changed on the other phone. Reload and try again.");
    for (const e of required) {
      const p = c.portions.find((x) => x.eaterId === e.id);
      if (!p || p.amount === null) throw new MenuError(`Fill in ${e.name}'s ${food.name.toLowerCase()} (or set it to 0).`);
    }
  }

  const mealId = existing?.id ?? crypto.randomUUID();
  const components = input.components.map((c, position) => ({ ...c, id: c.id ?? crypto.randomUUID(), position }));
  const keep = new Set(components.map((c) => c.id));
  const removed = (existing?.components ?? []).filter((c) => !keep.has(c.id)).map((c) => c.id);
  const now = new Date();

  await atomic((q) => {
    const out: Statement[] = [
      existing
        ? q
            .update(coreMeals)
            .set({ name: input.name, slot: input.slot, flavorIdeas: input.flavorIdeas, notes: input.notes, updatedAt: now })
            .where(and(eq(coreMeals.id, mealId), eq(coreMeals.householdId, householdId)))
        : q.insert(coreMeals).values({
            id: mealId,
            householdId,
            name: input.name,
            slot: input.slot,
            flavorIdeas: input.flavorIdeas,
            notes: input.notes,
            position: catalog.meals.size,
          }),
    ];
    if (removed.length) out.push(q.delete(coreMealComponents).where(inArray(coreMealComponents.id, removed)));
    for (const c of components) {
      const fields = { role: c.role, label: c.label, swapCategory: c.swapCategory, defaultFoodId: c.defaultFoodId, prepAs: c.prepAs, position: c.position };
      out.push(
        existing?.components.some((x) => x.id === c.id)
          ? q.update(coreMealComponents).set(fields).where(and(eq(coreMealComponents.id, c.id), eq(coreMealComponents.coreMealId, mealId)))
          : q.insert(coreMealComponents).values({ id: c.id, coreMealId: mealId, ...fields }),
      );
    }
    const ids = components.map((c) => c.id);
    if (ids.length) out.push(q.delete(coreMealPortions).where(inArray(coreMealPortions.componentId, ids)));
    const portions = components.flatMap((c) =>
      c.portions
        .filter((p) => p.amount !== null && eaterIds.has(p.eaterId))
        .map((p) => ({ componentId: c.id, eaterId: p.eaterId, amount: p.amount!, needsReview: p.needsReview })),
    );
    if (portions.length) out.push(q.insert(coreMealPortions).values(portions));
    return out;
  });
  return mealId;
}

export async function deleteCoreMeal(householdId: string, mealId: string): Promise<{ error?: string }> {
  if (!isUuid(mealId)) return {};
  const rows = await upcomingWeekMeals(householdId);
  const weeks = new Set(rows.filter((r) => r.coreMealId === mealId).map((r) => r.weekId));
  if (weeks.size) return { error: usedText([], weeks.size) };
  await getDb()
    .update(coreMeals)
    .set({ deletedAt: new Date() })
    .where(and(eq(coreMeals.id, mealId), eq(coreMeals.householdId, householdId)));
  return {};
}

/** The member whose targets are closest; guests copy the biggest plate (P-3). */
function portionDonor(eaters: EaterRecord[], kcal: number | null): EaterRecord | null {
  const members = eaters.filter((e) => e.kind === "member" && e.kcalTarget !== null);
  if (!members.length) return null;
  if (kcal === null) return [...members].sort((a, b) => b.kcalTarget! - a.kcalTarget!)[0];
  return [...members].sort((a, b) => Math.abs(a.kcalTarget! - kcal) - Math.abs(b.kcalTarget! - kcal))[0];
}

/** saveEater: a new eater gets portions copied from the closest member, marked "check portions". */
export async function saveEater(
  householdId: string,
  catalog: Catalog,
  input: EaterData,
  memberNames: Map<string, string>,
): Promise<string> {
  const db = getDb();
  const existing = input.id ? catalog.eaters.find((e) => e.id === input.id) : undefined;
  if (input.id && !existing) throw new MenuError("That eater was removed.");
  const kind = existing?.kind ?? input.kind;
  if (kind === "member" && (input.kcalTarget === null || input.proteinTargetG === null)) {
    throw new MenuError("Set calorie and protein targets.");
  }
  const now = new Date();
  if (existing) {
    await db
      .update(prepEaters)
      .set({
        // Members show their display name; only guests are renamed here.
        ...(kind === "guest" ? { name: input.name } : {}),
        isActive: input.isActive,
        slots: input.slots,
        kcalTarget: kind === "member" ? input.kcalTarget : null,
        proteinTargetG: kind === "member" ? input.proteinTargetG : null,
        updatedAt: now,
      })
      .where(and(eq(prepEaters.id, existing.id), eq(prepEaters.householdId, householdId)));
    return existing.id;
  }

  let userId: string | null = null;
  let name = input.name;
  if (kind === "member") {
    if (!input.userId || !memberNames.has(input.userId)) throw new MenuError("They aren't in this household.");
    if (catalog.eaters.some((e) => e.userId === input.userId)) throw new MenuError("They're already an eater.");
    userId = input.userId;
    name = memberNames.get(input.userId)!;
  }
  const id = crypto.randomUUID();
  const donor = portionDonor(catalog.eaters, kind === "member" ? input.kcalTarget : null);
  const copies = donor
    ? [...catalog.meals.values()].flatMap((m) =>
        m.components
          .filter((c) => c.portions[donor.id] !== undefined)
          .map((c) => ({ componentId: c.id, eaterId: id, amount: c.portions[donor.id], needsReview: true })),
      )
    : [];
  const usedColors = new Set(catalog.eaters.filter((e) => e.kind === "member").map((e) => e.color));
  await atomic((q) => [
    q.insert(prepEaters).values({
      id,
      householdId,
      kind,
      userId,
      name,
      color: kind === "guest" ? "neutral" : usedColors.has("a") ? "b" : "a",
      slots: input.slots,
      kcalTarget: kind === "member" ? input.kcalTarget : null,
      proteinTargetG: kind === "member" ? input.proteinTargetG : null,
      isActive: input.isActive,
      position: catalog.eaters.length,
    }),
    ...(copies.length ? [q.insert(coreMealPortions).values(copies)] : []),
  ]);
  return id;
}

/** Guests can be removed; members only switched off. */
export async function deleteGuest(householdId: string, eaterId: string): Promise<void> {
  if (!isUuid(eaterId)) return;
  await getDb()
    .delete(prepEaters)
    .where(and(eq(prepEaters.id, eaterId), eq(prepEaters.householdId, householdId), eq(prepEaters.kind, "guest")));
}

export async function saveSettings(householdId: string, input: SettingsData): Promise<void> {
  const db = getDb();
  const templates = await db
    .select({ id: prepTemplates.id })
    .from(prepTemplates)
    .where(and(eq(prepTemplates.householdId, householdId), isNull(prepTemplates.deletedAt)));
  const valid = new Set(templates.map((t) => t.id));
  await db
    .update(prepSettings)
    .set({
      weeklyBudgetCents: input.weeklyBudgetCents,
      prepWeekdays: [...new Set(input.prepWeekdays)].sort((a, b) => a - b),
      doubleWeekdays: [...new Set(input.doubleWeekdays)].sort((a, b) => a - b),
      guestsDefault: input.guestsDefault,
      rotation: [...new Set(input.rotation)].filter((id) => valid.has(id)),
      updatedAt: new Date(),
    })
    .where(eq(prepSettings.householdId, householdId));
}

export async function renameTemplate(householdId: string, templateId: string, name: string): Promise<void> {
  if (!isUuid(templateId)) return;
  await getDb()
    .update(prepTemplates)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(prepTemplates.id, templateId), eq(prepTemplates.householdId, householdId)));
}

/** Soft delete; it leaves the rotation. Weeks made from it keep their meals. */
export async function deleteTemplate(householdId: string, templateId: string): Promise<void> {
  if (!isUuid(templateId)) return;
  await atomic((q: Q) => [
    q
      .update(prepTemplates)
      .set({ deletedAt: new Date() })
      .where(and(eq(prepTemplates.id, templateId), eq(prepTemplates.householdId, householdId))),
    q
      .update(prepSettings)
      .set({ rotation: sql`array_remove(${prepSettings.rotation}, ${templateId}::uuid)`, updatedAt: new Date() })
      .where(eq(prepSettings.householdId, householdId)),
  ]);
}
