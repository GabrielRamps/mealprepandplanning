"use client";

import { CircleCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LIST_NOTICES, type ListsNotice as Notice } from "@/lib/grocery/tabs";

/** "List deleted." and the like, after an action. Dropped from the URL so a reload doesn't repeat it. */
export function ListsNotice({ notice }: { notice: Notice }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("notice")) return;
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [notice]);

  if (!open) return null;
  return (
    <div
      role="status"
      data-testid="lists-notice"
      className="flex items-center gap-2 rounded-xl bg-primary/10 py-1 pr-1 pl-3 text-sm animate-in fade-in-0"
    >
      <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="flex-1">{LIST_NOTICES[notice]}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setOpen(false)}
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-background/60"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
