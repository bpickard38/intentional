import { describe, expect, it } from "vitest";
import { isSameWeek, parseDateKey, toLocalDateKey } from "./dates";

describe("parseDateKey", () => {
  it("parses as local midnight, not UTC", () => {
    const d = parseDateKey("2026-03-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it("round-trips with toLocalDateKey", () => {
    for (const key of ["2026-01-01", "2026-02-28", "2024-02-29", "2026-12-31"]) {
      expect(toLocalDateKey(parseDateKey(key))).toBe(key);
    }
  });
});

describe("isSameWeek", () => {
  it("treats Sunday through Saturday as one week", () => {
    // 2026-10-25 is a Sunday
    expect(isSameWeek("2026-10-25", "2026-10-31")).toBe(true);
  });

  it("splits Saturday and the following Sunday", () => {
    expect(isSameWeek("2026-10-24", "2026-10-25")).toBe(false);
  });

  it("handles weeks that cross a month boundary", () => {
    expect(isSameWeek("2026-09-27", "2026-10-03")).toBe(true);
  });
});
