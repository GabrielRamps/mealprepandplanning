// "Copy list" (PRD-prep P-8): any list as plain text, grouped by aisle in the
// household's order, for pasting into notes or a store's search.
import type { Aisle } from "@/lib/enums";
import { groupItems } from "@/lib/grocery/build";
import { formatAmount } from "@/lib/quantity";
import type { UnitCode } from "@/lib/units";

export type CopyItem = {
  name: string;
  quantity: number | null;
  unit: UnitCode | null;
  note: string | null;
  aisle: Aisle;
  isPantry: boolean;
  isChecked: boolean;
};

/** "Chicken breast — 3 lb family pack × 2"; other items read as on screen: "2 lb apples". */
export function itemLine(item: CopyItem): string {
  if (item.unit === "package" && item.note) {
    const pack = item.note.split(" · ")[0];
    return `${item.name} — ${pack}${item.quantity !== null ? ` × ${item.quantity}` : ""}`;
  }
  const amount = item.quantity !== null ? `${formatAmount(item.quantity, null, item.unit)} ` : "";
  return `${amount}${item.name}${item.note ? ` (${item.note})` : ""}`;
}

export function listAsText(name: string, items: CopyItem[], aisleOrder: readonly Aisle[]): string {
  const lines = [name];
  for (const group of groupItems(items, aisleOrder)) {
    lines.push("", group.label);
    for (const item of group.items) lines.push(`${item.isChecked ? "✓" : "-"} ${itemLine(item)}`);
  }
  return lines.join("\n");
}
