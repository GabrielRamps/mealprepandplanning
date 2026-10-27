import "server-only";
import { after } from "next/server";
import type { ImportRequest } from "@/lib/import/detect";
import { createJob, IMPORTS_PER_HOUR, importsInLastHour, MAX_IMAGE_UPLOAD_BYTES, MAX_IMAGES, storeImages, updateJob } from "@/lib/import/jobs";
import { processJob } from "@/lib/import/process";

// Starting an import (PRD 9.1), shared by POST /api/import (the Shortcut) and
// the Import screen. Processing runs after the response with after().

export type StartResult = { jobId: string } | { error: string; status: 400 | 413 | 429 };

type Who = { householdId: string; userId: string };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

async function overLimit(householdId: string): Promise<StartResult | null> {
  return (await importsInLastHour(householdId)) >= IMPORTS_PER_HOUR
    ? { error: "Import limit reached; try again in an hour", status: 429 }
    : null;
}

export async function startImport(who: Who, request: ImportRequest): Promise<StartResult> {
  const limited = await overLimit(who.householdId);
  if (limited) return limited;
  const jobId =
    request.kind === "text"
      ? await createJob({ ...who, sourceType: "text", text: request.text })
      : await createJob({ ...who, sourceType: request.source.type, sourceUrl: request.source.url });
  after(() => processJob(jobId));
  return { jobId };
}

export async function startImageImport(who: Who, files: File[]): Promise<StartResult> {
  const images = files.filter((f) => f.size > 0);
  if (images.length === 0 || images.length > MAX_IMAGES) return { error: `Add 1 to ${MAX_IMAGES} photos`, status: 400 };
  if (images.some((f) => !IMAGE_TYPES.has(f.type))) return { error: "Use JPEG, PNG, WebP or HEIC photos", status: 400 };
  if (images.reduce((n, f) => n + f.size, 0) > MAX_IMAGE_UPLOAD_BYTES) {
    return { error: "Images too large; resize and try again", status: 413 };
  }
  const limited = await overLimit(who.householdId);
  if (limited) return limited;

  const jobId = await createJob({ ...who, sourceType: "image" });
  try {
    await storeImages(who.householdId, jobId, images);
  } catch (err) {
    console.error(`[import ${jobId}] storing images failed`, err);
    await updateJob(jobId, { status: "failed", error: "Couldn't read those photos. Try different ones." });
    return { jobId };
  }
  after(() => processJob(jobId));
  return { jobId };
}
