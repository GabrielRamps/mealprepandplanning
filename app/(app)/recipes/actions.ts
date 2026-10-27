"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireHousehold } from "@/lib/household";
import { isUuid } from "@/lib/library-filters";
import { deleteCoverPhoto, PhotoError, saveCoverPhoto } from "@/lib/photos";
import { RecipeDraft, SourceUrl } from "@/lib/recipe-draft";
import {
  createRecipe,
  getRecipe,
  recipeInHousehold,
  setFavorite,
  setRating,
  setStatus,
  softDeleteRecipe,
  updateRecipe,
} from "@/lib/recipes";

export type SaveRecipeResult = { error?: string; fieldErrors?: Record<string, string> } | null;

const SaveRecipeInput = z.object({
  id: z.string().nullable(),
  draft: RecipeDraft,
  source_url: SourceUrl,
  // keep: leave the cover as is; replace: use the uploaded `cover` file; remove: no cover.
  cover: z.enum(["keep", "replace", "remove"]),
});

/** Zod issues keyed by path ("draft.ingredients.2.name"), first message wins. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join(".")] ??= issue.message;
  return out;
}

/**
 * createRecipe / updateRecipe (PRD 9.2) in one action, so the cover photo and
 * the recipe are saved together. FormData: `payload` (JSON) and optional `cover`.
 */
export async function saveRecipeAction(formData: FormData): Promise<SaveRecipeResult> {
  const { user, membership } = await requireHousehold();
  const householdId = membership.householdId;

  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Something went wrong sending the recipe. Try again." };
  }
  const parsed = SaveRecipeInput.safeParse(json);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { id, draft, source_url, cover } = parsed.data;

  const existing = id ? await getRecipe(householdId, id) : null;
  if (id && !existing) notFound();

  let newCoverKey: string | null = null;
  if (cover === "replace") {
    const file = formData.get("cover");
    if (!(file instanceof File) || file.size === 0) return { fieldErrors: { cover: "Choose a photo again." } };
    try {
      newCoverKey = await saveCoverPhoto(householdId, file);
    } catch (err) {
      if (err instanceof PhotoError) return { fieldErrors: { cover: err.message } };
      throw err;
    }
  }

  let recipeId: string;
  try {
    if (existing) {
      await updateRecipe({
        householdId,
        recipeId: existing.id,
        draft,
        sourceUrl: source_url,
        coverImageKey: cover === "keep" ? undefined : newCoverKey,
      });
      recipeId = existing.id;
    } else {
      recipeId = await createRecipe({
        householdId,
        userId: user.id,
        draft,
        sourceUrl: source_url,
        coverImageKey: cover === "replace" ? newCoverKey : null,
      });
    }
  } catch (err) {
    await deleteCoverPhoto(newCoverKey);
    throw err;
  }

  // The old photo goes once the recipe no longer points at it.
  if (existing && cover !== "keep") await deleteCoverPhoto(existing.coverImageKey);

  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}`);
}

async function requireRecipe(recipeId: string) {
  const ctx = await requireHousehold();
  // Records outside the household are a 404, never a 403 (PRD 12).
  if (!(await recipeInHousehold(ctx.membership.householdId, recipeId))) notFound();
  return ctx;
}

export async function rateRecipeAction(recipeId: string, rating: number | null): Promise<void> {
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return;
  const { user } = await requireRecipe(recipeId);
  await setRating(recipeId, user.id, rating);
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

export async function toggleFavoriteAction(recipeId: string, isFavorite: boolean): Promise<void> {
  const { user } = await requireRecipe(recipeId);
  await setFavorite(recipeId, user.id, Boolean(isFavorite));
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

const DislikeReason = z.string().trim().min(1, "Say what didn't work").max(500, "Keep it under 500 characters");

export async function dislikeRecipeAction(recipeId: string, reason: string): Promise<{ error?: string }> {
  const parsed = DislikeReason.safeParse(reason);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { user, membership } = await requireRecipe(recipeId);
  await setStatus({ householdId: membership.householdId, recipeId, status: "disliked", reason: parsed.data, userId: user.id });
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  return {};
}

/** Archive, or bring a disliked/archived recipe back to active. */
export async function setRecipeStatusAction(recipeId: string, status: "active" | "archived"): Promise<void> {
  if (status !== "active" && status !== "archived") return;
  const { user, membership } = await requireRecipe(recipeId);
  await setStatus({ householdId: membership.householdId, recipeId, status, reason: null, userId: user.id });
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

export async function deleteRecipeAction(recipeId: string): Promise<void> {
  if (!isUuid(recipeId)) notFound();
  const { membership } = await requireRecipe(recipeId);
  await softDeleteRecipe(membership.householdId, recipeId);
  revalidatePath("/recipes");
  redirect("/recipes");
}
