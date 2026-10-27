// RecipeDraft (PRD 7.4): one schema for AI output, the recipe editor and
// saving. snake_case matches the JSON the models return.
import { z } from "zod";
import { AISLES } from "@/lib/enums";
import { UNIT_CODES } from "@/lib/units";

export const MAX_TAGS = 5;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));

const minutes = z.number().int().min(0, "Can't be negative").max(10_000).nullable();

export const DraftIngredient = z
  .object({
    section: optionalText(60),
    raw_text: z.string().trim().max(300),
    quantity: z.number().positive().max(100_000).nullable(),
    quantity_max: z.number().positive().max(100_000).nullable(),
    unit: z.enum(UNIT_CODES).nullable(),
    name: z.string().trim().min(1, "Enter an ingredient").max(120, "Keep it under 120 characters"),
    prep_note: optionalText(200),
    is_optional: z.boolean(),
    aisle: z.enum(AISLES).nullable(),
  })
  .refine((i) => i.quantity_max === null || (i.quantity !== null && i.quantity_max > i.quantity), {
    message: "The top of a range must be bigger than the bottom",
    path: ["quantity_max"],
  });

export const DraftStep = z.object({
  section: optionalText(60),
  text: z.string().trim().min(1, "Write the step or remove it").max(2000),
});

export const RecipeDraft = z.object({
  no_recipe_found: z.boolean().default(false),
  title: z.string().trim().min(1, "Give the recipe a title").max(200, "Keep the title under 200 characters"),
  description: optionalText(2000),
  servings: z.number().int("Use a whole number").min(1, "At least 1").max(50, "At most 50"),
  prep_minutes: minutes,
  cook_minutes: minutes,
  ingredients: z.array(DraftIngredient).max(100),
  steps: z.array(DraftStep).max(100),
  tags: z
    .array(z.string().trim().min(1).max(40, "Tags are at most 40 characters"))
    .max(MAX_TAGS, `At most ${MAX_TAGS} tags`),
  creator_name: optionalText(120),
  creator_handle: optionalText(120),
  conflicts: z
    .array(
      z.object({
        field: z.string(),
        caption_value: z.string().nullable(),
        video_value: z.string().nullable(),
        chosen: z.string(),
      }),
    )
    .default([]),
  confidence: z.enum(["high", "medium", "low"]).default("high"),
  notes: optionalText(5000),
});

export type RecipeDraft = z.infer<typeof RecipeDraft>;
export type RecipeDraftInput = z.input<typeof RecipeDraft>;
export type DraftIngredient = z.infer<typeof DraftIngredient>;

// Words that look plural but aren't, or whose singular isn't regular.
const PLURAL_EXCEPTIONS: Record<string, string> = {
  molasses: "molasses",
  hummus: "hummus",
  couscous: "couscous",
  asparagus: "asparagus",
  oats: "oats",
  grits: "grits",
  greens: "greens",
  brussels: "brussels",
  swiss: "swiss",
  bitters: "bitters",
  cookies: "cookie",
  leaves: "leaf",
  halves: "half",
  loaves: "loaf",
  knives: "knife",
};

/** Singular of the last word: "onions" → "onion", "berries" → "berry", "tomatoes" → "tomato". */
export function singularize(word: string): string {
  if (word in PLURAL_EXCEPTIONS) return PLURAL_EXCEPTIONS[word];
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("oes")) return word.slice(0, -2);
  if (/(ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Lowercase, single-spaced, singular: the canonical ingredient name (PRD 6). */
export function canonicalName(name: string): string {
  const words = name.trim().toLowerCase().replace(/\s+/g, " ").split(" ");
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(" ");
}

/** Case-insensitive de-duplication, keeping the first spelling (PRD B6). */
export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ");
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

/** "https://…" or null; anything else isn't a link we can open. */
export const SourceUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((s) => s || null)
  .nullable()
  .refine((s) => s === null || /^https?:\/\/\S+$/i.test(s), "Use a full link starting with https://");
