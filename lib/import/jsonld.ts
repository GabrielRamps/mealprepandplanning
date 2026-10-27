// Website import (PRD 7.3): the schema.org Recipe JSON-LD if the page has
// one, else its visible text.

const SCRIPT_RE = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

function isRecipe(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !node || typeof node !== "object") return null;
  if (isRecipe(node)) return node;
  const children = Array.isArray(node) ? node : [(node as Record<string, unknown>)["@graph"], (node as Record<string, unknown>).mainEntity];
  for (const child of children) {
    const found = findRecipe(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The first Recipe object in the page's JSON-LD, searching arrays and @graph. */
export function findRecipeJsonLd(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(SCRIPT_RE)) {
    const raw = match[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    try {
      const found = findRecipe(JSON.parse(raw));
      if (found) return found;
    } catch {
      // Malformed JSON-LD is common; try the next block.
    }
  }
  return null;
}

/** The recipe's image: a string, an array, or an ImageObject. */
export function recipeImage(recipe: Record<string, unknown>): string | null {
  const pick = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(pick).find(Boolean) ?? null;
    if (v && typeof v === "object") return pick((v as Record<string, unknown>).url ?? (v as Record<string, unknown>).contentUrl);
    return null;
  };
  const url = pick(recipe.image);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Readable page text without scripts, styles, navigation or footer, capped (PRD 7.3). */
export function visibleText(html: string, max = 30_000): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|nav|footer|header|svg|iframe|form)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max);
}
