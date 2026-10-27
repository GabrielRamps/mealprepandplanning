import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { IngredientSettings } from "@/components/store-settings";
import { listIngredients } from "@/lib/grocery/ingredients";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Ingredients" };

export default async function IngredientsPage({ searchParams }: PageProps<"/settings/ingredients">) {
  const { membership } = await requireHousehold();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const pantryOnly = params.pantry === "1";
  const { items, more } = await listIngredients(membership.householdId, { q, pantryOnly });

  return (
    <>
      <PageHeader title="Ingredients" back={{ href: "/settings", label: "Settings" }} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          Pick the aisle each ingredient is in. Pantry staples go in a &ldquo;Check you have&rdquo; group at the end of a list. Changes
          apply to new lists and to unchecked items on active ones.
        </p>
        <IngredientSettings items={items} more={more} q={q} pantryOnly={pantryOnly} />
      </main>
    </>
  );
}
