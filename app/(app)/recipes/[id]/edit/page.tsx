import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeEditor } from "@/components/recipe-editor";
import { requireHousehold } from "@/lib/household";
import { getRecipe, listTags } from "@/lib/recipes";

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditRecipePage(props: PageProps<"/recipes/[id]/edit">) {
  const { id } = await props.params;
  const { membership } = await requireHousehold();
  const [recipe, tags] = await Promise.all([getRecipe(membership.householdId, id), listTags(membership.householdId)]);
  if (!recipe) notFound();

  return (
    <RecipeEditor
      recipeId={recipe.id}
      initial={{
        title: recipe.title,
        description: recipe.description ?? "",
        servings: recipe.servings,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        notes: recipe.notes ?? "",
        sourceUrl: recipe.sourceUrl ?? "",
        coverUrl: recipe.coverUrl,
        creatorName: recipe.creatorName,
        creatorHandle: recipe.creatorHandle,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        tags: recipe.tags,
      }}
      tagSuggestions={tags.map((t) => t.name)}
      cancelHref={`/recipes/${recipe.id}`}
    />
  );
}
