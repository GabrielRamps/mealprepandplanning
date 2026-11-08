import { describe, expect, it } from "vitest";
import { checkReceiptOutput, type ReceiptLine, scanTotal, suggestPackagePrice } from "./receipt-ai";

const BREAST = "6f1d6c64-2b61-4a3e-9a5f-4f0b8f2a1c01";
const EGGS = "6f1d6c64-2b61-4a3e-9a5f-4f0b8f2a1c02";
const ids = new Set([BREAST, EGGS]);

const line = (l: Partial<ReceiptLine>): ReceiptLine => ({
  raw_text: "ITEM",
  quantity: 1,
  size_text: null,
  size_grams: null,
  size_count: null,
  weighed: false,
  unit_price_cents: 0,
  line_total_cents: 0,
  core_food_id: null,
  confidence: "high",
  ...l,
});

const breast = { unitKind: "weight" as const, gramsPerCount: null, packageAmount: 1361, packagePriceCents: 1197 };
const eggs = { unitKind: "count" as const, gramsPerCount: 50, packageAmount: 18, packagePriceCents: 347 };

describe("checkReceiptOutput", () => {
  it("drops ids that aren't this household's foods", () => {
    const out = checkReceiptOutput(
      { store: "Walmart", receipt_total_cents: 2000, lines: [line({ raw_text: "CHKN BRST", core_food_id: "not-ours", unit_price_cents: 1197, line_total_cents: 1197 })] },
      ids,
    );
    expect(out.ok && out.output.lines[0].core_food_id).toBeNull();
  });

  it("keeps known ids", () => {
    const out = checkReceiptOutput({ store: null, receipt_total_cents: null, lines: [line({ core_food_id: BREAST, unit_price_cents: 1, line_total_cents: 1 })] }, ids);
    expect(out.ok && out.output.lines[0].core_food_id).toBe(BREAST);
  });

  it("weighed items: the unit price is the line total", () => {
    const out = checkReceiptOutput(
      { store: null, receipt_total_cents: null, lines: [line({ raw_text: "BANANAS 2.31 lb @ $0.50/lb", weighed: true, size_grams: 1048, unit_price_cents: 50, line_total_cents: 116 })] },
      ids,
    );
    expect(out.ok && out.output.lines[0].unit_price_cents).toBe(116);
  });

  it("multi-quantity lines get a per-unit price", () => {
    const out = checkReceiptOutput(
      { store: null, receipt_total_cents: null, lines: [line({ raw_text: "2 @ GV BROCCOLI", quantity: 2, unit_price_cents: 276, line_total_cents: 276 })] },
      ids,
    );
    expect(out.ok && out.output.lines[0]).toMatchObject({ quantity: 2, unit_price_cents: 138, line_total_cents: 276 });
  });

  it("a savings line comes off the item above", () => {
    const out = checkReceiptOutput(
      {
        store: null,
        receipt_total_cents: null,
        lines: [
          line({ raw_text: "GV CHKN BRST 3LB", core_food_id: BREAST, size_grams: 1361, unit_price_cents: 1197, line_total_cents: 1197 }),
          line({ raw_text: "ROLLBACK SAVINGS", unit_price_cents: 200, line_total_cents: 200 }),
        ],
      },
      ids,
    );
    expect(out.ok && out.output.lines).toHaveLength(1);
    expect(out.ok && out.output.lines[0]).toMatchObject({ unit_price_cents: 997, line_total_cents: 997 });
  });

  it("rejects the wrong shape", () => {
    expect(checkReceiptOutput({ lines: "nope" }, ids).ok).toBe(false);
  });
});

describe("suggestPackagePrice", () => {
  it("same size within 10%: the unit price", () => {
    expect(suggestPackagePrice(line({ size_grams: 1361, unit_price_cents: 1097 }), breast)).toMatchObject({ packagePriceCents: 1097, basis: "same size", warning: null });
    expect(suggestPackagePrice(line({ size_grams: 1250, unit_price_cents: 1097 }), breast).basis).toBe("same size");
  });
  it("weighed: scaled from price per lb", () => {
    const s = suggestPackagePrice(line({ weighed: true, size_grams: 907, unit_price_cents: 800 }), breast);
    expect(s).toMatchObject({ basis: "scaled from price per lb", packagePriceCents: Math.round((800 / 907) * 1361), packageAmount: 1361 });
  });
  it("no size: keeps the food's package", () => {
    expect(suggestPackagePrice(line({ unit_price_cents: 1250 }), breast)).toMatchObject({ packagePriceCents: 1250, packageAmount: 1361, basis: "no size on the line" });
  });
  it("different size warns, at the line's size", () => {
    const s = suggestPackagePrice(line({ size_grams: 2268, unit_price_cents: 1888 }), breast);
    expect(s.warning).toBe("Different size: 5 lb vs 3 lb");
    expect(s.packageAmount).toBe(2268);
  });
  it("count foods compare counts", () => {
    expect(suggestPackagePrice(line({ size_count: 18, unit_price_cents: 397 }), eggs).basis).toBe("same size");
    expect(suggestPackagePrice(line({ size_count: 12, unit_price_cents: 297 }), eggs)).toMatchObject({ warning: "Different size: 12 ct vs 18 ct", packageAmount: 12 });
  });
  it("scan total sums the lines", () => {
    expect(scanTotal([{ line_total_cents: 100 }, { line_total_cents: 250 }])).toBe(350);
  });
});
