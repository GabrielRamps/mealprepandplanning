"use client";

import { useState } from "react";
import { StatusPill, STATUS_CLASS } from "@/components/prep/bits";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayLabel } from "@/lib/plan/week";
import type { MemberTotals, WeekTotals } from "@/lib/prep/calc";
import { formatMoney } from "@/lib/prep/format";
import { cn } from "@/lib/utils";

const kcal = (n: number) => Math.round(n).toLocaleString("en-US");
const grams = (n: number) => `${Math.round(n)} g`;

/** "$186 · $11 over" or "$162 · $13 under" */
export function costText(t: Pick<WeekTotals, "costCents" | "budgetCents">): string {
  const diff = t.costCents - t.budgetCents;
  const money = (c: number) => formatMoney(c).replace(/\.00$/, "");
  return `${money(t.costCents)} · ${money(Math.abs(diff))} ${diff > 0 ? "over" : "under"}`;
}

function memberText(m: MemberTotals): { kcal: string; protein: string } {
  if (!m.average) return { kcal: "— kcal", protein: "— protein" };
  return { kcal: `${kcal(m.average.kcal)} kcal`, protein: `${grams(m.average.protein)} protein` };
}

/** Sticky above the tab bar (PRD-prep 5): cost vs budget and each member's averages. Tap for the sheet. */
export function SummaryBar({ totals, pending }: { totals: WeekTotals; pending: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t bg-background/95 backdrop-blur print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("mx-auto flex w-full max-w-2xl flex-col gap-1 border-l-4 px-4 py-2 text-left", {
            "border-l-emerald-500": totals.worst === "green",
            "border-l-amber-500": totals.worst === "amber",
            "border-l-red-500": totals.worst === "red",
          })}
          aria-label="Week totals. Open the details."
          data-testid="summary-bar"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">Week</span>
            <StatusPill status={totals.costStatus}>{costText(totals)}</StatusPill>
            {pending ? <span className="text-xs text-muted-foreground">Saving…</span> : null}
          </span>
          {totals.members.map((m) => {
            const t = memberText(m);
            return (
              <span key={m.eaterId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="summary-member">
                <span className="w-16 truncate font-semibold">{m.name}</span>
                <StatusPill status={m.kcalStatus}>{t.kcal}</StatusPill>
                <StatusPill status={m.proteinStatus}>{t.protein}</StatusPill>
              </span>
            );
          })}
        </button>
      </div>
      <SummarySheet open={open} onOpenChange={setOpen} totals={totals} />
    </>
  );
}

function SummarySheet({ open, onOpenChange, totals }: { open: boolean; onOpenChange: (o: boolean) => void; totals: WeekTotals }) {
  const restock = totals.costByFood.filter((c) => c.kind === "restock");
  const packages = totals.costByFood.filter((c) => c.kind === "packages");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Week totals</DialogTitle>
          <DialogDescription>
            Daily averages count only fully planned days.{" "}
            {totals.partialDays.length ? `${totals.partialDays.map((d) => dayLabel(d).split(",")[0]).join(", ")} not fully counted.` : ""}
          </DialogDescription>
        </DialogHeader>

        {totals.members.map((m) => (
          <section key={m.eaterId} aria-label={m.name} className="flex flex-col gap-1">
            <h3 className="font-semibold">
              {m.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                target {kcal(m.kcalTarget)} kcal · {m.proteinTarget} g protein
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 font-medium">Day</th>
                    <th className="py-1 text-right font-medium">kcal</th>
                    <th className="py-1 text-right font-medium">Protein</th>
                    <th className="py-1 text-right font-medium">Carbs</th>
                    <th className="py-1 text-right font-medium">Fat</th>
                    <th className="py-1 text-right font-medium">Fiber</th>
                  </tr>
                </thead>
                <tbody>
                  {m.days.map((d) => (
                    <tr key={d.day} className="border-t">
                      <td className="py-1">{dayLabel(d.day).split(",")[0]}</td>
                      {d.partial ? (
                        <td colSpan={5} className="py-1 text-right text-muted-foreground">
                          not fully counted
                        </td>
                      ) : (
                        <>
                          <td className={cn("py-1 text-right", d.kcalStatus && STATUS_CLASS[d.kcalStatus])}>{kcal(d.kcal)}</td>
                          <td className={cn("py-1 text-right", d.proteinStatus && STATUS_CLASS[d.proteinStatus])}>{grams(d.protein)}</td>
                          <td className="py-1 text-right">{grams(d.carbs)}</td>
                          <td className="py-1 text-right">{grams(d.fat)}</td>
                          <td className="py-1 text-right">{grams(d.fiber)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {m.average ? (
                    <tr className="border-t font-semibold">
                      <td className="py-1">Average</td>
                      <td className="py-1 text-right">{kcal(m.average.kcal)}</td>
                      <td className="py-1 text-right">{grams(m.average.protein)}</td>
                      <td className="py-1 text-right">{grams(m.average.carbs)}</td>
                      <td className="py-1 text-right">{grams(m.average.fat)}</td>
                      <td className="py-1 text-right">{grams(m.average.fiber)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {m.kcalStatus && m.kcalStatus !== "green" && m.average && m.average.kcal < m.kcalTarget ? (
              <p className="text-sm text-muted-foreground">
                About {kcal(m.kcalTarget - m.average.kcal)} kcal a day under. A bigger snack or more starch closes it.
              </p>
            ) : null}
          </section>
        ))}

        <section aria-label="Cost by food" className="flex flex-col gap-1">
          <h3 className="font-semibold">
            Cost by food <span className="text-sm font-normal text-muted-foreground">{costText(totals)}</span>
          </h3>
          <ul className="flex flex-col divide-y text-sm">
            {packages.map((c) => (
              <li key={c.foodId} className="flex justify-between gap-2 py-1.5">
                <span>
                  {c.name} <span className="text-xs text-muted-foreground">{c.estimate ? "estimate" : "receipt"}</span>
                </span>
                <span className="tabular-nums">{formatMoney(c.cents)}</span>
              </li>
            ))}
            {totals.extrasCents ? (
              <li className="flex justify-between gap-2 py-1.5">
                <span>Extras</span>
                <span className="tabular-nums">{formatMoney(totals.extrasCents)}</span>
              </li>
            ) : null}
          </ul>
          {restock.length ? (
            <>
              <h4 className="mt-2 text-sm font-semibold">Restock shares</h4>
              <p className="text-xs text-muted-foreground">Long-lasting items count the part this week uses.</p>
              <ul className="flex flex-col divide-y text-sm">
                {restock.map((c) => (
                  <li key={c.foodId} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {c.name} <span className="text-xs text-muted-foreground">{c.estimate ? "estimate" : "receipt"}</span>
                    </span>
                    <span className="tabular-nums">{formatMoney(c.cents)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {totals.unpricedItems ? (
            <p className="text-sm text-muted-foreground">
              Library recipes are partly priced: {totals.unpricedItems} ingredient{totals.unpricedItems === 1 ? "" : "s"} have no price.
            </p>
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  );
}
