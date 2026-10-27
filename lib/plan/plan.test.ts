import { describe, expect, it } from "vitest";
import { canEdit, canReview, canSend, statusAfterEdit } from "./rules";
import { addDays, dayLabel, inWeek, isIsoDate, isWeekStart, localToday, weekDays, weekLabel, weekListName, weekStartOf } from "./week";

describe("weeks", () => {
  it("finds the Monday of any day", () => {
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(weekStartOf("2026-10-27")).toBe("2026-10-26");
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26"); // Sunday
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28"); // across a year
  });

  it("validates dates and week starts", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-10-26T00:00")).toBe(false);
    expect(isWeekStart("2026-10-26")).toBe(true);
    expect(isWeekStart("2026-10-27")).toBe(false);
    expect(isWeekStart("nope")).toBe(false);
  });

  it("lists the seven days and checks membership", () => {
    expect(weekDays("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(inWeek("2026-10-26", "2026-11-01")).toBe(true);
    expect(inWeek("2026-10-26", "2026-11-02")).toBe(false);
    expect(inWeek("2026-10-26", "2026-10-25")).toBe(false);
    expect(addDays("2026-03-07", 7)).toBe("2026-03-14"); // across a DST change
  });

  it("labels weeks and days", () => {
    expect(weekLabel("2026-10-26")).toBe("Oct 26 – Nov 1");
    expect(weekLabel("2026-11-02")).toBe("Nov 2 – 8");
    expect(dayLabel("2026-10-27")).toBe("Tue, Oct 27");
    expect(weekListName("2026-10-26")).toBe("Week of Oct 26");
  });

  it("reads today in local time", () => {
    expect(localToday(new Date(2026, 9, 27, 23, 30))).toBe("2026-10-27");
  });
});

describe("approval rules", () => {
  const draft = { status: "draft" as const, sentBy: null };
  const waiting = { status: "pending_approval" as const, sentBy: "a" };
  const approved = { status: "approved" as const, sentBy: "a" };

  it("lets only the partner edit while waiting", () => {
    expect(canEdit(null, "a")).toBe(true);
    expect(canEdit(draft, "a")).toBe(true);
    expect(canEdit(waiting, "a")).toBe(false);
    expect(canEdit(waiting, "b")).toBe(true);
    expect(canEdit(approved, "a")).toBe(true);
  });

  it("sends only a draft with meals", () => {
    expect(canSend(draft, 1)).toBe(true);
    expect(canSend(draft, 0)).toBe(false);
    expect(canSend(null, 0)).toBe(false);
    expect(canSend(waiting, 3)).toBe(false);
    expect(canSend(approved, 3)).toBe(false);
  });

  it("lets only the partner review a waiting plan", () => {
    expect(canReview(waiting, "b")).toBe(true);
    expect(canReview(waiting, "a")).toBe(false);
    expect(canReview(draft, "b")).toBe(false);
    expect(canReview(approved, "b")).toBe(false);
  });

  it("sends an edited approved plan back to draft", () => {
    expect(statusAfterEdit("approved")).toBe("draft");
    expect(statusAfterEdit("pending_approval")).toBe("pending_approval");
    expect(statusAfterEdit("draft")).toBe("draft");
  });
});
