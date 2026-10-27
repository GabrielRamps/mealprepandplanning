import "server-only";
import { BUCKETS, deleteObjects, publicPhotoUrl, putObject } from "@/lib/storage";

// The browser already shrinks photos to 1600 px JPEG (PRD 3); this is the
// server-side cap, under Vercel's 4.5 MB request limit.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export class PhotoError extends Error {}

/** Stores a cover photo as WebP, max 1200 px wide (PRD 3), and returns its key. */
export async function saveCoverPhoto(householdId: string, file: File): Promise<string> {
  if (!ACCEPTED.has(file.type)) throw new PhotoError("Use a JPEG, PNG, WebP or HEIC photo.");
  if (file.size > MAX_UPLOAD_BYTES) throw new PhotoError("That photo is too large. Try a smaller one.");
  return saveCoverPhotoBytes(householdId, Buffer.from(await file.arrayBuffer()));
}

/** Same, from bytes already in hand (an import's photo or the post's thumbnail). */
export async function saveCoverPhotoBytes(householdId: string, bytes: Uint8Array): Promise<string> {
  // Loaded here so pages that only show photos don't pay for it.
  const { default: sharp } = await import("sharp");
  let webp: Buffer;
  try {
    webp = await sharp(bytes)
      .rotate() // respect EXIF orientation from phone cameras
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new PhotoError("Couldn't read that photo. Try a different one.");
  }

  // Unique key per upload, so the public URL can be cached forever.
  const key = `households/${householdId}/recipes/${crypto.randomUUID()}.webp`;
  await putObject(BUCKETS.photos, key, webp, "image/webp", "public, max-age=31536000, immutable");
  return key;
}

export async function deleteCoverPhoto(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await deleteObjects(BUCKETS.photos, [key]);
  } catch (err) {
    // A leftover photo costs a little storage; it shouldn't fail the save.
    console.error("Couldn't delete cover photo", key, err);
  }
}

export function coverUrl(key: string | null): string | null {
  return key ? publicPhotoUrl(key) : null;
}
