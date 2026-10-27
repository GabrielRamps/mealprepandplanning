import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WeekPlanView } from "@/components/week-plan";
import { getMembers, requireHousehold } from "@/lib/household";
import { getWeekPlan, latestListForPlan } from "@/lib/plan/plans";
import { addDays, isWeekStart, weekLabel } from "@/lib/plan/week";
import { pickableRecipes } from "@/lib/recipes";

export async function generateMetadata(props: PageProps<"/plan/[weekStart]">): Promise<Metadata> {
  const { weekStart } = await props.params;
  return { title: isWeekStart(weekStart) ? `Plan · ${weekLabel(weekStart)}` : "Plan" };
}

export default async function WeekPage(props: PageProps<"/plan/[weekStart]">) {
  const { weekStart } = await props.params;
  if (!isWeekStart(weekStart)) notFound();
  const { user, membership } = await requireHousehold();
  const householdId = membership.householdId;

  const [plan, previous, recipes, members] = await Promise.all([
    getWeekPlan(householdId, weekStart),
    getWeekPlan(householdId, addDays(weekStart, -7)),
    pickableRecipes(householdId),
    getMembers(householdId),
  ]);
  const listId = plan.id ? await latestListForPlan(householdId, plan.id) : null;
  const others = members.filter((m) => m.userId !== user.id);

  return (
    <WeekPlanView
      plan={plan}
      recipes={recipes}
      userId={user.id}
      memberNames={Object.fromEntries(members.map((m) => [m.userId, m.displayName.split(/\s+/)[0]]))}
      partnerLabel={others.length === 1 ? others[0].displayName.split(/\s+/)[0] : "your partner"}
      previousWeekHasMeals={previous.entries.some((e) => e.recipeAvailable)}
      listId={listId}
    />
  );
}
