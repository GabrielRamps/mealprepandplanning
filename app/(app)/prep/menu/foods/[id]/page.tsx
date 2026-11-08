import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { FoodEditor } from "@/components/prep/food-editor";
import { SetupPrep } from "@/components/prep/setup-prep";
import { getMembers, requireHousehold } from "@/lib/household";
import { isUuid } from "@/lib/library-filters";
import { loadCatalog } from "@/lib/prep/load";
import { priceHistory } from "@/lib/prep/menu";

export const metadata: Metadata = { title: "Food" };

/** Food editor (P-2, P-10): every field, price history and the Walmart link. "new" adds one. */
export default async function FoodPage(props: PageProps<"/prep/menu/foods/[id]">) {
  const { id } = await props.params;
  const { membership } = await requireHousehold();
  const catalog = await loadCatalog(membership.householdId);
  if (!catalog) return <SetupPrep />;
  const food = id === "new" ? null : isUuid(id) ? catalog.foods.get(id) : undefined;
  if (food === undefined || food?.deleted) notFound();
  const [history, members] = await Promise.all([food ? priceHistory(food.id) : Promise.resolve([]), getMembers(membership.householdId)]);
  const names = Object.fromEntries(members.map((m) => [m.userId, m.displayName.trim().split(/\s+/)[0]]));
  return (
    <>
      <PageHeader title={food ? food.name : "New food"} back={{ href: "/prep/menu?tab=foods", label: "Menu" }} />
      <FoodEditor food={food} history={history.map((h) => ({ ...h, by: h.createdBy ? (names[h.createdBy] ?? null) : null }))} />
    </>
  );
}
