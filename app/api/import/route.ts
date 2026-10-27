import { getSessionUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/household";
import { readImportBody } from "@/lib/import/detect";
import { startImageImport, startImport, type StartResult } from "@/lib/import/start";
import { authenticateToken } from "@/lib/import/tokens";

// Imports read video with Gemini and can run for minutes after the 202 (PRD 7.1).
export const maxDuration = 300;

/** Session cookie, or `Authorization: Bearer mpt_…` from the iPhone Shortcut (PRD 9.1). */
async function caller(request: Request): Promise<{ householdId: string; userId: string } | null> {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return authenticateToken(auth.slice(7).trim());
  const user = await getSessionUser();
  if (!user) return null;
  const membership = await getMembership(user.id);
  return membership ? { householdId: membership.householdId, userId: user.id } : null;
}

export async function POST(request: Request) {
  const who = await caller(request);
  if (!who) return Response.json({ error: "Sign in or use a valid import token" }, { status: 401 });

  let result: StartResult;
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return Response.json({ error: "Unsupported link or empty request" }, { status: 400 });
    const images = form.getAll("images").filter((v): v is File => v instanceof File);
    if (images.length) result = await startImageImport(who, images);
    else {
      const parsed = readImportBody({ url: form.get("url"), text: form.get("text") });
      if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
      result = await startImport(who, parsed);
    }
  } else {
    const parsed = readImportBody(await request.json().catch(() => null));
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    result = await startImport(who, parsed);
  }

  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  const origin = process.env.APP_URL || new URL(request.url).origin;
  return Response.json(
    { jobId: result.jobId, status: "queued", reviewUrl: `${origin}/import/${result.jobId}` },
    { status: 202 },
  );
}
