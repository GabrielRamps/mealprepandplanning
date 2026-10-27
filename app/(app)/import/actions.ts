"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { SaveRecipeResult } from "@/app/(app)/recipes/actions";
import { requireHousehold } from "@/lib/household";
import { classifyUrl, extractFirstUrl, MAX_IMPORT_TEXT } from "@/lib/import/detect";
import { finishJob, getJob, jobImageKeys, MAX_ATTEMPTS, updateJob } from "@/lib/import/jobs";
import { processJob } from "@/lib/import/process";
import { safeFetch } from "@/lib/import/safe-fetch";
import { startImageImport, startImport, type StartResult } from "@/lib/import/start";
import { createToken, revokeToken, type TokenSummary } from "@/lib/import/tokens";
import { deleteCoverPhoto, PhotoError, saveCoverPhoto, saveCoverPhotoBytes } from "@/lib/photos";
import { RecipeDraft, SourceUrl } from "@/lib/recipe-draft";
import { createRecipe } from "@/lib/recipes";
import { BUCKETS, getObjectBytes } from "@/lib/storage";

export type StartImportResult = { jobId?: string; error?: string };

function done(result: StartResult): StartImportResult {
  if ("error" in result) return { error: result.error };
  revalidatePath("/import");
  return { jobId: result.jobId };
}

/** Paste a link (C1). */
export async function startLinkImportAction(text: string): Promise<StartImportResult> {
  const { user, membership } = await requireHousehold();
  const source = classifyUrl(extractFirstUrl(String(text)) ?? String(text));
  if (!source) return { error: "Paste a full link that starts with https://" };
  return done(await startImport({ householdId: membership.householdId, userId: user.id }, { kind: "link", source }));
}

/** Pasted recipe text. */
export async function startTextImportAction(text: string): Promise<StartImportResult> {
  const { user, membership } = await requireHousehold();
  const trimmed = String(text).trim();
  if (!trimmed) return { error: "Paste the recipe text first." };
  if (trimmed.length > MAX_IMPORT_TEXT) return { error: "That's too long (20,000 characters at most)." };
  return done(await startImport({ householdId: membership.householdId, userId: user.id }, { kind: "text", text: trimmed }));
}

/** 1–6 photos read together as one recipe (C2). FormData field `images`. */
export async function startPhotoImportAction(formData: FormData): Promise<StartImportResult> {
  const { user, membership } = await requireHousehold();
  const files = formData.getAll("images").filter((v): v is File => v instanceof File);
  return done(await startImageImport({ householdId: membership.householdId, userId: user.id }, files));
}

async function requireJob(jobId: string) {
  const ctx = await requireHousehold();
  const job = await getJob(ctx.membership.householdId, jobId);
  if (!job) notFound();
  return { ...ctx, job };
}

/** Retry a failed import (C4), up to 3 attempts in all (PRD 7.6). */
export async function retryImportAction(jobId: string): Promise<{ error?: string }> {
  const { job } = await requireJob(jobId);
  if (job.status !== "failed") return { error: "Only failed imports can be retried." };
  if (job.attempts >= MAX_ATTEMPTS) return { error: "This import failed 3 times. Try a screenshot instead." };
  await updateJob(job.id, { status: "queued", error: null });
  after(() => processJob(job.id));
  revalidatePath("/import");
  revalidatePath(`/import/${job.id}`);
  return {};
}

/** Discard (C3): the draft and its uploads are deleted. */
export async function discardImportAction(jobId: string): Promise<void> {
  const { membership, job } = await requireJob(jobId);
  if (job.status !== "approved") {
    await finishJob(job.id, await jobImageKeys(membership.householdId, job.id), { status: "discarded" });
  }
  revalidatePath("/import");
  redirect("/import");
}

const ApproveInput = z.object({
  id: z.uuid(),
  draft: RecipeDraft,
  source_url: SourceUrl,
  cover: z.string(), // "replace" | "remove" | "choice:thumbnail" | "choice:image-N"
});

/**
 * approveImport (PRD 9.2): the edited draft becomes a recipe with the chosen
 * cover; the job is marked approved and its uploads are deleted.
 */
export async function approveImportAction(formData: FormData): Promise<SaveRecipeResult> {
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Something went wrong sending the recipe. Try again." };
  }
  const parsed = ApproveInput.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { error: "Check the highlighted fields.", fieldErrors };
  }
  const { id, draft, source_url, cover } = parsed.data;
  const { user, membership, job } = await requireJob(id);
  if (job.status !== "ready") return { error: "This import isn't waiting for review anymore." };
  const householdId = membership.householdId;
  const keys = await jobImageKeys(householdId, job.id);

  let coverKey: string | null = null;
  try {
    if (cover === "replace") {
      const file = formData.get("cover");
      if (file instanceof File && file.size > 0) coverKey = await saveCoverPhoto(householdId, file);
    } else if (cover === "choice:thumbnail" && job.thumbnailUrl) {
      const image = await safeFetch(job.thumbnailUrl, { timeoutMs: 15_000, maxBytes: 10 * 1024 * 1024 });
      if (image.status === 200) coverKey = await saveCoverPhotoBytes(householdId, image.body);
    } else if (cover.startsWith("choice:image-")) {
      const key = keys[Number(cover.slice("choice:image-".length))];
      if (key) coverKey = await saveCoverPhotoBytes(householdId, await getObjectBytes(BUCKETS.imports, key));
    }
  } catch (err) {
    if (err instanceof PhotoError && cover === "replace") return { fieldErrors: { cover: err.message } };
    // A cover that can't be fetched shouldn't block saving the recipe.
    console.warn(`[import ${job.id}] cover failed`, err);
  }

  let recipeId: string;
  try {
    recipeId = await createRecipe({
      householdId,
      userId: user.id,
      draft,
      sourceUrl: source_url ?? job.sourceUrl,
      sourceType: job.sourceType,
      coverImageKey: coverKey,
    });
  } catch (err) {
    await deleteCoverPhoto(coverKey);
    throw err;
  }
  await finishJob(job.id, keys, { status: "approved", recipeId });
  revalidatePath("/recipes");
  revalidatePath("/import");
  redirect(`/recipes/${recipeId}`);
}

const TokenName = z.string().trim().min(1, "Name it after your phone").max(60, "Keep it under 60 characters");

/** createImportToken (F1): the full token is returned once and never stored. */
export async function createImportTokenAction(name: string): Promise<{ token?: string; summary?: TokenSummary; error?: string }> {
  const { user, membership } = await requireHousehold();
  const parsed = TokenName.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const created = await createToken(membership.householdId, user.id, parsed.data);
  revalidatePath("/settings");
  return created;
}

export async function revokeImportTokenAction(tokenId: string): Promise<void> {
  const { user, membership } = await requireHousehold();
  await revokeToken(membership.householdId, user.id, tokenId);
  revalidatePath("/settings");
}
