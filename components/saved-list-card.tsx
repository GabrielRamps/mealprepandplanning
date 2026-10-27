"use client";

import { EllipsisVertical, Pencil, Repeat, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteSavedListAction, renameSavedListAction, reorderSavedListAction } from "@/app/(app)/lists/actions";
import { LocalDate } from "@/components/local-date";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/quantity";
import type { UnitCode } from "@/lib/units";
import { cn } from "@/lib/utils";

export type SavedListView = {
  id: string;
  name: string;
  createdAt: string; // ISO
  lastOrderedAt: string | null; // ISO
  recipes: { recipeId: string; title: string; servings: number; available: boolean }[];
  items: { name: string; quantity: number | null; unit: UnitCode | null }[];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const itemClass = "min-h-11 text-base";

/** One saved list under Reorder: its meals and added items, and a big Reorder button. */
export function SavedListCard({ saved }: { saved: SavedListView }) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const meals = saved.recipes.filter((r) => r.available);
  const skipped = saved.recipes.length - meals.length;
  const nothingLeft = meals.length === 0 && saved.items.length === 0;

  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border p-3", pending && "opacity-70")} aria-label={saved.name}>
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-0.5">
          <h3 className="text-lg leading-snug font-semibold">{saved.name}</h3>
          <p className="text-sm text-muted-foreground">
            {[
              meals.length ? plural(meals.length, "meal") : null,
              saved.items.length ? plural(saved.items.length, "added item") : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Nothing left to order"}
            {" · "}
            {saved.lastOrderedAt ? (
              <>
                Last ordered <LocalDate iso={saved.lastOrderedAt} />
              </>
            ) : (
              <>
                Saved <LocalDate iso={saved.createdAt} />
              </>
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${saved.name}`} className="-mt-1 -mr-1 text-muted-foreground">
              <EllipsisVertical className="size-6" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem className={itemClass} onSelect={() => setDialog("rename")}>
              <Pencil aria-hidden /> Rename…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className={itemClass} onSelect={() => setDialog("delete")}>
              <Trash2 aria-hidden /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {saved.recipes.length || saved.items.length ? (
        <ul className="flex flex-col gap-1 text-sm" aria-label={`What ${saved.name} orders`}>
          {saved.recipes.map((r) => (
            <li key={r.recipeId} className={cn("flex justify-between gap-3", !r.available && "text-muted-foreground")}>
              <span className={cn(!r.available && "line-through")}>{r.title}</span>
              <span className="shrink-0 text-muted-foreground">
                {r.available ? `${formatAmount(r.servings, null, null)} serving${r.servings === 1 ? "" : "s"}` : "Not in your library"}
              </span>
            </li>
          ))}
          {saved.items.length ? (
            <li className="text-muted-foreground">
              Plus{" "}
              {saved.items
                .map((i) => (i.quantity !== null ? `${formatAmount(i.quantity, null, i.unit)} ${i.name}` : i.name))
                .join(", ")}
            </li>
          ) : null}
        </ul>
      ) : null}

      {skipped ? (
        <p className="text-xs text-muted-foreground">
          {skipped === 1 ? "1 recipe isn't" : `${skipped} recipes aren't`} in your library anymore and will be skipped.
        </p>
      ) : null}

      <Button
        size="lg"
        disabled={pending || nothingLeft}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await reorderSavedListAction(saved.id);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <Repeat aria-hidden /> {pending ? "Making list…" : "Reorder"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <RenameDialog open={dialog === "rename"} onOpenChange={(o) => setDialog(o ? "rename" : null)} saved={saved} />
      <DeleteSavedDialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)} saved={saved} />
    </article>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  saved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved: SavedListView;
}) {
  const [name, setName] = useState(saved.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(saved.name);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await renameSavedListAction(saved.id, name);
              if (result.error) setError(result.error);
              else onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename saved list</DialogTitle>
            <DialogDescription>New lists you reorder from it get this name.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rename-${saved.id}`}>Name</Label>
            <Input
              id={`rename-${saved.id}`}
              value={name}
              maxLength={80}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!error || undefined}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSavedDialog({
  open,
  onOpenChange,
  saved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved: SavedListView;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this saved list?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{saved.name}&rdquo; will be removed from Reorder for both of you. Once it&apos;s deleted, it&apos;s gone
            for good. This can&apos;t be undone. Lists you already made from it stay where they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(() => deleteSavedListAction(saved.id));
            }}
          >
            <Trash2 aria-hidden /> {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
