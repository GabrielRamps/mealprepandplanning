import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingList } from "@/components/shopping-list";
import { getList, listOutOfDate } from "@/lib/grocery/lists";
import { getMembers, requireHousehold } from "@/lib/household";
import { getPlan, planPicks } from "@/lib/plan/plans";
import { prepWeekForList, weekChangedSinceList } from "@/lib/prep/list";
import { loadCatalog } from "@/lib/prep/load";

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
  const [prepWeek, catalog] = list.prepWeekId
    ? await Promise.all([prepWeekForList(membership.householdId, list.prepWeekId), loadCatalog(membership.householdId)])
    : [null, null];
  // Open in Walmart for Prep items (merge key core:{foodId}).
  const walmartUrls: Record<string, string> = {};
  for (const f of catalog?.foods.values() ?? []) if (f.walmartUrl) walmartUrls[`core:${f.id}`] = f.walmartUrl;
  const prepChanged = prepWeek ? weekChangedSinceList(prepWeek) : false;

  return (
    <ShoppingList
      // Remount when the server sends a fresh list (e.g. after Done shopping).
      key={`${list.id}:${list.status}:${planChanged}:${prepChanged}`}
      listId={list.id}
      name={list.name}
      status={list.status}
      planChanged={planChanged}
      savedList={list.savedList}
      initialItems={list.items}
      aisleOrder={list.aisleOrder}
      memberNames={Object.fromEntries(members.map((m) => [m.userId, m.displayName.split(/\s+/)[0]]))}
      prepWeek={prepWeek ? { id: prepWeek.id, changed: prepChanged } : null}
      walmartUrls={walmartUrls}
    />
  );
}
