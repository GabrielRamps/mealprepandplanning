import { cleanupOldUploads } from "@/lib/import/jobs";

/** Daily (vercel.json): deletes import uploads left after 7 days (PRD 12). Vercel sends CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cleaned = await cleanupOldUploads();
  return Response.json({ cleaned });
}
