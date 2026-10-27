import "server-only";
import { ApifyClient } from "apify-client";
import { safeFetch, resolveRedirects } from "@/lib/import/safe-fetch";

// Fetching Instagram and TikTok posts (PRD 7.3).
//
// Apify actor fields, checked against the actor pages:
// - maximedupre/tiktok-video-downloader: input { videoUrls: [{ url }], mediaMode: "video" };
//   output items { mediaUrl, caption, authorUsername, authorName, coverUrl, contentType }.
//   mediaUrl expires quickly, so it's downloaded straight away.
// - apify/instagram-scraper: input { directUrls: [url], resultsType: "posts", resultsLimit: 1 };
//   output items { type, caption, ownerUsername, ownerFullName, videoUrl, displayUrl }.

export type SocialPost = {
  caption: string;
  creatorName: string | null;
  creatorHandle: string | null;
  thumbnailUrl: string | null;
  video: { bytes: Uint8Array; mimeType: string } | null;
};

const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

let apify: ApifyClient | undefined;
function apifyClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  apify ??= new ApifyClient({ token, maxRetries: 1, ...(process.env.APIFY_BASE_URL ? { baseUrl: process.env.APIFY_BASE_URL } : {}) });
  return apify;
}

/** Runs an actor and returns its dataset items; 90 s limit (PRD 7.6). */
async function runActor(actorId: string, input: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const client = apifyClient();
  // log: null skips streaming the actor's run log into our server logs.
  const run = await client.actor(actorId).call(input, { waitSecs: 90, timeout: 90, log: null });
  if (run.status !== "SUCCEEDED") throw new Error(`Apify ${actorId} ended ${run.status}`);
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 5 });
  return items as Record<string, unknown>[];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function download(url: string, jobId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  try {
    const res = await safeFetch(url, { timeoutMs: 60_000, maxBytes: MAX_VIDEO_BYTES });
    if (res.status !== 200 || res.body.length === 0) return null;
    const mimeType = res.contentType.split(";")[0].trim() || "video/mp4";
    return { bytes: res.body, mimeType: mimeType.startsWith("video/") ? mimeType : "video/mp4" };
  } catch (err) {
    console.warn(`[import ${jobId}] video download failed`, err);
    return null;
  }
}

/** TikTok: caption from oEmbed (no key), video from Apify. Short links are followed first. */
export async function fetchTikTok(url: string, short: boolean, jobId: string): Promise<{ post: SocialPost; url: string }> {
  const canonical = short ? await resolveRedirects(url) : url;

  let caption = "";
  let creatorName: string | null = null;
  let creatorHandle: string | null = null;
  let thumbnailUrl: string | null = null;
  try {
    const res = await safeFetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`, { timeoutMs: 15_000, maxBytes: 1024 * 1024 });
    if (res.status === 200) {
      const o = JSON.parse(res.body.toString("utf8")) as Record<string, unknown>;
      caption = str(o.title) ?? "";
      creatorName = str(o.author_name);
      creatorHandle = str(o.author_unique_id) ? `@${str(o.author_unique_id)}` : null;
      thumbnailUrl = str(o.thumbnail_url);
    }
  } catch (err) {
    console.warn(`[import ${jobId}] tiktok oembed failed`, err);
  }

  let video: SocialPost["video"] = null;
  try {
    const [item] = await runActor(process.env.APIFY_TIKTOK_ACTOR || "maximedupre/tiktok-video-downloader", {
      videoUrls: [{ url: canonical }],
      mediaMode: "video",
    });
    if (item) {
      caption ||= str(item.caption) ?? "";
      creatorName ??= str(item.authorName);
      creatorHandle ??= str(item.authorUsername) ? `@${str(item.authorUsername)}` : null;
      thumbnailUrl ??= str(item.coverUrl);
      const mediaUrl = str(item.mediaUrl);
      if (mediaUrl) video = await download(mediaUrl, jobId);
    }
  } catch (err) {
    console.warn(`[import ${jobId}] tiktok apify failed`, err);
  }

  return { post: { caption, creatorName, creatorHandle, thumbnailUrl, video }, url: canonical };
}

/** Pulls caption text out of Instagram's embed HTML (the oEmbed fallback). */
export function captionFromEmbed(html: string): string {
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return m ? m[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() : "";
}

/** Instagram: everything from Apify; Meta's oEmbed for author and caption if Apify fails. */
export async function fetchInstagram(url: string, jobId: string): Promise<SocialPost> {
  try {
    const [item] = await runActor(process.env.APIFY_INSTAGRAM_ACTOR || "apify/instagram-scraper", {
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
    });
    if (item) {
      const videoUrl = str(item.videoUrl);
      return {
        caption: str(item.caption) ?? "",
        creatorName: str(item.ownerFullName),
        creatorHandle: str(item.ownerUsername) ? `@${str(item.ownerUsername)}` : null,
        thumbnailUrl: str(item.displayUrl),
        video: videoUrl ? await download(videoUrl, jobId) : null,
      };
    }
  } catch (err) {
    console.warn(`[import ${jobId}] instagram apify failed`, err);
  }

  try {
    const res = await safeFetch(`https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(url)}`, {
      timeoutMs: 15_000,
      maxBytes: 1024 * 1024,
    });
    if (res.status === 200) {
      const o = JSON.parse(res.body.toString("utf8")) as Record<string, unknown>;
      return {
        caption: captionFromEmbed(str(o.html) ?? ""),
        creatorName: str(o.author_name),
        creatorHandle: str(o.author_name) ? `@${str(o.author_name)}` : null,
        thumbnailUrl: str(o.thumbnail_url),
        video: null,
      };
    }
  } catch (err) {
    console.warn(`[import ${jobId}] instagram oembed failed`, err);
  }
  return { caption: "", creatorName: null, creatorHandle: null, thumbnailUrl: null, video: null };
}
