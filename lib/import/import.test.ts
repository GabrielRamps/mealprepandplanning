import { describe, expect, it } from "vitest";
import { classifyUrl, extractFirstUrl, readImportBody } from "./detect";
import { findRecipeJsonLd, recipeImage, visibleText } from "./jsonld";
import { isPrivateAddress } from "./safe-fetch";

describe("classifyUrl (PRD 7.2)", () => {
  it.each([
    ["https://www.instagram.com/reel/ABC123/?igsh=xyz", { type: "instagram", url: "https://www.instagram.com/p/ABC123/" }],
    ["https://instagram.com/p/Cx-9_k/", { type: "instagram", url: "https://www.instagram.com/p/Cx-9_k/" }],
    ["https://www.instagram.com/reels/ZZZ/", { type: "instagram", url: "https://www.instagram.com/p/ZZZ/" }],
    ["https://www.instagram.com/janecooks/reel/ABC/", { type: "instagram", url: "https://www.instagram.com/p/ABC/" }],
    ["https://www.tiktok.com/@jane.cooks/video/7398101551744552225?lang=en", { type: "tiktok", url: "https://www.tiktok.com/@jane.cooks/video/7398101551744552225", short: false }],
    ["https://vm.tiktok.com/ZMabc123/", { type: "tiktok", url: "https://vm.tiktok.com/ZMabc123/", short: true }],
    ["https://www.instagram.com/janecooks/", { type: "website", url: "https://www.instagram.com/janecooks/" }],
    ["https://cooking.example.com/r/123#comments", { type: "website", url: "https://cooking.example.com/r/123" }],
  ])("%s", (url, expected) => {
    expect(classifyUrl(url)).toEqual(expected);
  });

  it.each(["ftp://x.com/a", "javascript:alert(1)", "not a url", "file:///etc/passwd"])("rejects %s", (url) => {
    expect(classifyUrl(url)).toBeNull();
  });
});

describe("Shortcut tolerance (PRD 10.1)", () => {
  it("takes url as a string or one-item array", () => {
    expect(readImportBody({ url: ["https://www.instagram.com/reel/A1/"] })).toEqual({
      kind: "link",
      source: { type: "instagram", url: "https://www.instagram.com/p/A1/" },
    });
    expect(readImportBody({ url: "https://site.example/r" })).toMatchObject({ kind: "link", source: { type: "website" } });
  });

  it("pulls a link out of shared text", () => {
    expect(extractFirstUrl("Check out this reel… https://www.instagram.com/reel/A1/?igsh=2).")).toBe(
      "https://www.instagram.com/reel/A1/?igsh=2",
    );
    expect(readImportBody({ text: "Check out this reel https://www.instagram.com/reel/A1/" })).toMatchObject({
      kind: "link",
      source: { type: "instagram" },
    });
    expect(readImportBody({ url: "Look: https://vt.tiktok.com/ZS1/" })).toMatchObject({ kind: "link", source: { type: "tiktok", short: true } });
  });

  it("treats text without a link, or a long pasted recipe, as text", () => {
    expect(readImportBody({ text: "2 eggs\n1 cup flour\nMix." })).toEqual({ kind: "text", text: "2 eggs\n1 cup flour\nMix." });
    const long = `Pancakes\n${"1 cup flour\n".repeat(60)}From https://example.com/pancakes`;
    expect(readImportBody({ text: long })).toMatchObject({ kind: "text" });
  });

  it("rejects empty or oversized requests", () => {
    expect(readImportBody({})).toEqual({ error: "Unsupported link or empty request" });
    expect(readImportBody(null)).toEqual({ error: "Unsupported link or empty request" });
    expect(readImportBody({ url: "ftp://nope" })).toEqual({ error: "Unsupported link or empty request" });
    expect(readImportBody({ text: "x".repeat(20_001) })).toHaveProperty("error");
  });
});

describe("website JSON-LD", () => {
  const recipe = { "@type": ["Recipe", "NewsArticle"], name: "Soup", image: [{ "@type": "ImageObject", url: "https://img.example/soup.jpg" }] };

  it("finds a Recipe in @graph among other blocks, skipping bad JSON", () => {
    const html = `
      <script type="application/ld+json">{not json}</script>
      <script type="application/ld+json">{"@type":"WebSite","name":"x"}</script>
      <script type='application/ld+json'>{"@context":"https://schema.org","@graph":[{"@type":"Person"},${JSON.stringify(recipe)}]}</script>`;
    expect(findRecipeJsonLd(html)).toEqual(recipe);
    expect(recipeImage(recipe)).toBe("https://img.example/soup.jpg");
  });

  it("finds a Recipe in a top-level array", () => {
    const html = `<script type="application/ld+json">[{"@type":"Organization"},{"@type":"Recipe","name":"Tacos","image":"https://i.example/t.png"}]</script>`;
    const found = findRecipeJsonLd(html)!;
    expect(found.name).toBe("Tacos");
    expect(recipeImage(found)).toBe("https://i.example/t.png");
  });

  it("returns null without one", () => {
    expect(findRecipeJsonLd("<html><body>no recipe</body></html>")).toBeNull();
  });

  it("extracts visible text without scripts, nav or footer", () => {
    const html = `<html><head><style>p{}</style><script>var x=1</script></head><body>
      <nav>Home | About</nav><h1>Best &amp; Easy Soup</h1><p>2 cups&nbsp;broth</p><footer>© Site</footer></body></html>`;
    expect(visibleText(html)).toBe("Best & Easy Soup\n2 cups broth");
    expect(visibleText("<p>abcdef</p>", 3)).toBe("abc");
  });
});

describe("private address guard (PRD 12)", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.16.0.1", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["224.0.0.1", true],
    ["8.8.8.8", false],
    ["::1", true],
    ["::", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:8.8.8.8", false],
    ["2606:4700::1111", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe("AI output checks (PRD 7.4, 7.6)", async () => {
  const { checkAiOutput } = await import("./ai");
  const base = {
    no_recipe_found: false,
    title: "Soup",
    description: null,
    servings: 4,
    prep_minutes: 5,
    cook_minutes: 20,
    ingredients: [
      { section: null, raw_text: "2-3 cloves garlic", quantity: 2, quantity_max: 3, unit: "clove", name: "garlic", prep_note: null, is_optional: false, aisle: "produce" },
    ],
    steps: [{ section: null, text: "Simmer." }],
    tags: ["Dinner"],
    creator_name: null,
    creator_handle: null,
    conflicts: [],
    confidence: "high",
    notes: null,
  };

  it("accepts a good recipe", () => {
    expect(checkAiOutput(base)).toMatchObject({ ok: true, draft: { title: "Soup" } });
  });

  it("tidies slips instead of failing", () => {
    const r = checkAiOutput({
      ...base,
      servings: 0,
      tags: ["a", "b", "c", "d", "e", "f"],
      ingredients: [{ ...base.ingredients[0], quantity: 3, quantity_max: 2 }, { ...base.ingredients[0], name: " " }],
      steps: [{ section: null, text: "" }, { section: null, text: "Go." }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.servings).toBe(4); // 0 means unknown
      expect(r.draft.tags).toHaveLength(5);
      expect(r.draft.ingredients).toHaveLength(1);
      expect(r.draft.ingredients[0].quantity_max).toBeNull();
      expect(r.draft.steps).toHaveLength(1);
    }
  });

  it("passes 'no recipe found' through without recipe rules", () => {
    const r = checkAiOutput({ ...base, no_recipe_found: true, title: "", ingredients: [], steps: [] });
    expect(r).toMatchObject({ ok: true, draft: { no_recipe_found: true } });
  });

  it("reports what's wrong for the retry", () => {
    const r = checkAiOutput({ ...base, title: "", ingredients: [{ ...base.ingredients[0], unit: "handful" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toMatch(/unit/);
    const r2 = checkAiOutput({ ...base, title: "" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.problems).toMatch(/title/i);
  });
});
