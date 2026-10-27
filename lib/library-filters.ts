// Recipe library search, filters and sort (PRD B2), kept in the URL so the
// back button and reloads keep them.
import { RECIPE_SOURCES, type RecipeSource, RECIPE_STATUSES, type RecipeStatus } from "@/lib/enums";

export const SORTS = ["newest", "title", "rating", "planned"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest",
  title: "Title A–Z",
  rating: "Highest rated",
  planned: "Recently planned",
};

export const SOURCE_LABELS: Record<RecipeSource, string> = {
  manual: "Added by hand",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "Website",
  image: "Photo",
  text: "Pasted text",
};

export const STATUS_LABELS: Record<RecipeStatus, string> = {
  active: "Active",
  disliked: "Didn't like",
  archived: "Archived",
};

export type LibraryFilters = {
  q: string;
  tag: string | null; // tag id
  favorites: boolean; // mine
  minRating: number | null; // 1–5
  ratedBy: "me" | "partner";
  source: RecipeSource | null;
  status: RecipeStatus;
  sort: Sort;
};

export const DEFAULT_FILTERS: LibraryFilters = {
  q: "",
  tag: null,
  favorites: false,
  minRating: null,
  ratedBy: "me",
  source: null,
  status: "active",
  sort: "newest",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads filters from the URL, ignoring anything unexpected. */
export function parseLibraryFilters(params: SearchParams): LibraryFilters {
  const rating = Number(one(params, "rating"));
  const source = one(params, "source");
  return {
    q: (one(params, "q") ?? "").trim().slice(0, 100),
    tag: isUuid(one(params, "tag")) ? one(params, "tag")! : null,
    favorites: one(params, "fav") === "1",
    minRating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    ratedBy: one(params, "by") === "partner" ? "partner" : "me",
    source: RECIPE_SOURCES.includes(source as RecipeSource) ? (source as RecipeSource) : null,
    status: pick(one(params, "status"), RECIPE_STATUSES, "active"),
    sort: pick(one(params, "sort"), SORTS, "newest"),
  };
}

/** The query string for a set of filters, leaving out defaults. */
export function filtersToSearch(f: LibraryFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.tag) p.set("tag", f.tag);
  if (f.favorites) p.set("fav", "1");
  if (f.minRating) {
    p.set("rating", String(f.minRating));
    if (f.ratedBy === "partner") p.set("by", "partner");
  }
  if (f.source) p.set("source", f.source);
  if (f.status !== "active") p.set("status", f.status);
  if (f.sort !== "newest") p.set("sort", f.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** How many filters besides search and sort are switched on. */
export function activeFilterCount(f: LibraryFilters): number {
  return [f.tag, f.favorites, f.minRating, f.source, f.status !== "active"].filter(Boolean).length;
}
