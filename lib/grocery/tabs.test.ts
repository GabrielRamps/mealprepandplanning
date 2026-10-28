import { describe, expect, it } from "vitest";
import { LIST_NOTICES, listsHref, parseListsNotice, parseListsTab, tabForStatus } from "./tabs";

describe("lists tabs", () => {
  it("defaults to Active and ignores junk", () => {
    expect(parseListsTab(undefined)).toBe("active");
    expect(parseListsTab("history")).toBe("history");
    expect(parseListsTab("reorder")).toBe("reorder");
    expect(parseListsTab(["reorder", "history"])).toBe("reorder");
    expect(parseListsTab("saved")).toBe("active");
    expect(parseListsTab("")).toBe("active");
  });

  it("builds hrefs that round-trip", () => {
    expect(listsHref("active")).toBe("/lists");
    expect(listsHref("history")).toBe("/lists?tab=history");
    expect(listsHref("active", "list-deleted")).toBe("/lists?notice=list-deleted");
    const href = listsHref("reorder", "saved-deleted");
    expect(href).toBe("/lists?tab=reorder&notice=saved-deleted");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(parseListsTab(params.get("tab") ?? undefined)).toBe("reorder");
    expect(parseListsNotice(params.get("notice") ?? undefined)).toBe("saved-deleted");
  });

  it("only accepts known notices", () => {
    for (const notice of Object.keys(LIST_NOTICES)) expect(parseListsNotice(notice)).toBe(notice);
    expect(parseListsNotice("toString")).toBeNull();
    expect(parseListsNotice("<script>")).toBeNull();
    expect(parseListsNotice(undefined)).toBeNull();
  });

  it("puts done lists in History", () => {
    expect(tabForStatus("completed")).toBe("history");
    expect(tabForStatus("active")).toBe("active");
  });
});
