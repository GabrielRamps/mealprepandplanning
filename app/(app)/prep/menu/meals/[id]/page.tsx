import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MealEditor } from "@/components/prep/meal-editor";
import { SetupPrep } from "@/components/prep/setup-prep";
import { requireHousehold } from "@/lib/household";
import { isUuid } from "@/lib/library-filters";
import { loadCatalog } from "@/lib/prep/load";

export const metadata: Metadata = { title: "Meal" };

/** Meal editor (P-3): parts, swaps, prep labels and each eater's portion. "new" adds one. */
export default async function MealPage(props: PageProps<"/prep/menu/meals/[id]">) {
  const { id } = await props.params;
  const { membership } = await requireHousehold();
  const catalog = await loadCatalog(membership.householdId);
  if (!catalog) return <SetupPrep />;
  const meal = id === "new" ? null : isUuid(id) ? catalog.meals.get(id) : undefined;
  if (meal === undefined || meal?.deleted) notFound();
  const foods = [...catalog.foods.values()].filter((f) => !f.deleted || meal?.components.some((c) => c.defaultFoodId === f.id));
  const review = meal ? [...catalog.needsReview].filter((k) => meal.components.some((c) => k.startsWith(`${c.id}:`))) : [];
  return (
    <>
      <PageHeader title={meal ? meal.name : "New meal"} back={{ href: "/prep/menu?tab=meals", label: "Menu" }} />
      <MealEditor meal={meal} foods={foods} eaters={catalog.eaters} needsReview={review} />
    </>
  );
}
