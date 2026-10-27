import type { Metadata } from "next";
import { BLANK_RECIPE, RecipeEditor } from "@/components/recipe-editor";
import { requireHousehold } from "@/lib/household";
import { listTags } from "@/lib/recipes";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const { membership } = await requireHousehold();
  const tags = await listTags(membership.householdId);

  return (
    <RecipeEditor
      recipeId={null}
      initial={BLANK_RECIPE}
      tagSuggestions={tags.map((t) => t.name)}
      cancelHref="/recipes"
    />
  );
}
