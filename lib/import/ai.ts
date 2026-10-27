// What both models are asked for (PRD 7.4, 7.5) and how their output becomes
// a RecipeDraft. No SDK code here, so it's shared and unit-tested.
import { z } from "zod";
import { AISLES } from "@/lib/enums";
import { MAX_TAGS, RecipeDraft } from "@/lib/recipe-draft";
import { UNIT_CODES } from "@/lib/units";

/** The JSON shape the models must return: plain types only, so it maps to a JSON schema cleanly. */
export const AiRecipe = z.object({
  no_recipe_found: z.boolean(),
  title: z.string(),
  description: z.string().nullable(),
  servings: z.number(),
  prep_minutes: z.number().nullable(),
  cook_minutes: z.number().nullable(),
  ingredients: z.array(
    z.object({
      section: z.string().nullable(),
      raw_text: z.string(),
      quantity: z.number().nullable(),
      quantity_max: z.number().nullable(),
      unit: z.enum(UNIT_CODES).nullable(),
      name: z.string(),
      prep_note: z.string().nullable(),
      is_optional: z.boolean(),
      aisle: z.enum(AISLES),
    }),
  ),
  steps: z.array(z.object({ section: z.string().nullable(), text: z.string() })),
  tags: z.array(z.string()),
  creator_name: z.string().nullable(),
  creator_handle: z.string().nullable(),
  conflicts: z.array(
    z.object({
      field: z.string(),
      caption_value: z.string().nullable(),
      video_value: z.string().nullable(),
      chosen: z.enum(["caption", "video"]),
    }),
  ),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().nullable(),
});
export type AiRecipe = z.infer<typeof AiRecipe>;

export const EXTRACTION_PROMPT = `You turn one recipe source into JSON for a household meal planner.

Rules:
- Extract only what the source states. Never invent ingredients, amounts or steps.
- Unstated amount: quantity null, keep the words in raw_text ("salt to taste").
- Convert fractions and unicode fractions to decimals (½ → 0.5). Ranges like "2-3" go to quantity 2 and quantity_max 3.
- When you get both a video and its caption: merge them into one recipe. Where they disagree, pick the more specific value and record the disagreement in conflicts (field, caption_value, video_value, chosen).
- Ignore hashtags, promotions, discount codes, "link in bio" and calls to follow or comment.
- If the recipe is withheld ("comment RECIPE and I'll DM you") or there is no recipe, set no_recipe_found to true and leave ingredients and steps empty.
- If servings aren't stated, estimate them from the quantities and set confidence to medium or low.

Fields:
- unit is one of the allowed unit codes, or null for plain counts ("2 eggs").
- name is lowercase and singular, without prep words ("garlic", not "minced garlic cloves"); prep words go to prep_note.
- aisle is the grocery store aisle for the ingredient.
- section groups ingredients or steps under a heading such as "Sauce", else null.
- tags: at most ${MAX_TAGS} short ones, such as "Dinner", "Chicken", "Quick".
- creator_name and creator_handle: the cook or account credited, if stated.
- notes: anything a cook should know that isn't a step, else null.`;

/** Fixes harmless slips (too many tags, a reversed range) so they don't fail validation. */
export function tidyAiRecipe(ai: AiRecipe): AiRecipe {
  return {
    ...ai,
    servings: Math.min(50, Math.max(1, Math.round(ai.servings || 4))),
    prep_minutes: ai.prep_minutes === null ? null : Math.max(0, Math.round(ai.prep_minutes)),
    cook_minutes: ai.cook_minutes === null ? null : Math.max(0, Math.round(ai.cook_minutes)),
    ingredients: ai.ingredients
      .filter((i) => i.name.trim())
      .map((i) => {
        const quantity = i.quantity !== null && i.quantity > 0 ? i.quantity : null;
        const max = i.quantity_max !== null && quantity !== null && i.quantity_max > quantity ? i.quantity_max : null;
        return { ...i, quantity, quantity_max: max };
      }),
    steps: ai.steps.filter((s) => s.text.trim()),
    tags: ai.tags.map((t) => t.trim()).filter(Boolean).slice(0, MAX_TAGS),
  };
}

export type StoredDraft = z.input<typeof RecipeDraft>;

export type AiResult = { ok: true; draft: StoredDraft } | { ok: false; problems: string };

/**
 * Model output → draft. "No recipe found" is a valid answer and skips the
 * recipe rules; anything else must pass RecipeDraft (PRD 7.6).
 */
export function checkAiOutput(raw: unknown): AiResult {
  const shape = AiRecipe.safeParse(raw);
  if (!shape.success) return { ok: false, problems: z.prettifyError(shape.error) };
  const ai = tidyAiRecipe(shape.data);
  if (ai.no_recipe_found) return { ok: true, draft: { ...ai, title: ai.title || "No recipe found", ingredients: [], steps: [] } };
  const draft = RecipeDraft.safeParse(ai);
  if (!draft.success) return { ok: false, problems: z.prettifyError(draft.error) };
  return { ok: true, draft: ai };
}

/** Second attempt after a failed validation (PRD 7.6): same request plus what was wrong. */
export function retryNote(problems: string): string {
  return `Your previous answer didn't pass validation:\n${problems}\nReturn the corrected JSON for the same recipe.`;
}
