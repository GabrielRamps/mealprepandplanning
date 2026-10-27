"use client";

import { Bookmark, BookmarkCheck, Check, EllipsisVertical, Printer, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteListAction, saveListAction, setListStatusAction } from "@/app/(app)/lists/actions";
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
import { listsHref } from "@/lib/grocery/tabs";

export type ListActionsTarget = {
  id: string;
  name: string;
  status: "active" | "completed";
  itemCount: number;
  savedList: { id: string; name: string } | null;
};

/** Bigger rows than the default menu, for thumbs in a store aisle. */
const itemClass = "min-h-11 text-base";

/**
 * The ⋯ menu for a list: done or reopen, save for reorder, delete. On the
 * Lists screen (`where="lists"`) a done or reopened list leaves the view; on
 * the list itself it stays on screen and Print is offered too.
 */
export function ListActionsMenu({ list, where }: { list: ListActionsTarget; where: "lists" | "list" }) {
  const [dialog, setDialog] = useState<"save" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const backToLists = where === "lists";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={where === "lists" ? "icon-lg" : "icon"}
            aria-label={where === "lists" ? `Actions for ${list.name}` : "List actions"}
            disabled={pending}
            className={where === "lists" ? "rounded-none rounded-r-xl text-muted-foreground" : undefined}
          >
            <EllipsisVertical className="size-6" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {where === "list" ? (
            <DropdownMenuItem asChild className={itemClass}>
              <Link href={`/lists/${list.id}/print`}>
                <Printer aria-hidden /> Print
              </Link>
            </DropdownMenuItem>
          ) : null}
          {list.status === "active" ? (
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => startTransition(() => setListStatusAction(list.id, "completed", backToLists))}
            >
              <Check aria-hidden /> Done shopping
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => startTransition(() => setListStatusAction(list.id, "active", backToLists))}
            >
              <RotateCcw aria-hidden /> Reopen list
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className={itemClass} onSelect={() => setDialog("save")}>
            {list.savedList ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
            {list.savedList ? "Update saved list…" : "Save for reorder…"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className={itemClass} onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden /> Delete list…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SaveListDialog
        open={dialog === "save"}
        onOpenChange={(open) => setDialog(open ? "save" : null)}
        listId={list.id}
        listName={list.name}
        savedList={list.savedList}
      />
      <DeleteListDialog open={dialog === "delete"} onOpenChange={(open) => setDialog(open ? "delete" : null)} list={list} />
    </>
  );
}

/** "Delete this list?" with what goes and that it can't be undone. */
export function DeleteListDialog({
  open,
  onOpenChange,
  list,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ListActionsTarget;
}) {
  const [pending, startTransition] = useTransition();
  const items = `${list.itemCount} item${list.itemCount === 1 ? "" : "s"}`;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this list?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{list.name}&rdquo; and its {items} will be deleted for both of you. Once it&apos;s deleted, it&apos;s gone
            for good. This can&apos;t be undone.
            {list.savedList ? ` Its saved copy, “${list.savedList.name}”, stays in Reorder.` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(() => deleteListAction(list.id));
            }}
          >
            <Trash2 aria-hidden /> {pending ? "Deleting…" : "Delete list"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Save for reorder: names the list's meals and added items and keeps them under
 * Lists → Reorder. A list already linked to a saved list can update it or save
 * a separate copy.
 */
export function SaveListDialog({
  open,
  onOpenChange,
  listId,
  listName,
  savedList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  savedList: { id: string; name: string } | null;
}) {
  const [name, setName] = useState(savedList?.name ?? listName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ name: string; updated: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  // Start fresh each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(savedList?.name ?? listName);
      setError(null);
      setSaved(null);
    }
  }

  function close(nextOpen: boolean) {
    if (!pending) onOpenChange(nextOpen);
  }

  function save(update: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await saveListAction(listId, name, update);
      if (result.error) setError(result.error);
      else setSaved({ name: result.name ?? name, updated: update });
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {saved ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookmarkCheck className="size-5 text-primary" aria-hidden />
                {saved.updated ? "Saved list updated" : "Saved for reorder"}
              </DialogTitle>
              <DialogDescription>
                &ldquo;{saved.name}&rdquo; is under Lists → Reorder. Tap Reorder there whenever you want a new list with
                these meals.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Done
              </Button>
              <Button asChild>
                <Link href={listsHref("reorder")}>Go to Reorder</Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(Boolean(savedList));
            }}
          >
            <DialogHeader>
              <DialogTitle>{savedList ? "Update saved list" : "Save for reorder"}</DialogTitle>
              <DialogDescription>
                {savedList
                  ? `This list is linked to “${savedList.name}” in Reorder. Update it with this list's meals, servings and added items, or keep both and save a new one.`
                  : "Keeps this list's meals, servings and the items you added under Lists → Reorder, so you can shop for them again in one tap."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saved-list-name">Name</Label>
              <Input
                id="saved-list-name"
                value={name}
                maxLength={80}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setName(e.target.value)}
                placeholder="Taco week"
                aria-invalid={!!error || undefined}
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              {savedList ? (
                <Button type="button" variant="outline" disabled={pending || !name.trim()} onClick={() => save(false)}>
                  Save as new
                </Button>
              ) : null}
              <Button type="submit" disabled={pending || !name.trim()}>
                <Bookmark aria-hidden /> {pending ? "Saving…" : savedList ? "Update saved list" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
