import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrepHeader } from "@/components/prep/prep-header";
import { SetupPrep } from "@/components/prep/setup-prep";
import { TodayView } from "@/components/prep/today-view";
import { getMembers, requireHousehold } from "@/lib/household";
import { dayLabel, isIsoDate } from "@/lib/plan/week";
import { loadCatalog } from "@/lib/prep/load";
import { getToday } from "@/lib/prep/pages";

export async function generateMetadata(props: PageProps<"/prep/today/[date]">): Promise<Metadata> {
  const { date } = await props.params;
  return { title: isIsoDate(date) ? `Today · ${dayLabel(date)}` : "Today" };
}

/** Today (P-9): each meal with everyone's portions, and the tasks due today. */
export default async function TodayPage(props: PageProps<"/prep/today/[date]">) {
  const { date } = await props.params;
  if (!isIsoDate(date)) notFound();
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
  const members = await getMembers(householdId);
  const names = new Map(members.map((m) => [m.userId, m.displayName.trim().split(/\s+/)[0] || m.displayName]));
  const today = await getToday(householdId, catalog, date, names);
  return (
    <>
      <PrepHeader />
      <TodayView data={today} />
    </>
  );
}
