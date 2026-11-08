"use client";

import { ChevronLeft, ChevronRight, EllipsisVertical, Plus, Repeat, RotateCcw, Save, ShoppingCart, Trash2, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import {
  addWeekExtraAction,
  deleteSlotEntryAction,
  deleteWeekAction,
  makePrepListAction,
  removeWeekExtraAction,
  saveSlotAction,
  saveWeekAsTemplateAction,
  setWeekOptionsAction,
  updatePrepListAction,
  type WeekResult,
} from "@/app/(app)/prep/actions";
import { LiveRefresh } from "@/components/prep/live-refresh";
import { type RecipeChoice, SlotSheet, type SlotTarget } from "@/components/prep/slot-sheet";
import { SummaryBar } from "@/components/prep/week-summary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AISLES, type Aisle } from "@/lib/enums";
import { AISLE_LABELS } from "@/lib/grocery/aisles";
import { addDays, dayLabel, localToday, MEAL_SLOTS, SLOT_LABELS, weekDays, weekLabel, weekListName, weekStartOf } from "@/lib/plan/week";
import { formatMoney } from "@/lib/prep/format";
import type { SlotInput } from "@/lib/prep/validation";
import type { EntryView, MenuView, WeekView } from "@/lib/prep/view";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

type Props = { initial: WeekView; menu: MenuView; recipes: RecipeChoice[] };

/** Week builder (P-5 to P-8): seven days of slots, live totals, and the grocery list. */
export function WeekBuilder({ initial, menu, recipes }: Props) {
  const router = useRouter();
  // The server sends a fresh view with every save; a reload from the other phone replaces it too.
  const [state, setState] = useState({ base: initial, view: initial });
  if (state.base !== initial) setState({ base: initial, view: initial });
  const view = state.view;
  const setView = (v: WeekView) => setState((s) => ({ ...s, view: v }));

  const [target, setTarget] = useState<SlotTarget | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"template" | "reset" | null>(null);
  const today = useSyncExternalStore(noSubscribe, localToday, () => null);
  const thisWeek = today ? weekStartOf(today) : null;

  function run(action: () => Promise<WeekResult>, opts: { optimistic?: (v: WeekView) => WeekView; key?: string; after?: () => void } = {}) {
    setMessage(null);
    const before = view;
    if (opts.optimistic) setView(opts.optimistic(view));
    if (opts.key) setPendingIds((s) => new Set(s).add(opts.key!));
    startTransition(async () => {
      try {
        const result = await action();
        if (result.confirm) {
          setView(before);
          setConfirm(result.confirm);
          return;
        }
        if (result.error) {
          setView(before);
          setMessage(result.error === "confirm" ? "Didn't save — try again." : result.error);
          return;
        }
        if (result.view) setView(result.view);
        opts.after?.();
      } catch {
        setView(before);
        setMessage("Didn't save — try again.");
      } finally {
        if (opts.key) setPendingIds((s) => {
          const next = new Set(s);
          next.delete(opts.key!);
          return next;
        });
      }
    });
  }

  function save(input: SlotInput) {
    const key = input.entryId ?? `new:${input.day}:${input.slot}`;
    const closing = () => {
      setTarget(null);
      setConfirm(null);
    };
    // Shown at once; reverted if the save fails (P-6).
    const optimistic = (v: WeekView): WeekView => {
      const title =
        input.entry.kind === "meal"
          ? (menu.meals.find((m) => m.id === (input.entry as { coreMealId: string }).coreMealId)?.name ?? "Meal")
          : input.entry.kind === "recipe"
            ? (recipes.find((r) => r.id === (input.entry as { recipeId: string }).recipeId)?.title ?? "Recipe")
            : input.entry.kind === "flex"
              ? input.flavor || "Flex"
              : "Leftovers";
      const existing = input.entryId ? v.entries.find((e) => e.id === input.entryId) : null;
      const patched: EntryView = {
        ...(existing ?? {
          id: key,
          day: input.day,
          slot: input.slot,
          position: input.position,
          coreMealId: null,
          recipeId: null,
          servings: null,
          coverUrl: null,
          choices: {},
          leftoverOf: null,
          noPrep: false,
          breakdown: { plates: [], costCents: 0, notCounted: null },
        }),
        kind: input.entry.kind,
        title,
        detail: null,
        flavor: input.flavor,
        isDouble: input.isDouble,
      };
      return { ...v, entries: existing ? v.entries.map((e) => (e.id === existing.id ? patched : e)) : [...v.entries, patched] };
    };
    // The sheet stays open until the save lands, so a question or an error keeps what was picked.
    run(() => saveSlotAction(input), {
      optimistic,
      key,
      after: closing,
    });
  }


  const byDay = new Map<string, EntryView[]>();
  for (const e of view.entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const partial = new Set(view.totals.partialDays);
  const guests = view.guestNames;

  return (
    <>
      <LiveRefresh saving={pending} signals={[{ body: { kind: "week", weekStart: view.weekStart } }]} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 pb-40">
        <nav aria-label="Weeks" className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Previous week">
            <Link href={`/prep/week/${addDays(view.weekStart, -7)}`}>
              <ChevronLeft className="size-6" />
            </Link>
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold" data-testid="week-label">
              {weekLabel(view.weekStart)}
            </span>
            {!thisWeek ? null : view.weekStart === thisWeek ? (
              <span className="text-xs text-muted-foreground">This week</span>
            ) : (
              <Link href={`/prep/week/${thisWeek}`} className="text-xs text-primary underline">
                Go to this week
              </Link>
            )}
          </div>
          <div className="flex items-center">
            <Button asChild variant="ghost" size="icon" aria-label="Next week">
              <Link href={`/prep/week/${addDays(view.weekStart, 7)}`}>
                <ChevronRight className="size-6" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Week actions">
                  <EllipsisVertical className="size-6" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem className="min-h-11 text-base" onSelect={() => setDialog("template")}>
                  <Save aria-hidden /> Save as template…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="min-h-11 text-base" onSelect={() => setDialog("reset")}>
                  <RotateCcw aria-hidden /> Start over…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>

        {view.templateName ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Repeat className="size-4" aria-hidden /> From {view.templateName}
          </p>
        ) : null}

        <ListActions view={view} pending={pending} setMessage={setMessage} />

        {message ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {message}
          </p>
        ) : null}

        {guests.length || menu.eaters.some((e) => e.kind === "guest") ? (
          <label className="flex min-h-12 items-center gap-3 rounded-xl border px-3">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={view.guestsOn}
              disabled={pending || guests.length === 0}
              onChange={(e) => {
                const guestsOn = e.target.checked;
                run(() => setWeekOptionsAction(view.weekId, { guestsOn }), { optimistic: (v) => ({ ...v, guestsOn }) });
              }}
            />
            <span className="flex flex-col">
              <span className="font-medium">{guests.length ? `${guests.join(" & ")} at dinner` : "Guests at dinner"}</span>
              <span className="text-xs text-muted-foreground">
                {guests.length === 0
                  ? "Turn guests on in Menu → Eaters first."
                  : view.guestsOn
                    ? "Parents' sides: add them on the list."
                    : "Adds their dinner portions to cost and the list."}
              </span>
            </span>
          </label>
        ) : null}

        <ol className="flex flex-col gap-3">
          {weekDays(view.weekStart).map((day) => {
            const entries = byDay.get(day) ?? [];
            return (
              <li key={day} className="rounded-xl border p-3" aria-label={dayLabel(day)} data-day={day}>
                <h2 className={cn("flex items-baseline justify-between font-semibold", day === today && "text-primary")}>
                  <span>
                    {dayLabel(day)}
                    {day === today ? <span className="ml-2 text-xs font-normal">Today</span> : null}
                  </span>
                  {partial.has(day) ? <span className="text-xs font-normal text-muted-foreground">{dayLabel(day).split(",")[0]} not fully counted</span> : null}
                </h2>
                <div className="mt-1 flex flex-col divide-y">
                  {MEAL_SLOTS.map((slot) => {
                    const here = entries.filter((e) => e.slot === slot);
                    return (
                      <div key={slot} className="flex items-start gap-2 py-1.5">
                        <span className="w-20 shrink-0 pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {SLOT_LABELS[slot]}
                        </span>
                        <div className="flex flex-1 flex-col">
                          {here.map((e) => (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => {
                                setConfirm(null);
                                setTarget({ day, slot, entry: e, position: e.position });
                              }}
                              className={cn("flex min-h-11 w-full items-center gap-2 py-1 text-left", pendingIds.has(e.id) && "opacity-60")}
                              data-testid="prep-slot"
                            >
                              {e.kind === "recipe" ? <Thumb url={e.coverUrl} /> : null}
                              <span className="flex flex-col">
                                <span className="font-medium">
                                  {e.title}
                                  {e.isDouble ? <span className="ml-1.5 rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">Double</span> : null}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {[
                                    e.detail,
                                    e.kind !== "flex" ? e.flavor : null,
                                    e.kind === "recipe" ? `${e.servings} servings · nutrition not counted` : null,
                                    e.kind === "flex" ? "not counted" : null,
                                    pendingIds.has(e.id) ? "Saving…" : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </span>
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setConfirm(null);
                              setTarget({ day, slot, entry: null, position: here.length });
                            }}
                            className={cn(
                              "flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground",
                              here.length > 0 && "min-h-9 text-xs",
                            )}
                            aria-label={`Add to ${SLOT_LABELS[slot].toLowerCase()} on ${dayLabel(day)}`}
                          >
                            <Plus className="size-4" aria-hidden /> {here.length ? "Add another" : "Add"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>

        <Restock view={view} pending={pending} run={run} />
        <Extras view={view} pending={pending} run={run} />
      </main>

      <SummaryBar totals={view.totals} pending={pending} />

      <SlotSheet
        target={target}
        weekStart={view.weekStart}
        weekId={view.weekId}
        menu={menu}
        recipes={recipes}
        entries={view.entries}
        guestsOn={view.guestsOn}
        pending={pending}
        confirm={confirm}
        error={target ? message : null}
        onClose={() => {
          setTarget(null);
          setConfirm(null);
        }}
        onSave={save}
        onRemove={(entry) => {
          setTarget(null);
          run(() => deleteSlotEntryAction(view.weekId, entry.id), {
            key: entry.id,
            optimistic: (v) => ({ ...v, entries: v.entries.filter((e) => e.id !== entry.id && e.leftoverOf !== entry.id) }),
          });
        }}
      />

      <SaveTemplateDialog open={dialog === "template"} onOpenChange={(o) => setDialog(o ? "template" : null)} view={view} />
      <StartOverDialog
        open={dialog === "reset"}
        onOpenChange={(o) => setDialog(o ? "reset" : null)}
        weekId={view.weekId}
        label={weekLabel(view.weekStart)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="size-9 shrink-0 overflow-hidden rounded-md bg-muted">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos come straight from the public bucket
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <UtensilsCrossed className="m-2 size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

/** Make grocery list / Update list, with "Week changed — update list?" (P-8). */
function ListActions({ view, pending, setMessage }: { view: WeekView; pending: boolean; setMessage: (m: string | null) => void }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const make = () =>
    startTransition(async () => {
      setMessage(null);
      const result = await makePrepListAction(view.weekId);
      if (result?.error) setMessage(result.error);
    });
  const update = () =>
    startTransition(async () => {
      setMessage(null);
      const result = await updatePrepListAction(view.weekId);
      if (result.error) setMessage(result.error);
      else router.push(`/lists/${result.listId}`);
    });

  if (!view.listId) {
    return (
      <Button size="lg" disabled={pending || busy || view.entries.length === 0} onClick={make}>
        <ShoppingCart aria-hidden /> {busy ? "Making the list…" : "Make grocery list"}
      </Button>
    );
  }
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl p-3 text-sm", view.listStale ? "bg-amber-500/10" : "bg-primary/10")} role="status">
      <p>{view.listStale ? <strong>Week changed — update list?</strong> : <>The list for this week is ready.</>}</p>
      <div className="flex gap-2">
        {view.listStale ? (
          <Button className="flex-1" disabled={pending || busy} onClick={update}>
            {busy ? "Updating…" : "Update list"}
          </Button>
        ) : null}
        <Button asChild variant="outline" className="flex-1">
          <Link href={`/lists/${view.listId}`}>
            <ShoppingCart aria-hidden /> Open list
          </Link>
        </Button>
      </div>
    </div>
  );
}

type Run = (action: () => Promise<WeekResult>, opts?: { optimistic?: (v: WeekView) => WeekView }) => void;

/** Restock foods this week uses: counted as a weekly share; tick to buy a package now. */
function Restock({ view, pending, run }: { view: WeekView; pending: boolean; run: Run }) {
  if (!view.restock.length) return null;
  const bought = view.restock.filter((r) => r.bought).map((r) => r.foodId);
  return (
    <section aria-labelledby="restock-heading" className="flex flex-col gap-2">
      <h2 id="restock-heading" className="text-lg font-semibold">
        Check you have
      </h2>
      <p className="text-sm text-muted-foreground">Long-lasting items. The budget counts the share this week uses; tick one to buy it this week.</p>
      <ul className="flex flex-col divide-y rounded-xl border">
        {view.restock.map((r) => (
          <li key={r.foodId}>
            <label className="flex min-h-12 items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={r.bought}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked ? [...bought, r.foodId] : bought.filter((id) => id !== r.foodId);
                  run(() => setWeekOptionsAction(view.weekId, { restockBuy: next }), {
                    optimistic: (v) => ({ ...v, restock: v.restock.map((x) => (x.foodId === r.foodId ? { ...x, bought: e.target.checked } : x)) }),
                  });
                }}
              />
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatMoney(r.shareCents)} this week · {r.packageLabel} {formatMoney(r.priceCents)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">Buy this week</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sauces, seasonings and other one-off items for this week's list. */
function Extras({ view, pending, run }: { view: WeekView; pending: boolean; run: Run }) {
  const [name, setName] = useState("");
  const [aisle, setAisle] = useState<Aisle>("condiments");
  const [price, setPrice] = useState("");
  const [pantry, setPantry] = useState(false);
  return (
    <section aria-labelledby="extras-heading" className="flex flex-col gap-2">
      <h2 id="extras-heading" className="text-lg font-semibold">
        Extras
      </h2>
      {view.extras.length ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {view.extras.map((x) => (
            <li key={x.id} className="flex min-h-12 items-center gap-2 px-3 py-1">
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{x.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[x.forNote, x.priceCents !== null ? formatMoney(x.priceCents) : null, x.isPantry ? "check you have" : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${x.name}`}
                disabled={pending}
                onClick={() => run(() => removeWeekExtraAction(view.weekId, x.id), { optimistic: (v) => ({ ...v, extras: v.extras.filter((e) => e.id !== x.id) }) })}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing extra this week.</p>
      )}
      <form
        className="flex flex-col gap-2 rounded-xl border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const cents = price.trim() ? Math.round(Number(price.replace(/[$,]/g, "")) * 100) : null;
          run(() => addWeekExtraAction(view.weekId, { name, forNote: null, aisle, priceCents: Number.isFinite(cents) ? cents : null, isPantry: pantry }));
          setName("");
          setPrice("");
        }}
      >
        <Label htmlFor="extra-name">Add an item</Label>
        <div className="flex gap-2">
          <Input id="extra-name" value={name} maxLength={80} placeholder="Dinner rolls" onChange={(e) => setName(e.target.value)} />
          <Input aria-label="Price" inputMode="decimal" value={price} className="w-24" placeholder="$0.00" onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Aisle"
            value={aisle}
            onChange={(e) => setAisle(e.target.value as Aisle)}
            className="h-11 flex-1 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
          >
            {AISLES.map((a) => (
              <option key={a} value={a}>
                {AISLE_LABELS[a]}
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-primary" checked={pantry} onChange={(e) => setPantry(e.target.checked)} />
            Check you have
          </label>
          <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
            Add
          </Button>
        </div>
      </form>
    </section>
  );
}

function SaveTemplateDialog({ open, onOpenChange, view }: { open: boolean; onOpenChange: (o: boolean) => void; view: WeekView }) {
  const router = useRouter();
  const [name, setName] = useState(view.templateName ?? weekListName(view.weekStart));
  const [overwrite, setOverwrite] = useState(Boolean(view.templateId));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(view.templateName ?? weekListName(view.weekStart));
      setOverwrite(Boolean(view.templateId));
      setError(null);
      setDone(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? "Template saved" : "Save as template"}</DialogTitle>
          <DialogDescription>
            {done
              ? `“${name}” is in Menu → Settings → Rotation.`
              : "Keeps this week's meals by weekday, with swaps, flavors, doubles, leftovers and extras."}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await saveWeekAsTemplateAction(view.weekId, name, overwrite);
                if (result.error) setError(result.error);
                else {
                  setDone(true);
                  router.refresh();
                }
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input id="template-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            {view.templateId && view.templateName ? (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" className="size-5 accent-primary" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                Replace “{view.templateName}” (off: save a new one)
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Saving…" : "Save template"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StartOverDialog({
  open,
  onOpenChange,
  weekId,
  label,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  weekId: string;
  label: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start this week over?</AlertDialogTitle>
          <AlertDialogDescription>
            Every meal, extra and checked task for {label} is cleared for both of you, so you can start from a template, last week
            or blank. A grocery list already made stays in Lists.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                await deleteWeekAction(weekId);
                onOpenChange(false);
                onDone();
              });
            }}
          >
            {pending ? "Clearing…" : "Start over"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
