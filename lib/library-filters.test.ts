import { describe, expect, it } from "vitest";
import { activeFilterCount, DEFAULT_FILTERS, filtersToSearch, parseLibraryFilters } from "./library-filters";

const TAG = "0b6c1b1e-6a3f-4f5e-9b1a-2f0b7c9d8e7f";

describe("library filters", () => {
  it("defaults to active recipes, newest first", () => {
    expect(parseLibraryFilters({})).toEqual(DEFAULT_FILTERS);
    expect(filtersToSearch(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips through the URL", () => {
    const f = {
      q: "chicken",
      tag: TAG,
      favorites: true,
      minRating: 4,
      ratedBy: "partner" as const,
      source: "instagram" as const,
      status: "disliked" as const,
      sort: "rating" as const,
    };
    const search = filtersToSearch(f);
    const params = Object.fromEntries(new URLSearchParams(search));
    expect(parseLibraryFilters(params)).toEqual(f);
    expect(activeFilterCount(f)).toBe(5);
  });

  it("ignores junk values", () => {
    expect(
      parseLibraryFilters({ tag: "not-a-uuid", rating: "9", source: "fax", status: "gone", sort: "random", by: "x" }),
    ).toEqual(DEFAULT_FILTERS);
  });

  it("drops the rated-by setting without a rating", () => {
    expect(filtersToSearch({ ...DEFAULT_FILTERS, ratedBy: "partner" })).toBe("");
  });
});
