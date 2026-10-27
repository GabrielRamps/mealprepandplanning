// Display text for import jobs (C4 history, review status).
import type { RecipeSource } from "@/lib/enums";

export type JobStatus = "queued" | "fetching" | "reading" | "ready" | "failed" | "approved" | "discarded";

export const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Waiting",
  fetching: "Fetching",
  reading: "Reading",
  ready: "Ready to review",
  failed: "Failed",
  approved: "Saved",
  discarded: "Discarded",
};

export const IN_PROGRESS: JobStatus[] = ["queued", "fetching", "reading"];

/** "instagram.com", "3 photos", "Pasted text". */
export function jobSourceLabel(job: { sourceType: RecipeSource; sourceUrl: string | null; imageCount: number }): string {
  if (job.sourceType === "text") return "Pasted text";
  if (job.sourceType === "image") return job.imageCount ? `${job.imageCount} photo${job.imageCount === 1 ? "" : "s"}` : "Photos";
  try {
    return new URL(job.sourceUrl ?? "").hostname.replace(/^(www|m)\./, "");
  } catch {
    return job.sourceType;
  }
}
