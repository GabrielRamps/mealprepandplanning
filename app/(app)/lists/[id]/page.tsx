import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingList } from "@/components/shopping-list";
import { getList } from "@/lib/grocery/lists";
import { getMembers, requireHousehold } from "@/lib/household";

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

  return (
    <ShoppingList
      // Remount when the server sends a fresh list (e.g. after Done shopping).
      key={`${list.id}:${list.status}`}
      listId={list.id}
      name={list.name}
      status={list.status}
      initialItems={list.items}
      aisleOrder={list.aisleOrder}
      memberNames={Object.fromEntries(members.map((m) => [m.userId, m.displayName.split(/\s+/)[0]]))}
    />
  );
}
