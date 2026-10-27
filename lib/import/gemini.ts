import "server-only";
import { createPartFromUri, GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { AiRecipe, checkAiOutput, EXTRACTION_PROMPT, retryNote, type StoredDraft } from "@/lib/import/ai";
import { ReadError } from "@/lib/import/claude";

// Instagram and TikTok: video and caption read together by Gemini (PRD 7.3).
// The video goes through the Files API and is deleted afterwards.

let client: GoogleGenAI | undefined;
function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({
    apiKey,
    // 120 s per call (PRD 7.6). GEMINI_BASE_URL is only for pointing tests at a stand-in.
    httpOptions: { timeout: 120_000, ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}) },
  });
  return client;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

const RESPONSE_SCHEMA = z.toJSONSchema(AiRecipe);

async function waitUntilActive(ai: GoogleGenAI, name: string, jobId: string): Promise<{ uri: string; mimeType: string } | null> {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const file = await ai.files.get({ name });
    if (file.state === "ACTIVE" && file.uri && file.mimeType) return { uri: file.uri, mimeType: file.mimeType };
    if (file.state === "FAILED" || Date.now() > deadline) {
      console.warn(`[import ${jobId}] gemini file ${name} ended ${file.state}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Reads a social post. With no usable video it reads the caption alone and
 * notes that amounts need checking (PRD 7.3).
 */
export async function readSocialWithGemini(
  input: { video: { bytes: Uint8Array; mimeType: string } | null; caption: string; creator: string | null },
  jobId: string,
): Promise<{ draft: StoredDraft; model: string; videoRead: boolean }> {
  const ai = gemini();
  const model = geminiModel();
  let uploadedName: string | null = null;
  let videoPart: Part | null = null;

  try {
    if (input.video) {
      const uploaded = await ai.files.upload({
        file: new Blob([Buffer.from(input.video.bytes)], { type: input.video.mimeType }),
        config: { mimeType: input.video.mimeType },
      });
      uploadedName = uploaded.name ?? null;
      const active = uploadedName ? await waitUntilActive(ai, uploadedName, jobId) : null;
      if (active) videoPart = createPartFromUri(active.uri, active.mimeType);
    }

    const intro = [
      videoPart ? "The video and its caption are one recipe post." : "Only the caption of this recipe post is available.",
      input.creator ? `Posted by ${input.creator}.` : "",
      `Caption:\n${input.caption || "(no caption)"}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const parts: Part[] = videoPart ? [videoPart, { text: intro }] : [{ text: intro }];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: EXTRACTION_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
        },
      });
      console.info(`[import ${jobId}] gemini ${model} attempt ${attempt} in ${Date.now() - started} ms`);
      let raw: unknown = null;
      try {
        raw = JSON.parse(response.text ?? "");
      } catch {
        // falls through to the retry
      }
      const checked = raw ? checkAiOutput(raw) : { ok: false as const, problems: "The answer wasn't valid JSON." };
      if (checked.ok) {
        const draft = videoPart
          ? checked.draft
          : { ...checked.draft, notes: [checked.draft.notes, "Couldn't read the video; check amounts."].filter(Boolean).join("\n") };
        return { draft, model, videoRead: Boolean(videoPart) };
      }
      console.warn(`[import ${jobId}] gemini output failed validation: ${checked.problems}`);
      parts.push({ text: retryNote(checked.problems) });
    }
    throw new ReadError("Couldn't read this recipe.");
  } finally {
    // Videos are never kept (PRD 12).
    if (uploadedName) await ai.files.delete({ name: uploadedName }).catch((err) => console.warn(`[import ${jobId}] gemini delete failed`, err));
  }
}
