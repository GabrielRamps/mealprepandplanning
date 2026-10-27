// Browser-side photo shrinking before upload (PRD 3): longest side at most
// 1600 px, JPEG at quality 0.8, so requests stay well under 4.5 MB.
export async function resizeImage(file: File, maxSize = 1600, quality = 0.8): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // a format this browser can't decode; the server will try
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob ? new File([blob], "cover.jpg", { type: "image/jpeg" }) : file;
}
