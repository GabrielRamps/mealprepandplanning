import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingList } from "@/components/shopping-list";
import { getList, listOutOfDate } from "@/lib/grocery/lists";
import { getMembers, requireHousehold } from "@/lib/household";
import { getPlan, planPicks } from "@/lib/plan/plans";

export async function generateMetadata(props: PageProps<"/lists/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const { membership } = await requireHousehold();
  const list = await getList(membership.householdId, id);
  return { title: list?.name ?? "List" };
}

export default async function ListPage(props: PageProps<"/lists/[id]">) {
  const { id } = await props.params;
  const { membership } = await requireHousehold();
  const [list, members] = await Promise.all([getList(membership.householdId, id), getMembers(membership.householdId)]);
  if (!list) notFound();
  const plan = list.mealPlanId ? await getPlan(membership.householdId, list.mealPlanId) : null;
  const planChanged = plan ? await listOutOfDate(list.id, planPicks(plan)) : false;

  return (
    <ShoppingList
      // Remount when the server sends a fresh list (e.g. after Done shopping).
      key={`${list.id}:${list.status}:${planChanged}`}
      listId={list.id}
      name={list.name}
      status={list.status}
      planChanged={planChanged}
      savedList={list.savedList}
      initialItems={list.items}
      aisleOrder={list.aisleOrder}
      memberNames={Object.fromEntries(members.map((m) => [m.userId, m.displayName.split(/\s+/)[0]]))}
    />
  );
}
