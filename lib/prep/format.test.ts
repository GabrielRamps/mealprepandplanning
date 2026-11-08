import { describe, expect, it } from "vitest";
import { seedFixture } from "@/lib/prep/fixtures";
import { formatCooked, formatMoney, formatOunces, formatRaw, formatShort, formatWeight, parseAmount } from "@/lib/prep/format";

const f = seedFixture(0);

describe("weights", () => {
  it("lb to the nearest ¼ from about a pound, grams below", () => {
    expect(formatWeight(794)).toBe("1¾ lb");
    expect(formatWeight(1361)).toBe("3 lb");
    expect(formatWeight(3176)).toBe("7 lb");
    expect(formatWeight(2779)).toBe("6¼ lb");
    expect(formatWeight(170)).toBe("170 g");
    expect(formatWeight(198)).toBe("200 g");
    expect(formatWeight(2)).toBe("5 g");
  });
  it("oz to the nearest ¼", () => {
    expect(formatOunces(170.1)).toBe("6 oz");
    expect(formatOunces(127.5)).toBe("4½ oz");
    expect(formatOunces(120)).toBe("4¼ oz");
  });
  it("shortfalls", () => {
    expect(formatShort(57)).toBe("≈ 2 oz short");
    expect(formatShort(10)).toBe("≈ ½ oz short");
  });
  it("money", () => {
    expect(formatMoney(1197)).toBe("$11.97");
    expect(formatMoney(18600)).toBe("$186.00");
  });
});

describe("cooked display (Today)", () => {
  it("proteins in cooked oz", () => {
    const d = formatCooked(f.food("Chicken breast"), 227);
    expect(d.text).toBe("6 oz cooked chicken breast");
    expect(d.amount).toBe("6 oz cooked");
    expect(d.spoken).toBe("6 ounces cooked chicken breast");
    expect(formatCooked(f.food("Chicken breast"), 170).text).toBe("4½ oz cooked chicken breast");
    expect(formatCooked(f.food("Chicken breast"), 170).spoken).toBe("4 and a half ounces cooked chicken breast");
  });
  it("starches in cooked grams to 5 g", () => {
    expect(formatCooked(f.food("Sweet potatoes"), 294).text).toBe("250 g cooked sweet potatoes");
    expect(formatCooked(f.food("Russet potatoes"), 118).text).toBe("100 g cooked russet potatoes");
  });
  it("counts", () => {
    expect(formatCooked(f.food("Eggs"), 3).text).toBe("3 eggs");
    expect(formatCooked(f.food("Eggs"), 1).text).toBe("1 egg");
    expect(formatCooked(f.food("Bananas"), 0.5).text).toBe("½ banana");
    // 0.27 of a pepper isn't a nice count: grams instead.
    expect(formatCooked(f.food("Bell peppers"), 0.27).text).toBe("41 g bell peppers");
  });
  it("cups where a cup size is known, else grams", () => {
    expect(formatCooked(f.food("Liquid egg whites"), 243).text).toBe("1 cup liquid egg whites");
    expect(formatCooked(f.food("Frozen green beans"), 180).text).toBe("1½ cups frozen green beans");
    expect(formatCooked(f.food("Old-fashioned oats"), 10).text).toBe("⅛ cup old-fashioned oats");
    expect(formatCooked(f.food("Whey protein"), 30).text).toBe("30 g whey protein");
  });
});

describe("raw display (lists and tasks)", () => {
  it("weights, counts and batch cups", () => {
    expect(formatRaw(f.food("Chicken breast"), 794)).toBe("1¾ lb chicken breast");
    expect(formatRaw(f.food("Eggs"), 6)).toBe("6 eggs");
    expect(formatRaw(f.food("Liquid egg whites"), 729, { cups: true })).toBe("3 cups liquid egg whites");
  });
});

describe("parseAmount", () => {
  const breast = f.food("Chicken breast");
  it("6 oz cooked chicken is stored as 227 g raw", () => {
    expect(parseAmount("6 oz cooked", breast)).toEqual({ amount: 226.8 });
  });
  it("g, oz and lb", () => {
    expect(parseAmount("227", breast)).toEqual({ amount: 227 });
    expect(parseAmount("227 g", breast)).toEqual({ amount: 227 });
    expect(parseAmount("8 oz", breast)).toEqual({ amount: 226.8 });
    expect(parseAmount("3 lb", breast)).toEqual({ amount: 1360.78 });
  });
  it("counts for count foods, grams converted", () => {
    expect(parseAmount("3", f.food("Eggs"))).toEqual({ amount: 3 });
    expect(parseAmount("40 g", f.food("Bell peppers"))).toEqual({ amount: 0.27 });
    expect("error" in parseAmount("3 ct", breast)).toBe(true);
  });
  it("cups need a cup size", () => {
    expect(parseAmount("1 cup", f.food("Liquid egg whites"))).toEqual({ amount: 243 });
    expect("error" in parseAmount("1 cup", breast)).toBe(true);
    expect("error" in parseAmount("lots", breast)).toBe(true);
  });
});
