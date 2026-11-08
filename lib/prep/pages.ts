import "server-only";
import { pickableRecipes } from "@/lib/recipes";
import { addDays, weekStartOf } from "@/lib/plan/week";
import { weekTasks } from "@/lib/prep/calc";
import { weekChangedSinceList } from "@/lib/prep/list";
import { type Catalog, getWeekRow, latestPrepList, listTemplates, loadWeek, previousWeek, type WeekRow } from "@/lib/prep/load";
import { suggestTemplate } from "@/lib/prep/template";
import { buildWeekView, entryView, type EntryView, type MenuView, type TaskView, type WeekView } from "@/lib/prep/view";
import { taskChecks } from "@/lib/prep/weeks";

// Data for the Prep pages, built once per request from the catalog.

export function menuView(catalog: Catalog): MenuView {
  return {
    meals: [...catalog.meals.values()]
      .filter((m) => !m.deleted)
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        name: m.name,
        slot: m.slot,
        isFlex: m.isFlex,
        flavorIdeas: m.flavorIdeas,
        components: m.components.map((c) => ({ id: c.id, role: c.role, label: c.label, swapCategory: c.swapCategory, defaultFoodId: c.defaultFoodId })),
      })),
    foods: [...catalog.foods.values()].filter((f) => !f.deleted).map((f) => ({ id: f.id, name: f.name, category: f.category })),
    eaters: catalog.eaters.map((e) => ({ id: e.id, kind: e.kind, name: e.name, slots: e.slots, isActive: e.isActive, color: e.color })),
    doubleWeekdays: catalog.settings.doubleWeekdays,
  };
}

export async function weekView(householdId: string, catalog: Catalog, week: WeekRow): Promise<WeekView> {
  const [loaded, listId, templates] = await Promise.all([loadWeek(householdId, catalog, week), latestPrepList(householdId, week.id), listTemplates(householdId)]);
  return buildWeekView({
    input: loaded.input,
    weekId: week.id,
    templateId: week.templateId,
    templateName: templates.find((t) => t.id === week.templateId)?.name ?? null,
    listId,
    listStale: listId !== null && weekChangedSinceList(week),
    recipes: loaded.recipes,
    extras: loaded.extras.map((e) => ({ id: e.id, name: e.name, forNote: e.forNote, priceCents: e.priceCents, isPantry: e.isPantry })),
  });
}

export type StartOptions = {
  templates: { id: string; name: string; suggested: boolean; inRotation: boolean }[];
  canCopyLast: boolean;
};

export async function startOptions(householdId: string, catalog: Catalog, weekStart: string): Promise<StartOptions> {
  const [templates, prev, last] = await Promise.all([
    listTemplates(householdId),
    previousWeek(householdId, weekStart),
    getWeekRow(householdId, addDays(weekStart, -7)),
  ]);
  const rotation = catalog.settings.rotation.filter((id) => templates.some((t) => t.id === id));
  const suggested = suggestTemplate(rotation, prev?.templateId ?? null);
  const inRotation = rotation.map((id) => templates.find((t) => t.id === id)!);
  const others = templates.filter((t) => !rotation.includes(t.id));
  const ordered = [...inRotation, ...others].map((t) => ({ id: t.id, name: t.name, suggested: t.id === suggested, inRotation: rotation.includes(t.id) }));
  return {
    templates: [...ordered.filter((t) => t.suggested), ...ordered.filter((t) => !t.suggested)],
    canCopyLast: last !== null,
  };
}

export async function recipeChoices(householdId: string) {
  return pickableRecipes(householdId);
}

export type TodayMeal = EntryView & { note: string | null };

export type TodayData = {
  date: string;
  weekStart: string;
  weekId: string | null;
  meals: TodayMeal[];
  tasks: TaskView[];
  /** The week the Sunday prep belongs to, when today is the Sunday before it. */
  nextWeekStart: string | null;
};

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** getToday (§9): today's meals with each eater's portions, and the tasks due today. */
export async function getToday(householdId: string, catalog: Catalog, date: string, memberNames: Map<string, string>): Promise<TodayData> {
  const weekStart = weekStartOf(date);
  const isSunday = addDays(weekStart, 6) === date;
  const nextStart = addDays(weekStart, 7);
  const [week, next] = await Promise.all([getWeekRow(householdId, weekStart), isSunday ? getWeekRow(householdId, nextStart) : Promise.resolve(null)]);
  const [loaded, loadedNext] = await Promise.all([
    week ? loadWeek(householdId, catalog, week) : null,
    next ? loadWeek(householdId, catalog, next) : null,
  ]);
  const checks = await taskChecks([week?.id, next?.id].filter((id): id is string => Boolean(id)));

  const meals: TodayMeal[] = [];
  if (loaded) {
    const slotOrder = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 } as const;
    for (const wm of loaded.input.weekMeals
      .filter((m) => m.day === date)
      .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot] || a.position - b.position)) {
      const view = entryView(loaded.input, wm, loaded.recipes);
      const note = wm.isDouble ? `Cook double — leftovers are ${WEEKDAY[new Date(`${addDays(date, 1)}T00:00:00Z`).getUTCDay()]}'s lunch.` : null;
      meals.push({ ...view, note });
    }
  }

  const tasks: TaskView[] = [];
  for (const l of [loadedNext, loaded]) {
    if (!l) continue;
    for (const t of weekTasks(l.input, catalog.settings.prepWeekdays)) {
      if (t.date !== date) continue;
      const c = checks.get(`${l.week.id}|${t.key}`);
      tasks.push({ ...t, weekId: l.week.id, checkedBy: c ? (memberNames.get(c.checkedBy) ?? "Someone") : null, checkedAt: c ? c.checkedAt.toISOString() : null });
    }
  }
  return { date, weekStart, weekId: week?.id ?? null, meals, tasks, nextWeekStart: isSunday ? nextStart : null };
}
