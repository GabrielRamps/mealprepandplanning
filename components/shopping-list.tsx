"use client";

import { Check, ChevronRight, EllipsisVertical, Printer, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addManualItemAction,
  deleteItemAction,
  rebuildListAction,
  setListStatusAction,
  toggleItemAction,
  updateItemAction,
} from "@/app/(app)/lists/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AISLES, type Aisle } from "@/lib/enums";
import { AISLE_LABELS } from "@/lib/grocery/aisles";
import { groupItems, isOptionalItem } from "@/lib/grocery/build";
import type { ListItem } from "@/lib/grocery/lists";
import { formatAmount } from "@/lib/quantity";
import { isUnitCode } from "@/lib/units";
import { cn } from "@/lib/utils";

// Polls every 3 s so a check-off shows on the other phone within 5 s (PRD E2).
const POLL_MS = 3000;

type Props = {
  listId: string;
  name: string;
  status: "active" | "completed";
  planChanged: boolean;
  initialItems: ListItem[];
  aisleOrder: Aisle[];
  memberNames: Record<string, string>;
};

/** E2/E3: aisle groups, check-off shared between phones by polling, manual items, sources. */
export function ShoppingList({ listId, name, status, planChanged, initialItems, aisleOrder, memberNames }: Props) {
  const [items, setItems] = useState(initialItems);
  const [openId, setOpenId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Items with a write in flight: polls leave them alone until the server answers.
  const pending = useRef(new Set<string>());
  const since = useRef<string | null>(null);

  const apply = useCallback((item: ListItem) => {
    setItems((list) => (list.some((i) => i.id === item.id) ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item]));
  }, []);

  const poll = useCallback(async () => {
    const url = `/api/lists/${listId}/items${since.current ? `?since=${encodeURIComponent(since.current)}` : ""}`;
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data: { now: string; items: ListItem[]; ids: string[] } = await res.json();
    // Look back 2 s so a write that lands as we read isn't skipped.
    since.current = new Date(new Date(data.now).getTime() - 2000).toISOString();
    const alive = new Set(data.ids);
    setItems((list) => {
      const byId = new Map(list.filter((i) => alive.has(i.id) || pending.current.has(i.id)).map((i) => [i.id, i]));
      for (const incoming of data.items) {
        if (pending.current.has(incoming.id)) continue;
        const local = byId.get(incoming.id);
        if (!local || incoming.updatedAt >= local.updatedAt) byId.set(incoming.id, incoming);
      }
      return [...byId.values()];
    });
  }, [listId]);

  // Poll while the list is on screen, and right away when it comes back.
  useEffect(() => {
    since.current = new Date(Date.now() - 2000).toISOString();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  useWakeLock(status === "active");

  function toggle(item: ListItem) {
    const checked = !item.isChecked;
    pending.current.add(item.id);
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, isChecked: checked } : i)));
    startTransition(async () => {
      try {
        const saved = await toggleItemAction(listId, item.id, checked);
        if (saved) apply(saved);
      } catch {
        setItems((list) => list.map((i) => (i.id === item.id ? { ...i, isChecked: !checked } : i)));
      } finally {
        pending.current.delete(item.id);
      }
    });
  }

  /** Aisle or pantry change: shown at once, saved in the background. */
  function edit(item: ListItem, patch: { aisle?: Aisle; isPantry?: boolean }) {
    pending.current.add(item.id);
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    startTransition(async () => {
      try {
        const saved = await updateItemAction(listId, item.id, patch);
        if (saved) apply(saved);
      } catch {
        setItems((list) => list.map((i) => (i.id === item.id ? item : i)));
      } finally {
        pending.current.delete(item.id);
      }
    });
  }

  const groups = useMemo(() => groupItems(items, aisleOrder), [items, aisleOrder]);
  const checkedCount = items.filter((i) => i.isChecked).length;
  const open = items.find((i) => i.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title={name}
        back={{ href: "/lists", label: "Lists" }}
        action={<ListMenu listId={listId} status={status} />}
      />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {status === "completed" ? "Done. " : ""}
          {checkedCount} of {items.length} checked
        </p>

        {planChanged ? <PlanChangedBanner listId={listId} /> : null}

        <AddItem listId={listId} onAdded={apply} />

        {items.length === 0 ? <p className="py-6 text-center text-muted-foreground">Nothing on this list yet.</p> : null}

        {groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col">
            <h2 className="py-1.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-stretch" data-testid="grocery-item">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.isChecked}
                    onClick={() => toggle(item)}
                    className="flex min-h-14 flex-1 items-center gap-3 px-3 py-2 text-left"
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                        item.isChecked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                    >
                      {item.isChecked ? <Check className="size-5" aria-hidden /> : null}
                    </span>
                    <span className={cn("flex flex-col", item.isChecked && "text-muted-foreground line-through")}>
                      <span>
                        {item.quantity !== null ? (
                          <span className="font-semibold">{formatAmount(item.quantity, null, item.unit)} </span>
                        ) : null}
                        <span data-testid="item-name">{item.name}</span>
                        {isOptionalItem(item.sources) ? <span className="text-muted-foreground"> (optional)</span> : null}
                      </span>
                      {item.isChecked && item.checkedBy && memberNames[item.checkedBy] ? (
                        <span className="text-xs no-underline">Got it: {memberNames[item.checkedBy]}</span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Details for ${item.name}`}
                    onClick={() => setOpenId(item.id)}
                    className="flex w-12 shrink-0 items-center justify-center text-muted-foreground"
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <ItemDialog
        listId={listId}
        item={open}
        memberNames={memberNames}
        onClose={() => setOpenId(null)}
        onEdit={edit}
        onDeleted={(id) => {
          setItems((list) => list.filter((i) => i.id !== id));
          setOpenId(null);
        }}
      />
    </>
  );
}

/** PRD 8.4: the plan behind this list changed since it was made. */
function PlanChangedBanner({ listId }: { listId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3 text-sm">
      <p>
        <strong>Plan changed.</strong> Update the list? Checked items and items you added stay.
      </p>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await rebuildListAction(listId);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Updating…" : "Update list"}
      </Button>
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}

/** Keeps the phone awake while shopping (PRD 5), where the browser allows it. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Denied (e.g. low battery); the list still works.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [enabled]);
}

function ListMenu({ listId, status }: { listId: string; status: "active" | "completed" }) {
  const [, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="List actions">
          <EllipsisVertical className="size-6" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <Link href={`/lists/${listId}/print`}>
            <Printer aria-hidden /> Print
          </Link>
        </DropdownMenuItem>
        {status === "active" ? (
          <DropdownMenuItem onSelect={() => startTransition(() => setListStatusAction(listId, "completed"))}>
            <Check aria-hidden /> Done shopping
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => startTransition(() => setListStatusAction(listId, "active"))}>
            <RotateCcw aria-hidden /> Reopen list
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddItem({ listId, onAdded }: { listId: string; onAdded: (item: ListItem) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        startTransition(async () => {
          const result = await addManualItemAction(listId, text);
          if (result.item) {
            onAdded(result.item);
            setText("");
            setError(null);
          } else setError(result.error ?? "Couldn't add that. Try again.");
        });
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Add an item"
          placeholder="Add an item, e.g. 2 lb apples"
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={pending || !text.trim()}>
          Add
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

/** Sources (E3), aisle and pantry flag (remembered for next time), delete. */
function ItemDialog({
  listId,
  item,
  memberNames,
  onClose,
  onEdit,
  onDeleted,
}: {
  listId: string;
  item: ListItem | null;
  memberNames: Record<string, string>;
  onClose: () => void;
  onEdit: (item: ListItem, patch: { aisle?: Aisle; isPantry?: boolean }) => void;
  onDeleted: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(patch: { aisle?: Aisle; isPantry?: boolean }) {
    if (item) onEdit(item, patch);
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(o) => {
        if (!o) {
          setConfirming(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {item.quantity !== null ? `${formatAmount(item.quantity, null, item.unit)} ` : ""}
                {item.name}
              </DialogTitle>
              <DialogDescription>
                {item.isManual ? "Added by hand." : `Needed by ${item.sources.length} recipe${item.sources.length === 1 ? "" : "s"}.`}
                {item.isChecked && item.checkedBy && memberNames[item.checkedBy] ? ` Checked off by ${memberNames[item.checkedBy]}.` : ""}
              </DialogDescription>
            </DialogHeader>

            {item.sources.length ? (
              <ul className="flex flex-col divide-y rounded-lg border text-sm" aria-label="Recipes that need it">
                {item.sources.map((s, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3 py-2">
                    <Link href={`/recipes/${s.recipe_id}`} className="font-medium underline-offset-2 hover:underline">
                      {s.recipe_title}
                    </Link>
                    <span className="text-right text-muted-foreground">
                      {s.quantity !== null ? formatAmount(s.quantity, null, isUnitCode(s.unit) ? s.unit : null) : "as needed"}
                      {s.optional ? " (optional)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-aisle">Aisle</Label>
              <select
                id="item-aisle"
                value={item.aisle}
                onChange={(e) => save({ aisle: e.target.value as Aisle })}
                className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
              >
                {AISLES.map((a) => (
                  <option key={a} value={a}>
                    {AISLE_LABELS[a]}
                  </option>
                ))}
              </select>
              {item.ingredientId ? <p className="text-xs text-muted-foreground">Remembered for future lists.</p> : null}
            </div>

            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={item.isPantry}
                onChange={(e) => save({ isPantry: e.target.checked })}
              />
              <span>
                Pantry staple
                <span className="block text-xs text-muted-foreground">Listed under &ldquo;Check you have&rdquo;</span>
              </span>
            </label>

            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                startTransition(async () => {
                  await deleteItemAction(listId, item.id);
                  setConfirming(false);
                  onDeleted(item.id);
                });
              }}
            >
              <Trash2 aria-hidden /> {confirming ? "Tap again to remove" : "Remove from list"}
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
