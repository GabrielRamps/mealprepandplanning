// Ingredient amounts: parsing what people type, scaling for servings, and
// showing friendly fractions (PRD B3).
import { type UnitCode, unitLabel } from "@/lib/units";

type Fraction = { value: number; glyph: string; typed: string };

const FRACTIONS: Fraction[] = [
  { value: 1 / 8, glyph: "⅛", typed: "1/8" },
  { value: 1 / 4, glyph: "¼", typed: "1/4" },
  { value: 1 / 3, glyph: "⅓", typed: "1/3" },
  { value: 3 / 8, glyph: "⅜", typed: "3/8" },
  { value: 1 / 2, glyph: "½", typed: "1/2" },
  { value: 5 / 8, glyph: "⅝", typed: "5/8" },
  { value: 2 / 3, glyph: "⅔", typed: "2/3" },
  { value: 3 / 4, glyph: "¾", typed: "3/4" },
  { value: 7 / 8, glyph: "⅞", typed: "7/8" },
];

const TOLERANCE = 0.02;

/** Splits n into a whole part and the nearest listed fraction, if one is close. */
function split(n: number): { whole: number; fraction: Fraction | null; exact: boolean } {
  const whole = Math.floor(n + TOLERANCE);
  const rest = n - whole;
  if (Math.abs(rest) < TOLERANCE) return { whole, fraction: null, exact: true };
  const fraction = FRACTIONS.find((f) => Math.abs(rest - f.value) < TOLERANCE) ?? null;
  return { whole, fraction, exact: fraction !== null };
}

/** One number: "2", "1.5", "1/2", "1 1/2", "1½", "½". Null if unreadable. */
function parseNumber(text: string): number | null {
  const s = text.trim().replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2");
  const parts = s.split(/\s+/);
  if (s === "" || parts.length > 2) return null;
  let total = 0;
  for (const part of parts) {
    const glyph = FRACTIONS.find((f) => f.glyph === part);
    if (glyph) total += glyph.value;
    else if (/^\d+\/\d+$/.test(part)) {
      const [n, d] = part.split("/").map(Number);
      if (d === 0) return null;
      total += n / d;
    } else if (/^\d*\.?\d+$/.test(part)) total += Number(part);
    else return null;
  }
  return total;
}

export type ParsedQuantity = { quantity: number | null; quantityMax: number | null };

/**
 * Reads an amount as typed: "" (no amount, e.g. "salt to taste"), a single
 * number, or a range "2-3" / "2 to 3". Returns null when it can't be read.
 */
export function parseQuantity(text: string): ParsedQuantity | null {
  const s = text.trim().replace(/[–—]/g, "-");
  if (s === "") return { quantity: null, quantityMax: null };
  const range = s.split(/\s*(?:-|\bto\b)\s*/i);
  if (range.length > 2) return null;
  const quantity = parseNumber(range[0]);
  if (quantity === null || quantity <= 0) return null;
  if (range.length === 1) return { quantity, quantityMax: null };
  const quantityMax = parseNumber(range[1]);
  if (quantityMax === null || quantityMax <= quantity) return null;
  return { quantity, quantityMax };
}

/** 1.5 → "1½", 0.333 → "⅓", 2.4 → "2.4", 675 → "675". */
export function formatNumber(n: number): string {
  const { whole, fraction, exact } = split(n);
  if (!exact) return String(n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);
  if (!fraction) return String(whole);
  return whole === 0 ? fraction.glyph : `${whole}${fraction.glyph}`;
}

/** The amount as people type it back into the editor: "1 1/2", "2-3". */
export function quantityToInput(quantity: number | null, quantityMax: number | null): string {
  const typed = (n: number) => {
    const { whole, fraction, exact } = split(n);
    if (!exact) return String(Math.round(n * 1000) / 1000);
    if (!fraction) return String(whole);
    return whole === 0 ? fraction.typed : `${whole} ${fraction.typed}`;
  };
  if (quantity === null) return "";
  return quantityMax === null ? typed(quantity) : `${typed(quantity)}-${typed(quantityMax)}`;
}

/** "1½ cups", "2–3 cloves", "3" (count), "" when there's no amount. */
export function formatAmount(
  quantity: number | null,
  quantityMax: number | null,
  unit: UnitCode | null,
  factor = 1,
): string {
  if (quantity === null) return "";
  const q = quantity * factor;
  const max = quantityMax === null ? null : quantityMax * factor;
  const amount = max === null ? formatNumber(q) : `${formatNumber(q)}–${formatNumber(max)}`;
  return unit ? `${amount} ${unitLabel(unit, max ?? q)}` : amount;
}

/** Text saved as raw_text for hand-typed rows: "2 cloves garlic, minced". */
export function ingredientText(row: {
  quantity: number | null;
  quantityMax: number | null;
  unit: UnitCode | null;
  name: string;
  prepNote: string | null;
}): string {
  const amount = formatAmount(row.quantity, row.quantityMax, row.unit);
  const base = amount ? `${amount} ${row.name}` : row.name;
  return row.prepNote ? `${base}, ${row.prepNote}` : base;
}
