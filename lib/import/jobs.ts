import "server-only";
import { and, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { RecipeSource } from "@/lib/enums";
import type { StoredDraft } from "@/lib/import/ai";
import { isUuid } from "@/lib/library-filters";
import { BUCKETS, deleteObjects, putObject } from "@/lib/storage";

const { importJobs, recipes } = schema;

export const IMPORTS_PER_HOUR = 20;
export const MAX_ATTEMPTS = 3;
export const MAX_IMAGES = 6;
export const MAX_IMAGE_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export type ImportStatus = (typeof schema.importStatus.enumValues)[number];

export type ImportJob = {
  id: string;
  status: ImportStatus;
  sourceType: RecipeSource;
  sourceUrl: string | null;
  error: string | null;
  attempts: number;
  draft: StoredDraft | null;
  thumbnailUrl: string | null;
  imageCount: number;
  recipeId: string | null;
  createdAt: Date;
};

type Row = typeof importJobs.$inferSelect;

function toJob(row: Row): ImportJob {
  return {
    id: row.id,
    status: row.status,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    error: row.error,
    attempts: row.attempts,
    draft: (row.draft as StoredDraft | null) ?? null,
    thumbnailUrl: row.thumbnailUrl,
    imageCount: row.imageKeys.length,
    recipeId: row.recipeId,
    createdAt: row.createdAt,
  };
}

/** Rate limit (PRD 12): imports started in the last hour. */
export async function importsInLastHour(householdId: string): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(importJobs)
    .where(and(eq(importJobs.householdId, householdId), gte(importJobs.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  return n;
}

export async function createJob(input: {
  householdId: string;
  userId: string;
  sourceType: RecipeSource;
  sourceUrl?: string | null;
  text?: string | null;
}): Promise<string> {
  const [row] = await getDb()
    .insert(importJobs)
    .values({
      householdId: input.householdId,
      createdBy: input.userId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      captionText: input.text ?? null,
    })
    .returning({ id: importJobs.id });
  return row.id;
}

/** Stores uploaded images as JPEG (HEIC converted, max 1600 px) in the private imports bucket (PRD 9.2 keys). */
export async function storeImages(householdId: string, jobId: string, files: File[]): Promise<string[]> {
  const { default: sharp } = await import("sharp");
  const keys: string[] = [];
  for (const [n, file] of files.entries()) {
    const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const key = `households/${householdId}/imports/${jobId}/${n}.jpg`;
    await putObject(BUCKETS.imports, key, jpeg, "image/jpeg");
    keys.push(key);
  }
  await getDb().update(importJobs).set({ imageKeys: keys, updatedAt: new Date() }).where(eq(importJobs.id, jobId));
  return keys;
}

/** The full row, for processing (no household filter: callers already hold the id). */
export async function loadJobRow(jobId: string): Promise<Row | null> {
  const [row] = await getDb().select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
  return row ?? null;
}

export async function getJob(householdId: string, jobId: string): Promise<ImportJob | null> {
  if (!isUuid(jobId)) return null;
  const [row] = await getDb()
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.householdId, householdId)))
    .limit(1);
  return row ? toJob(row) : null;
}

/** Image keys for one job in this household (for the review screen's cover choices). */
export async function jobImageKeys(householdId: string, jobId: string): Promise<string[]> {
  if (!isUuid(jobId)) return [];
  const [row] = await getDb()
    .select({ keys: importJobs.imageKeys })
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.householdId, householdId)))
    .limit(1);
  return row?.keys ?? [];
}

/** Import history (C4): the last 30. */
export async function listJobs(householdId: string): Promise<ImportJob[]> {
  const rows = await getDb()
    .select()
    .from(importJobs)
    .where(eq(importJobs.householdId, householdId))
    .orderBy(desc(importJobs.createdAt))
    .limit(30);
  return rows.map(toJob);
}

export async function updateJob(jobId: string, patch: Partial<typeof importJobs.$inferInsert>): Promise<void> {
  await getDb()
    .update(importJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(importJobs.id, jobId));
}

/** A recipe already in the library from this link (PRD 7.6 duplicate warning). */
export async function duplicateRecipe(householdId: string, sourceUrl: string | null): Promise<{ id: string; title: string } | null> {
  if (!sourceUrl) return null;
  const [row] = await getDb()
    .select({ id: recipes.id, title: recipes.title })
    .from(recipes)
    .where(and(eq(recipes.householdId, householdId), eq(recipes.sourceUrl, sourceUrl), isNull(recipes.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Ends a job (approved or discarded) and deletes its uploaded files (PRD 12). */
export async function finishJob(
  jobId: string,
  keys: string[],
  outcome: { status: "approved"; recipeId: string } | { status: "discarded" },
): Promise<void> {
  await updateJob(jobId, {
    status: outcome.status,
    recipeId: outcome.status === "approved" ? outcome.recipeId : null,
    draft: outcome.status === "discarded" ? null : undefined,
    imageKeys: [],
  });
  await deleteObjects(BUCKETS.imports, keys).catch((err) => console.warn(`[import ${jobId}] file cleanup failed`, err));
}

/** Daily cleanup (PRD 12): uploads older than 7 days, whatever happened to the job. */
export async function cleanupOldUploads(): Promise<number> {
  const db = getDb();
  const stale = await db
    .select({ id: importJobs.id, keys: importJobs.imageKeys })
    .from(importJobs)
    .where(and(lt(importJobs.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), ne(importJobs.imageKeys, sql`'{}'::text[]`)))
    .limit(500);
  for (const job of stale) {
    await deleteObjects(BUCKETS.imports, job.keys);
    await db.update(importJobs).set({ imageKeys: [], updatedAt: new Date() }).where(eq(importJobs.id, job.id));
  }
  return stale.length;
}
