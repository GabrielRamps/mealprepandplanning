import { cleanupOldUploads } from "@/lib/import/jobs";
import { cleanupOldReceipts } from "@/lib/prep/receipts";

/**
 * Daily (vercel.json): deletes import uploads and receipt photos left after 7
 * days (PRD 12, PRD-prep P-11). Vercel sends CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cleaned = await cleanupOldUploads();
  const receipts = await cleanupOldReceipts();
  return Response.json({ cleaned, receipts });
}
