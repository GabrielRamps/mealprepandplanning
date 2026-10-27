import type { Metadata } from "next";
import { NewListForm } from "@/components/new-list-form";
import { PageHeader } from "@/components/page-header";
import { requireHousehold } from "@/lib/household";
import { isUuid } from "@/lib/library-filters";
import { pickableRecipes } from "@/lib/recipes";

export const metadata: Metadata = { title: "New list" };

export default async function NewListPage(props: PageProps<"/lists/new">) {
  const { membership } = await requireHousehold();
  const { recipe } = await props.searchParams;
  const recipes = await pickableRecipes(membership.householdId);

  return (
    <>
      <PageHeader title="New list" back={{ href: "/lists", label: "Lists" }} />
      <NewListForm recipes={recipes} preselect={isUuid(recipe) ? recipe : null} />
    </>
  );
}
