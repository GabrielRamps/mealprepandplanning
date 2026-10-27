// The Lists screen's three views (Active, Reorder, History) and the one-line
// notices shown after a delete or a move, both kept in the URL so the back
// button and reloads land on the same view.

export const LIST_TABS = ["active", "reorder", "history"] as const;
export type ListsTab = (typeof LIST_TABS)[number];

export const TAB_LABELS: Record<ListsTab, string> = {
  active: "Active",
  reorder: "Reorder",
  history: "History",
};

export const LIST_NOTICES = {
  "list-deleted": "List deleted.",
  "saved-deleted": "Saved list deleted.",
  "moved-to-history": "Done shopping. The list moved to History.",
  reopened: "List reopened. It's back in Active.",
} as const;
export type ListsNotice = keyof typeof LIST_NOTICES;

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseListsTab(value: SearchValue): ListsTab {
  const v = first(value);
  return LIST_TABS.find((t) => t === v) ?? "active";
}

export function parseListsNotice(value: SearchValue): ListsNotice | null {
  const v = first(value);
  return v && Object.hasOwn(LIST_NOTICES, v) ? (v as ListsNotice) : null;
}

/** "/lists", "/lists?tab=history", "/lists?tab=reorder&notice=saved-deleted". */
export function listsHref(tab: ListsTab, notice?: ListsNotice | null): string {
  const params = new URLSearchParams();
  if (tab !== "active") params.set("tab", tab);
  if (notice) params.set("notice", notice);
  const search = params.toString();
  return search ? `/lists?${search}` : "/lists";
}

/** Where a list lives: done lists sit in History. */
export function tabForStatus(status: "active" | "completed"): ListsTab {
  return status === "completed" ? "history" : "active";
}
