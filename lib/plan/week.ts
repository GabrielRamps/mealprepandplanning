// Plan weeks (PRD D1): Monday to Sunday, as ISO dates ("2026-10-26"). The
// math runs in UTC on the date strings, so no time zone can shift a day.

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && toIso(toUtc(value)) === value;
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toUtc(iso).getTime() + days * DAY_MS));
}

/** The Monday on or before a date. */
export function weekStartOf(iso: string): string {
  const day = toUtc(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export function isWeekStart(value: unknown): value is string {
  return isIsoDate(value) && weekStartOf(value) === value;
}

/** Monday through Sunday. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function inWeek(weekStart: string, day: string): boolean {
  return isIsoDate(day) && day >= weekStart && day <= addDays(weekStart, 6);
}

/** Today's date where the code runs (the phone, when called in the browser). */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  toUtc(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** "Mon, Oct 27" */
export function dayLabel(iso: string): string {
  return fmt(iso, { weekday: "short", month: "short", day: "numeric" });
}

/** "Oct 27 – Nov 2" */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(5, 7) === end.slice(5, 7);
  return `${fmt(weekStart, { month: "short", day: "numeric" })} – ${fmt(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}`;
}

/** "Week of Oct 27": the default name of a list made from a plan. */
export function weekListName(weekStart: string): string {
  return `Week of ${fmt(weekStart, { month: "short", day: "numeric" })}`;
}
