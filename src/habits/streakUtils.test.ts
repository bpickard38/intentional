import { describe, expect, it } from "vitest";
import type { Habit, HabitLog } from "@/src/core/types";
import { computeAllStreaks, computeStreak, isCompleted, setCompleted } from "./streakUtils";

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Read",
    schedule: { type: "daily" },
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function logsFor(id: string, dates: string[]): HabitLog[] {
  return dates.map((date) => ({ date, completedHabitIds: [id] }));
}

describe("setCompleted / isCompleted", () => {
  it("adds a new log for a date with no entry", () => {
    const h = habit();
    const logs = setCompleted(h, "2026-10-26", true, []);
    expect(isCompleted(h, "2026-10-26", logs)).toBe(true);
  });

  it("removes a habit from an existing log without touching others", () => {
    const h = habit();
    const logs: HabitLog[] = [{ date: "2026-10-26", completedHabitIds: ["h1", "h2"] }];
    const next = setCompleted(h, "2026-10-26", false, logs);
    expect(next[0].completedHabitIds).toEqual(["h2"]);
  });

  it("does not mutate the input logs", () => {
    const logs: HabitLog[] = [{ date: "2026-10-26", completedHabitIds: [] }];
    setCompleted(habit(), "2026-10-26", true, logs);
    expect(logs[0].completedHabitIds).toEqual([]);
  });

  it("does not add duplicate ids", () => {
    const h = habit();
    const once = setCompleted(h, "2026-10-26", true, []);
    const twice = setCompleted(h, "2026-10-26", true, once);
    expect(twice[0].completedHabitIds).toEqual(["h1"]);
  });
});

describe("computeStreak", () => {
  it("returns zeros when the habit was never completed", () => {
    expect(computeStreak(habit(), "2026-10-26", [])).toEqual({ current: 0, best: 0 });
  });

  it("counts today's completion in the current streak", () => {
    const logs = logsFor("h1", ["2026-10-24", "2026-10-25", "2026-10-26"]);
    const s = computeStreak(habit(), "2026-10-26", logs);
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(s.lastCompletedKey).toBe("2026-10-26");
  });

  it("keeps the current streak while today is not yet completed", () => {
    const logs = logsFor("h1", ["2026-10-23", "2026-10-24", "2026-10-25"]);
    const s = computeStreak(habit(), "2026-10-26", logs);
    expect(s.current).toBe(3);
    expect(s.lastCompletedKey).toBe("2026-10-25");
  });

  it("breaks the streak once a full day is missed", () => {
    const logs = logsFor("h1", ["2026-10-23", "2026-10-24"]);
    expect(computeStreak(habit(), "2026-10-26", logs).current).toBe(0);
  });

  it("resets the current streak after a missed day but keeps best", () => {
    const logs = logsFor("h1", ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-25", "2026-10-26"]);
    const s = computeStreak(habit(), "2026-10-26", logs);
    expect(s.current).toBe(2);
    expect(s.best).toBe(3);
  });

  it("skips unscheduled days for weekly habits", () => {
    // Mon/Wed/Fri habit; 2026-10-19 is a Monday
    const h = habit({ schedule: { type: "weekly", daysOfWeek: [1, 3, 5] } });
    const logs = logsFor("h1", ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26"]);
    const s = computeStreak(h, "2026-10-26", logs);
    expect(s.current).toBe(4);
  });

  it("orders input logs any way", () => {
    const logs = logsFor("h1", ["2026-10-26", "2026-10-24", "2026-10-25"]);
    expect(computeStreak(habit(), "2026-10-26", logs).current).toBe(3);
  });
});

describe("computeAllStreaks", () => {
  it("sorts by current streak, then best, then name", () => {
    const a = habit({ id: "a", name: "Alpha" });
    const b = habit({ id: "b", name: "Bravo" });
    const c = habit({ id: "c", name: "Charlie" });
    const logs: HabitLog[] = [
      { date: "2026-10-25", completedHabitIds: ["b"] },
      { date: "2026-10-26", completedHabitIds: ["a", "b"] },
    ];
    const order = computeAllStreaks([c, a, b], logs, "2026-10-26").map((s) => s.habit.id);
    expect(order).toEqual(["b", "a", "c"]);
  });
});
