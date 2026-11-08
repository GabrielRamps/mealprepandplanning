// Turning templates into weeks and back (PRD-prep P-5, P-13). Pure: ids are
// made up front so the rows can be written in one transaction.
import { addDays } from "@/lib/plan/week";
import type { Slot, WeekMeal } from "@/lib/prep/types";

export type TemplateMealRow = {
  weekday: number;
  slot: Slot;
  coreMealId: string | null;
  recipeId: string | null;
  servings: number | null;
  leftoverOfWeekday: number | null;
  choices: Record<string, string>;
  flavor: string | null;
  isDouble: boolean;
  noPrep: boolean;
  position: number;
};

/** 1 = Monday … 7 = Sunday, for a day in the week starting `weekStart`. */
export function weekdayIn(weekStart: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Dinners first, so leftovers can point at rows made earlier in the same insert. */
function dinnersFirst<T extends { leftover: boolean }>(rows: T[]): T[] {
  return [...rows.filter((r) => !r.leftover), ...rows.filter((r) => r.leftover)];
}

/**
 * One week meal per template meal, on `weekStart + weekday − 1`. Leftover
 * lunches point at the new dinner on their weekday; one without a dinner
 * there is dropped (a week meal must hold something).
 */
export function weekMealsFromTemplate(weekStart: string, rows: TemplateMealRow[], newId: () => string): WeekMeal[] {
  const made = rows.map((r) => ({ r, id: newId(), leftover: r.leftoverOfWeekday !== null }));
  const dinnerByWeekday = new Map<number, string>();
  for (const m of made) {
    if (m.r.slot === "dinner" && !m.leftover && !dinnerByWeekday.has(m.r.weekday)) dinnerByWeekday.set(m.r.weekday, m.id);
  }
  const out: WeekMeal[] = [];
  for (const { r, id, leftover } of dinnersFirst(made)) {
    const leftoverOf = leftover ? (dinnerByWeekday.get(r.leftoverOfWeekday!) ?? null) : null;
    if (leftover && !leftoverOf) continue;
    if (!leftover && !r.coreMealId && !r.recipeId) continue;
    out.push({
      id,
      day: addDays(weekStart, r.weekday - 1),
      slot: r.slot,
      coreMealId: leftover ? null : r.coreMealId,
      recipeId: leftover || r.coreMealId ? null : r.recipeId,
      servings: leftover || r.coreMealId ? null : r.servings,
      leftoverOf,
      choices: leftover ? {} : r.choices,
      flavor: r.flavor,
      isDouble: r.slot === "dinner" && !leftover && r.isDouble,
      noPrep: r.noPrep,
      position: r.position,
    });
  }
  return out;
}

/** A week's meals copied onto another week (Copy last week), with leftover links rebuilt. */
export function copyWeekMeals(fromStart: string, toStart: string, meals: WeekMeal[], newId: () => string): WeekMeal[] {
  const ids = new Map(meals.map((m) => [m.id, newId()]));
  const shift = (day: string) => addDays(toStart, weekdayIn(fromStart, day) - 1);
  const ordered = dinnersFirst(meals.map((m) => ({ m, leftover: m.leftoverOf !== null })));
  const out: WeekMeal[] = [];
  for (const { m } of ordered) {
    const leftoverOf = m.leftoverOf ? (ids.get(m.leftoverOf) ?? null) : null;
    if (m.leftoverOf && !leftoverOf) continue;
    out.push({ ...m, id: ids.get(m.id)!, day: shift(m.day), leftoverOf });
  }
  return out;
}

/** A week saved as a template: by weekday, with leftovers by the weekday of their dinner. */
export function templateMealsFromWeek(weekStart: string, meals: WeekMeal[]): TemplateMealRow[] {
  const byId = new Map(meals.map((m) => [m.id, m]));
  const out: TemplateMealRow[] = [];
  for (const m of meals) {
    const source = m.leftoverOf ? byId.get(m.leftoverOf) : null;
    if (m.leftoverOf && !source) continue;
    out.push({
      weekday: weekdayIn(weekStart, m.day),
      slot: m.slot,
      coreMealId: m.coreMealId,
      recipeId: m.recipeId,
      servings: m.servings,
      leftoverOfWeekday: source ? weekdayIn(weekStart, source.day) : null,
      choices: m.choices,
      flavor: m.flavor,
      isDouble: m.isDouble,
      noPrep: m.noPrep,
      position: m.position,
    });
  }
  return out;
}

/**
 * The suggested template (P-5): the one after the template used by the most
 * recent earlier week, in rotation order, wrapping from the last to the first.
 * With no earlier week (or one not in the rotation), the first.
 */
export function suggestTemplate(rotation: string[], lastTemplateId: string | null): string | null {
  if (rotation.length === 0) return null;
  const i = lastTemplateId ? rotation.indexOf(lastTemplateId) : -1;
  return i === -1 ? rotation[0] : rotation[(i + 1) % rotation.length];
}
