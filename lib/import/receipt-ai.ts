// Receipt and cart-screenshot reading (PRD-prep 10): the JSON Claude must
// return, the prompt, and how its answer is checked and turned into
// suggested package prices. No SDK code here, so it's unit-tested.
import { z } from "zod";

export const ReceiptLine = z.object({
  raw_text: z.string(), // as printed: 'GV BNLS SKNLS CHKN BRST 3LB'
  quantity: z.number(), // units bought
  size_text: z.string().nullable(), // '3 lb', '32 oz', '18 ct', null
  size_grams: z.number().nullable(), // when the size is a weight
  size_count: z.number().nullable(), // for 'ct' items
  weighed: z.boolean(), // sold by weight at the register: '2.31 lb @ $1.27/lb'
  unit_price_cents: z.number(), // price for ONE unit
  line_total_cents: z.number(),
  core_food_id: z.string().nullable(), // best match from the provided list, or null
  confidence: z.enum(["high", "medium", "low"]),
});
export type ReceiptLine = z.infer<typeof ReceiptLine>;

export const ReceiptOutput = z.object({
  store: z.string().nullable(),
  receipt_total_cents: z.number().nullable(),
  lines: z.array(ReceiptLine).max(150),
});
export type ReceiptOutput = z.infer<typeof ReceiptOutput>;

export const RECEIPT_PROMPT = `You read grocery receipts and online cart or order screenshots (mostly Walmart) for a household meal planner, and return their grocery lines as JSON.

Rules:
- Read grocery line items only. Skip tax, fees, tips, bag fees, substitution notes and savings lines, but subtract an item's savings or rollback line from that item's line_total_cents.
- quantity is how many units were bought (default 1). unit_price_cents is the price of ONE unit; line_total_cents is what the line cost after its savings.
- For a weighed item ("2.31 lb @ $1.27/lb"), set weighed to true, size_grams to the weighed amount in grams, quantity to 1 and unit_price_cents to the line total.
- size_text is the package size as printed or shown ("3 lb", "32 oz", "18 ct"), else null. Convert weights to size_grams (1 lb = 453.592 g, 1 oz = 28.3495 g); put counts ("18 ct") in size_count.
- Money is in integer cents.
- The user message lists this household's core foods as "id | name | walmart_name | package_label". Set core_food_id to the id of the food the line is, only from that list, else null. Never invent an id.
- confidence is how sure you are of the line overall.
- Return JSON only.`;

export type FoodForMatch = { id: string; name: string; walmartName: string | null; packageLabel: string };

export function foodList(foods: FoodForMatch[]): string {
  return foods.map((f) => `${f.id} | ${f.name} | ${f.walmartName ?? ""} | ${f.packageLabel}`).join("\n");
}

const SAVINGS = /\b(savings?|you saved|rollback|discount|coupon|price ?cut|markdown)\b/i;

export type CheckedReceipt = { ok: true; output: ReceiptOutput } | { ok: false; problems: string };

/**
 * Model output → lines we trust: valid shape, ids only from this household
 * (anything else becomes null), stray savings lines folded into the item
 * above, and unit prices that agree with the line total.
 */
export function checkReceiptOutput(raw: unknown, foodIds: Set<string>): CheckedReceipt {
  const parsed = ReceiptOutput.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: z.prettifyError(parsed.error) };
  const lines: ReceiptLine[] = [];
  for (const l of parsed.data.lines) {
    const cents = (n: number) => Math.max(0, Math.round(n));
    if (SAVINGS.test(l.raw_text) && lines.length) {
      // A savings line the model kept: take it off the item above.
      const prev = lines[lines.length - 1];
      prev.line_total_cents = Math.max(0, prev.line_total_cents - cents(Math.abs(l.line_total_cents || l.unit_price_cents)));
      prev.unit_price_cents = prev.weighed ? prev.line_total_cents : Math.round(prev.line_total_cents / prev.quantity);
      continue;
    }
    const quantity = l.quantity > 0 ? l.quantity : 1;
    const line_total_cents = cents(l.line_total_cents);
    let unit_price_cents = cents(l.unit_price_cents);
    if (l.weighed) unit_price_cents = line_total_cents;
    else if (line_total_cents > 0 && Math.abs(unit_price_cents * quantity - line_total_cents) > quantity) {
      unit_price_cents = Math.round(line_total_cents / quantity);
    }
    lines.push({
      ...l,
      quantity,
      line_total_cents,
      unit_price_cents,
      size_grams: l.size_grams !== null && l.size_grams > 0 ? l.size_grams : null,
      size_count: l.size_count !== null && l.size_count > 0 ? Math.round(l.size_count) : null,
      core_food_id: l.core_food_id && foodIds.has(l.core_food_id) ? l.core_food_id : null,
    });
  }
  return { ok: true, output: { ...parsed.data, lines } };
}

export function retryNote(problems: string): string {
  return `Your previous answer didn't pass validation:\n${problems}\nReturn the corrected JSON for the same receipt.`;
}

export type PriceFood = { unitKind: "weight" | "count"; gramsPerCount: number | null; packageAmount: number; packagePriceCents: number };

export type Suggestion = {
  /** New package price, in cents. */
  packagePriceCents: number;
  /** Package size the price is for (grams, or count for count foods). */
  packageAmount: number;
  basis: "same size" | "scaled from price per lb" | "no size on the line" | "different size";
  /** "Different size: 5 lb vs 3 lb" (P-11); such lines start unchecked. */
  warning: string | null;
};

const lbText = (g: number) => {
  const lb = g / 453.592;
  return lb >= 1 ? `${Math.round(lb * 100) / 100} lb` : `${Math.round(g / 28.3495)} oz`;
};

/**
 * The suggested package price for a matched line (§10): same size (within
 * 10%) takes the unit price; a weighed item scales its per-gram price to the
 * package; no size keeps the food's package; otherwise it's a different size,
 * offered at the line's own size but unchecked.
 */
export function suggestPackagePrice(line: ReceiptLine, food: PriceFood): Suggestion {
  const pkgG = food.unitKind === "count" ? food.packageAmount * (food.gramsPerCount ?? 0) : food.packageAmount;
  const lineG = line.size_grams ?? (line.size_count && food.unitKind === "count" ? line.size_count * (food.gramsPerCount ?? 0) : null);
  if (line.weighed && line.size_grams) {
    return {
      packagePriceCents: Math.round((line.unit_price_cents / line.size_grams) * pkgG),
      packageAmount: food.packageAmount,
      basis: "scaled from price per lb",
      warning: null,
    };
  }
  if (lineG === null || pkgG <= 0) {
    return { packagePriceCents: line.unit_price_cents, packageAmount: food.packageAmount, basis: "no size on the line", warning: null };
  }
  if (Math.abs(lineG / pkgG - 1) <= 0.1) {
    return { packagePriceCents: line.unit_price_cents, packageAmount: food.packageAmount, basis: "same size", warning: null };
  }
  const amount = food.unitKind === "count" ? Math.round((lineG / (food.gramsPerCount || 1)) * 100) / 100 : Math.round(lineG * 100) / 100;
  const sizes =
    food.unitKind === "count" && line.size_count
      ? `${line.size_count} ct vs ${food.packageAmount} ct`
      : `${lbText(lineG)} vs ${lbText(pkgG)}`;
  return { packagePriceCents: line.unit_price_cents, packageAmount: amount, basis: "different size", warning: `Different size: ${sizes}` };
}

/** Sum of the lines, to show next to the week's estimate (P-11). */
export function scanTotal(lines: Pick<ReceiptLine, "line_total_cents">[]): number {
  return lines.reduce((n, l) => n + l.line_total_cents, 0);
}
