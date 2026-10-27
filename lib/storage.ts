import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Bucket names match neon.ts.
export const BUCKETS = {
  photos: "recipe-photos", // public_read
  imports: "imports", // private
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

// Neon injects AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3
// and AWS_REGION, which the SDK reads from the environment. Neon requires
// path-style addressing.
let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({ forcePathStyle: true });
  return client;
}

function endpoint(): string {
  const url = process.env.AWS_ENDPOINT_URL_S3;
  if (!url) throw new Error("AWS_ENDPOINT_URL_S3 is not set");
  return url.replace(/\/+$/, "");
}

export async function putObject(
  bucket: BucketName,
  key: string,
  body: Uint8Array | Buffer | string,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

export async function getObjectBytes(bucket: BucketName, key: string): Promise<Uint8Array> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty object: ${bucket}/${key}`);
  return res.Body.transformToByteArray();
}

export async function deleteObjects(bucket: BucketName, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await s3().send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}

/** Time-limited GET link for a private object. */
export function presignedGetUrl(bucket: BucketName, key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

/** Anonymous URL for an object in the public_read photos bucket. */
export function publicPhotoUrl(key: string): string {
  return `${endpoint()}/${BUCKETS.photos}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
