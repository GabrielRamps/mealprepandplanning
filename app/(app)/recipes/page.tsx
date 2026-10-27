import { BookOpen, Plus, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LibraryControls } from "@/components/library-controls";
import { EmptyState, PageHeader } from "@/components/page-header";
import { RecipeCard } from "@/components/recipe-card";
import { Button } from "@/components/ui/button";
import { getMembers, requireHousehold } from "@/lib/household";
import { activeFilterCount, parseLibraryFilters } from "@/lib/library-filters";
import { listRecipes, listTags } from "@/lib/recipes";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage(props: PageProps<"/recipes">) {
  const { user, membership } = await requireHousehold();
  const filters = parseLibraryFilters(await props.searchParams);
  const [recipes, tags, members] = await Promise.all([
    listRecipes(membership.householdId, user.id, filters),
    listTags(membership.householdId),
    getMembers(membership.householdId),
  ]);
  const others = members.filter((m) => m.userId !== user.id);
  const partnerLabel = others.length === 1 ? others[0].displayName.split(/\s+/)[0] : "others";
  const filtering = Boolean(filters.q) || activeFilterCount(filters) > 0;

  return (
    <>
      <PageHeader
        title="Recipes"
        action={
          <>
            <Button asChild variant="ghost" size="icon" aria-label="New recipe">
              <Link href="/recipes/new">
                <Plus className="size-6" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Settings">
              <Link href="/settings">
                <Settings className="size-6" />
              </Link>
            </Button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-2xl flex-1">
        <LibraryControls filters={filters} tags={tags} partnerLabel={partnerLabel} />
        {recipes.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 p-4 sm:grid-cols-3">
            {recipes.map((r) => (
              <li key={r.id}>
                <RecipeCard recipe={r} partnerLabel={partnerLabel} />
              </li>
            ))}
          </ul>
        ) : filtering ? (
          <EmptyState icon={<BookOpen className="size-7" />} title="No matches">
            Nothing matches these filters. Try a different search or clear the filters.
          </EmptyState>
        ) : (
          <div className="flex flex-col items-center pb-10">
            <EmptyState icon={<BookOpen className="size-7" />} title="No recipes yet">
              Add your first recipe by hand, with a photo. Importing from links and screenshots comes later.
            </EmptyState>
            <Button asChild size="lg">
              <Link href="/recipes/new">
                <Plus aria-hidden /> Add a recipe
              </Link>
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
