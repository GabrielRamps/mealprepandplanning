// What an import is (PRD 7.2) and what the Shortcut may send (PRD 10.1).

export const MAX_IMPORT_TEXT = 20_000;

export type LinkSource =
  | { type: "instagram"; url: string }
  | { type: "tiktok"; url: string; short: boolean }
  | { type: "website"; url: string };

/** Classifies an http(s) link; null for anything else. Instagram links are normalized to /p/{code}/. */
export function classifyUrl(raw: string): LinkSource | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");

  if (host === "instagram.com") {
    const m = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    if (m) return { type: "instagram", url: `https://www.instagram.com/p/${m[2]}/` };
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return { type: "tiktok", url: `https://${host}${u.pathname}`, short: true };
  }
  if (host === "tiktok.com") {
    const m = u.pathname.match(/^\/(@[\w.-]+)\/video\/(\d+)/);
    if (m) return { type: "tiktok", url: `https://www.tiktok.com/${m[1]}/video/${m[2]}`, short: false };
  }
  u.hash = "";
  return { type: "website", url: u.toString() };
}

/** The first http(s) link in shared text ("Check out this reel… https://…"). */
export function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return m ? m[0].replace(/[).,!?;:'"\]]+$/, "") : null;
}

export type ImportRequest = { kind: "link"; source: LinkSource } | { kind: "text"; text: string };

/**
 * Reads a JSON import body: `url` as a string or one-item array; `text`
 * holding a link counts as that link; otherwise `text` is the recipe text.
 */
export function readImportBody(body: unknown): ImportRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Unsupported link or empty request" };
  const b = body as Record<string, unknown>;
  const rawUrl = Array.isArray(b.url) ? b.url[0] : b.url;
  if (typeof rawUrl === "string" && rawUrl.trim()) {
    const source = classifyUrl(extractFirstUrl(rawUrl) ?? rawUrl);
    return source ? { kind: "link", source } : { error: "Unsupported link or empty request" };
  }
  if (typeof b.text === "string" && b.text.trim()) {
    const text = b.text.trim();
    const link = extractFirstUrl(text);
    const source = link ? classifyUrl(link) : null;
    // A short share message with a link is the link; a pasted recipe that mentions a link stays text.
    if (source && text.length < 500) return { kind: "link", source };
    if (text.length > MAX_IMPORT_TEXT) return { error: "Text is too long (20,000 characters at most)" };
    return { kind: "text", text };
  }
  return { error: "Unsupported link or empty request" };
}
