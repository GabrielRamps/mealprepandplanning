import "server-only";
import { readWithClaude, ReadError } from "@/lib/import/claude";
import { readSocialWithGemini } from "@/lib/import/gemini";
import { loadJobRow, updateJob } from "@/lib/import/jobs";
import { findRecipeJsonLd, recipeImage, visibleText } from "@/lib/import/jsonld";
import { FetchBlockedError, FetchTooLargeError, safeFetch } from "@/lib/import/safe-fetch";
import { fetchInstagram, fetchTikTok } from "@/lib/import/social";
import { classifyUrl } from "@/lib/import/detect";
import { BUCKETS, getObjectBytes } from "@/lib/storage";

class ImportError extends Error {}

/**
 * Runs one import (PRD 7.1): fetching → reading → ready, or failed with a
 * plain message. Called after the 202 response, and again on Retry.
 */
export async function processJob(jobId: string): Promise<void> {
  const job = await loadJobRow(jobId);
  if (!job || (job.status !== "queued" && job.status !== "failed")) return;
  await updateJob(jobId, { status: "fetching", attempts: job.attempts + 1, error: null });
  const started = Date.now();

  try {
    let result: { draft: Awaited<ReturnType<typeof readWithClaude>>["draft"]; model: string };
    switch (job.sourceType) {
      case "text": {
        await updateJob(jobId, { status: "reading" });
        result = await readWithClaude({ kind: "text", text: job.captionText ?? "" }, jobId);
        break;
      }
      case "image": {
        const images = await Promise.all(
          job.imageKeys.map(async (key) => ({
            data: Buffer.from(await getObjectBytes(BUCKETS.imports, key)).toString("base64"),
            mediaType: "image/jpeg" as const,
          })),
        );
        if (images.length === 0) throw new ImportError("The photos didn't upload. Try adding them again.");
        await updateJob(jobId, { status: "reading" });
        result = await readWithClaude({ kind: "images", images }, jobId);
        break;
      }
      case "website": {
        const page = await safeFetch(job.sourceUrl!, { timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024 });
        if (page.status >= 400) throw new ImportError(`That page didn't load (error ${page.status}). Check the link, or use a screenshot.`);
        const html = page.body.toString("utf8");
        const jsonLd = findRecipeJsonLd(html);
        await updateJob(jobId, { status: "reading", thumbnailUrl: jsonLd ? recipeImage(jsonLd) : null });
        result = await readWithClaude({ kind: "webpage", url: page.url, jsonLd, text: jsonLd ? null : visibleText(html) }, jobId);
        break;
      }
      case "tiktok":
      case "instagram": {
        const link = classifyUrl(job.sourceUrl!);
        const fetched =
          job.sourceType === "tiktok" && link?.type === "tiktok"
            ? await fetchTikTok(link.url, link.short, jobId)
            : { post: await fetchInstagram(job.sourceUrl!, jobId), url: job.sourceUrl! };
        const { post } = fetched;
        if (!post.caption && !post.video) throw new ImportError("Couldn't reach this post. Try a screenshot instead.");
        await updateJob(jobId, {
          status: "reading",
          sourceUrl: fetched.url,
          captionText: post.caption || null,
          thumbnailUrl: post.thumbnailUrl,
        });
        const read = await readSocialWithGemini({ video: post.video, caption: post.caption, creator: post.creatorHandle ?? post.creatorName }, jobId);
        result = {
          draft: { ...read.draft, creator_name: read.draft.creator_name ?? post.creatorName, creator_handle: read.draft.creator_handle ?? post.creatorHandle },
          model: read.model,
        };
        break;
      }
      default:
        throw new ImportError("This kind of import isn't supported.");
    }

    await updateJob(jobId, { status: "ready", draft: result.draft, model: result.model, error: null });
    console.info(`[import ${jobId}] ready in ${Date.now() - started} ms`);
  } catch (err) {
    const message =
      err instanceof ImportError || err instanceof ReadError
        ? err.message
        : err instanceof FetchBlockedError
          ? "That link can't be opened from here. Try a screenshot instead."
          : err instanceof FetchTooLargeError
            ? "That page is too large to read. Try a screenshot instead."
            : err instanceof Error && err.name === "TimeoutError"
              ? "That took too long. Try again, or use a screenshot."
              : "Couldn't import this. Try again, or use a screenshot.";
    console.error(`[import ${jobId}] failed after ${Date.now() - started} ms`, err);
    await updateJob(jobId, { status: "failed", error: message });
  }
}
