import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiRecipe, checkAiOutput, EXTRACTION_PROMPT, retryNote, type StoredDraft } from "@/lib/import/ai";

// Websites, screenshots, recipe-card photos and pasted text go to Claude
// (PRD 3, 7.3). Model from ANTHROPIC_MODEL, default Claude Haiku 5.5.

export class ReadError extends Error {}

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  // 60 s per call (PRD 7.6); one SDK retry for 429/5xx/connection errors.
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return client;
}

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
}

export type ClaudeSource =
  | { kind: "images"; images: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }[] }
  | { kind: "text"; text: string }
  | { kind: "webpage"; url: string; jsonLd: Record<string, unknown> | null; text: string | null };

function sourceContent(source: ClaudeSource): Anthropic.ContentBlockParam[] {
  switch (source.kind) {
    case "images":
      return [
        ...source.images.map(
          (img): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }),
        ),
        {
          type: "text",
          text: `These ${source.images.length === 1 ? "image is" : `${source.images.length} images are`} one recipe (screenshots, a recipe card or cookbook pages). Extract it.`,
        },
      ];
    case "text":
      return [{ type: "text", text: `Recipe text:\n\n${source.text}` }];
    case "webpage":
      return [
        {
          type: "text",
          text: source.jsonLd
            ? `Recipe JSON-LD from ${source.url}:\n\n${JSON.stringify(source.jsonLd)}`
            : `Visible text of ${source.url}:\n\n${source.text ?? ""}`,
        },
      ];
  }
}

/** One extraction, retried once with the validation errors (PRD 7.6). */
export async function readWithClaude(source: ClaudeSource, jobId: string): Promise<{ draft: StoredDraft; model: string }> {
  const model = claudeModel();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: sourceContent(source) }];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const response = await anthropic().messages.parse({
      model,
      max_tokens: 16000,
      system: EXTRACTION_PROMPT,
      messages,
      output_config: { format: zodOutputFormat(AiRecipe) },
    });
    console.info(`[import ${jobId}] claude ${model} attempt ${attempt}: ${response.stop_reason} in ${Date.now() - started} ms`);

    if (response.stop_reason === "refusal") throw new ReadError("Couldn't read this recipe.");
    const checked = response.parsed_output
      ? checkAiOutput(response.parsed_output)
      : { ok: false as const, problems: "The answer wasn't valid JSON for the schema." };
    if (checked.ok) return { draft: checked.draft, model };

    console.warn(`[import ${jobId}] claude output failed validation: ${checked.problems}`);
    messages.push({ role: "assistant", content: response.content }, { role: "user", content: retryNote(checked.problems) });
  }
  throw new ReadError("Couldn't read this recipe.");
}
