import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PrepHeader } from "@/components/prep/prep-header";
import { SetupPrep } from "@/components/prep/setup-prep";
import { StartWeek } from "@/components/prep/start-week";
import { WeekBuilder } from "@/components/prep/week-builder";
import { requireHousehold } from "@/lib/household";
import { addDays, isIsoDate, isWeekStart, weekLabel, weekStartOf } from "@/lib/plan/week";
import { getWeekRow, loadCatalog } from "@/lib/prep/load";
import { menuView, recipeChoices, startOptions, weekView } from "@/lib/prep/pages";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export async function generateMetadata(props: PageProps<"/prep/week/[weekStart]">): Promise<Metadata> {
  const { weekStart } = await props.params;
  return { title: isWeekStart(weekStart) ? `Prep · ${weekLabel(weekStart)}` : "Prep" };
}

/** Week builder (P-5–P-8). Any date in the URL goes to its week's Monday. */
export default async function PrepWeekPage(props: PageProps<"/prep/week/[weekStart]">) {
  const { weekStart } = await props.params;
  if (!isIsoDate(weekStart)) notFound();
  if (!isWeekStart(weekStart)) redirect(`/prep/week/${weekStartOf(weekStart)}`);
  const { membership } = await requireHousehold();
  const householdId = membership.householdId;
  const catalog = await loadCatalog(householdId);
  if (!catalog) {
    return (
      <>
        <PrepHeader />
        <SetupPrep />
      </>
    );
  }
  const week = await getWeekRow(householdId, weekStart);
  if (!week) {
    const options = await startOptions(householdId, catalog, weekStart);
    return (
      <>
        <PrepHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
          <nav aria-label="Weeks" className="flex items-center justify-between gap-2">
            <Button asChild variant="ghost" size="icon" aria-label="Previous week">
              <Link href={`/prep/week/${addDays(weekStart, -7)}`}>
                <ChevronLeft className="size-6" />
              </Link>
            </Button>
            <span className="text-lg font-semibold" data-testid="week-label">
              {weekLabel(weekStart)}
            </span>
            <Button asChild variant="ghost" size="icon" aria-label="Next week">
              <Link href={`/prep/week/${addDays(weekStart, 7)}`}>
                <ChevronRight className="size-6" />
              </Link>
            </Button>
          </nav>
          <StartWeek weekStart={weekStart} options={options} />
        </main>
      </>
    );
  }
  const [view, recipes] = await Promise.all([weekView(householdId, catalog, week), recipeChoices(householdId)]);
  return (
    <>
      <PrepHeader />
      <WeekBuilder initial={view} menu={menuView(catalog)} recipes={recipes} />
    </>
  );
}
