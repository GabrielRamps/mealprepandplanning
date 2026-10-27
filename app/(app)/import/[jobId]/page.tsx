import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportReview } from "@/components/import-review";
import type { CoverChoice, EditorInitial } from "@/components/recipe-editor";
import { requireHousehold } from "@/lib/household";
import type { StoredDraft } from "@/lib/import/ai";
import { duplicateRecipe, getJob, jobImageKeys, MAX_ATTEMPTS } from "@/lib/import/jobs";
import { listTags } from "@/lib/recipes";
import { BUCKETS, presignedGetUrl } from "@/lib/storage";
import { isUnitCode } from "@/lib/units";

export const metadata: Metadata = { title: "Review import" };

function toEditor(draft: StoredDraft, sourceUrl: string | null): EditorInitial {
  return {
    title: draft.title,
    description: draft.description ?? "",
    servings: draft.servings,
    prepMinutes: draft.prep_minutes,
    cookMinutes: draft.cook_minutes,
    notes: draft.notes ?? "",
    sourceUrl: sourceUrl ?? "",
    coverUrl: null,
    creatorName: draft.creator_name,
    creatorHandle: draft.creator_handle,
    ingredients: draft.ingredients.map((i) => ({
      section: i.section,
      quantity: i.quantity,
      quantityMax: i.quantity_max,
      unit: isUnitCode(i.unit) ? i.unit : null,
      name: i.name,
      prepNote: i.prep_note,
      isOptional: i.is_optional,
      aisle: i.aisle,
    })),
    steps: draft.steps.map((s) => ({ section: s.section, text: s.text })),
    tags: draft.tags,
  };
}

export default async function ImportReviewPage(props: PageProps<"/import/[jobId]">) {
  const { jobId } = await props.params;
  const { membership } = await requireHousehold();
  const householdId = membership.householdId;
  const job = await getJob(householdId, jobId);
  if (!job) notFound();

  const ready = job.status === "ready" && job.draft !== null;
  const [tags, duplicate, keys] = ready
    ? await Promise.all([listTags(householdId), duplicateRecipe(householdId, job.sourceUrl), jobImageKeys(householdId, job.id)])
    : [[], null, []];

  // Cover candidates (PRD 7.3): the post's thumbnail or the page's JSON-LD image, and uploaded photos.
  const coverChoices: CoverChoice[] = [];
  if (ready && job.thumbnailUrl) coverChoices.push({ id: "thumbnail", url: job.thumbnailUrl, label: "Photo from the post" });
  for (const [n, key] of keys.entries()) {
    coverChoices.push({ id: `image-${n}`, url: await presignedGetUrl(BUCKETS.imports, key, 3600), label: `Uploaded photo ${n + 1}` });
  }

  return (
    <ImportReview
      key={job.status}
      jobId={job.id}
      status={job.status}
      error={job.error}
      canRetry={job.attempts < MAX_ATTEMPTS}
      recipeId={job.recipeId}
      noRecipeFound={Boolean(job.draft?.no_recipe_found)}
      initial={ready ? toEditor(job.draft!, job.sourceUrl) : null}
      conflicts={job.draft?.conflicts ?? []}
      coverChoices={coverChoices}
      tagSuggestions={tags.map((t) => t.name)}
      duplicate={duplicate}
    />
  );
}
