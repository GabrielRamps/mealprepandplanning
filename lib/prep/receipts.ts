import "server-only";
import { and, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { after } from "next/server";
import { atomic, getDb, schema } from "@/lib/db";
import { ReadError, readReceiptWithClaude } from "@/lib/import/claude";
import type { ReceiptLine } from "@/lib/import/receipt-ai";
import { isUuid } from "@/lib/library-filters";
import { localToday } from "@/lib/plan/week";
import { BUCKETS, deleteObjects, getObjectBytes, putObject } from "@/lib/storage";

// Receipt scan (PRD-prep P-11, 10): store the photos privately, read them with
// Claude after the response, then apply the prices the person ticks.

const { receiptScans, coreFoods, coreFoodPrices } = schema;

export const MAX_RECEIPT_IMAGES = 4;
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;
const SCANS_PER_HOUR = 20;
const READ_TIMEOUT_MS = 60_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const FAILED = "Couldn't read that receipt — try a clearer photo.";

export class ScanError extends Error {}

export type Scan = {
  id: string;
  status: "processing" | "ready" | "failed";
  store: string | null;
  lines: ReceiptLine[];
  receiptTotalCents: number | null;
  error: string | null;
  createdAt: Date;
  appliedAt: Date | null;
};

function toScan(r: typeof receiptScans.$inferSelect): Scan {
  return {
    id: r.id,
    status: r.status,
    store: r.store,
    lines: (r.lines as ReceiptLine[] | null) ?? [],
    receiptTotalCents: r.receiptTotalCents,
    error: r.error,
    createdAt: r.createdAt,
    appliedAt: r.appliedAt,
  };
}

export async function getScan(householdId: string, scanId: string): Promise<Scan | null> {
  if (!isUuid(scanId)) return null;
  const [row] = await getDb()
    .select()
    .from(receiptScans)
    .where(and(eq(receiptScans.id, scanId), eq(receiptScans.householdId, householdId)))
    .limit(1);
  return row ? toScan(row) : null;
}

export async function recentScans(householdId: string): Promise<Scan[]> {
  const rows = await getDb().select().from(receiptScans).where(eq(receiptScans.householdId, householdId)).orderBy(desc(receiptScans.createdAt)).limit(10);
  return rows.map(toScan);
}

/** startReceiptScan: 1–4 photos, stored as JPEG under receipts/{householdId}/{scanId}/, read after the response. */
export async function startReceiptScan(householdId: string, userId: string, files: File[]): Promise<string> {
  const images = files.filter((f) => f.size > 0);
  if (images.length === 0 || images.length > MAX_RECEIPT_IMAGES) throw new ScanError(`Add 1 to ${MAX_RECEIPT_IMAGES} photos.`);
  if (images.some((f) => !IMAGE_TYPES.has(f.type))) throw new ScanError("Use JPEG, PNG, WebP or HEIC photos.");
  if (images.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) throw new ScanError("Those photos are too large; try fewer.");
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(receiptScans)
    .where(and(eq(receiptScans.householdId, householdId), gte(receiptScans.createdAt, new Date(Date.now() - 3_600_000))));
  if (n >= SCANS_PER_HOUR) throw new ScanError("Scan limit reached; try again in an hour.");

  const scanId = crypto.randomUUID();
  await db.insert(receiptScans).values({ id: scanId, householdId, imageKeys: [], createdBy: userId });
  try {
    const { default: sharp } = await import("sharp");
    const keys: string[] = [];
    for (const [i, file] of images.entries()) {
      const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const key = `receipts/${householdId}/${scanId}/${i}.jpg`;
      await putObject(BUCKETS.imports, key, jpeg, "image/jpeg");
      keys.push(key);
    }
    await db.update(receiptScans).set({ imageKeys: keys }).where(eq(receiptScans.id, scanId));
  } catch (err) {
    console.error(`[receipt ${scanId}] storing images failed`, err);
    await db.update(receiptScans).set({ status: "failed", error: FAILED }).where(eq(receiptScans.id, scanId));
    return scanId;
  }
  after(() => processScan(scanId));
  return scanId;
}

/** Reads a stored scan; any failure (or 60 s passing) marks it failed. */
export async function processScan(scanId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(receiptScans).where(eq(receiptScans.id, scanId)).limit(1);
  if (!row || row.status !== "processing") return;
  try {
    const foods = await db
      .select({ id: coreFoods.id, name: coreFoods.name, walmartName: coreFoods.walmartName, packageLabel: coreFoods.packageLabel })
      .from(coreFoods)
      .where(and(eq(coreFoods.householdId, row.householdId), isNull(coreFoods.deletedAt)));
    const images = await Promise.all(
      row.imageKeys.map(async (key) => ({ data: Buffer.from(await getObjectBytes(BUCKETS.imports, key)).toString("base64"), mediaType: "image/jpeg" as const })),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ReadError("timed out")), READ_TIMEOUT_MS);
    });
    const { output, model } = await Promise.race([readReceiptWithClaude(images, foods, scanId), timeout]).finally(() => clearTimeout(timer));
    await db
      .update(receiptScans)
      .set({ status: "ready", model, store: output.store, lines: output.lines, receiptTotalCents: output.receipt_total_cents, error: null })
      .where(eq(receiptScans.id, scanId));
  } catch (err) {
    console.error(`[receipt ${scanId}] reading failed`, err);
    await db.update(receiptScans).set({ status: "failed", error: FAILED }).where(eq(receiptScans.id, scanId));
  }
}

export type ApplyLine = { lineIndex: number; coreFoodId: string; packagePriceCents: number; packageAmount: number };

/** applyReceiptScan (P-11): the ticked lines' foods get the new price, with history; the scan is marked applied. */
export async function applyReceiptScan(householdId: string, userId: string, scanId: string, lines: ApplyLine[]): Promise<number> {
  const scan = await getScan(householdId, scanId);
  if (!scan) throw new ScanError("That scan is gone.");
  if (scan.status !== "ready") throw new ScanError("That scan isn't ready.");
  if (scan.appliedAt) throw new ScanError("These prices were already applied.");
  const foods = await getDb()
    .select({ id: coreFoods.id })
    .from(coreFoods)
    .where(and(eq(coreFoods.householdId, householdId), isNull(coreFoods.deletedAt)));
  const known = new Set(foods.map((f) => f.id));
  // One price per food: the last ticked line wins.
  const byFood = new Map<string, ApplyLine>();
  for (const l of lines) {
    if (!known.has(l.coreFoodId) || !scan.lines[l.lineIndex]) throw new ScanError("One of those foods isn't on your menu anymore.");
    byFood.set(l.coreFoodId, l);
  }
  const now = new Date();
  const today = localToday();
  await atomic((q) => [
    ...[...byFood.values()].flatMap((l) => [
      q
        .update(coreFoods)
        .set({ packagePriceCents: l.packagePriceCents, packageAmount: l.packageAmount, priceIsEstimate: false, priceUpdatedAt: now, updatedAt: now })
        .where(and(eq(coreFoods.id, l.coreFoodId), eq(coreFoods.householdId, householdId))),
      q.insert(coreFoodPrices).values({
        coreFoodId: l.coreFoodId,
        priceCents: l.packagePriceCents,
        packageAmount: l.packageAmount,
        source: "receipt" as const,
        receiptScanId: scanId,
        observedOn: today,
        createdBy: userId,
      }),
    ]),
    q.update(receiptScans).set({ appliedAt: now }).where(and(eq(receiptScans.id, scanId), eq(receiptScans.householdId, householdId))),
  ]);
  return byFood.size;
}

/** Daily cleanup: receipt photos older than 7 days (P-11). */
export async function cleanupOldReceipts(): Promise<number> {
  const db = getDb();
  const stale = await db
    .select({ id: receiptScans.id, keys: receiptScans.imageKeys })
    .from(receiptScans)
    .where(and(lt(receiptScans.createdAt, new Date(Date.now() - 7 * 86_400_000)), ne(receiptScans.imageKeys, sql`'{}'::text[]`)))
    .limit(500);
  for (const s of stale) {
    await deleteObjects(BUCKETS.imports, s.keys);
    await db.update(receiptScans).set({ imageKeys: [] }).where(eq(receiptScans.id, s.id));
  }
  return stale.length;
}
