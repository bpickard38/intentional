import type { Habit, HabitLog } from "@/src/core/types";
import { parseDateKey, toLocalDateKey } from "@/src/core/dates";

export type HabitStreak = {
  habit: Habit;
  current: number;
  best: number;
  lastCompletedKey?: string;
};

export function isCompleted(habit: Habit, dateKey: string, logs: HabitLog[]): boolean {
  const log = logs.find((l) => l.date === dateKey);
  if (!log) return false;
  return log.completedHabitIds.includes(habit.id);
}

export function setCompleted(
  habit: Habit,
  dateKey: string,
  completed: boolean,
  logs: HabitLog[]
): HabitLog[] {
  const nextLogs = [...logs];
  const idx = nextLogs.findIndex((l) => l.date === dateKey);
  if (idx >= 0) {
    const existing = { ...nextLogs[idx] };
    const hasId = existing.completedHabitIds.includes(habit.id);
    if (completed && !hasId) {
      existing.completedHabitIds = [...existing.completedHabitIds, habit.id];
    } else if (!completed && hasId) {
      existing.completedHabitIds = existing.completedHabitIds.filter((id) => id !== habit.id);
    }
    nextLogs[idx] = existing;
  } else if (completed) {
    nextLogs.push({ date: dateKey, completedHabitIds: [habit.id] });
  }
  return nextLogs;
}

function isScheduledForDate(habit: Habit, date: Date): boolean {
  const schedule = habit.schedule;
  if (schedule.type === "daily") return true;
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
    // When not specified, treat all days as potential scheduled days.
    return true;
  }
  return schedule.daysOfWeek.includes(day);
}

export function computeStreak(
  habit: Habit,
  todayKey: string,
  logs: HabitLog[]
): { current: number; best: number; lastCompletedKey?: string } {
  // If the habit has never been completed, streaks are 0.
  const logsWithHabit = logs.filter((l) => l.completedHabitIds.includes(habit.id));
  if (logsWithHabit.length === 0) {
    return { current: 0, best: 0 };
  }

  const today = parseDateKey(todayKey);

  // Start from the earliest date where this habit was ever completed.
  let earliest = parseDateKey(logsWithHabit[0].date);
  for (let i = 1; i < logsWithHabit.length; i += 1) {
    const d = parseDateKey(logsWithHabit[i].date);
    if (d.getTime() < earliest.getTime()) earliest = d;
  }

  let current = 0;
  let best = 0;
  let lastCompletedKey: string | undefined;

  // Walk day-by-day from earliest completion through today.
  for (
    let d = new Date(earliest.getTime());
    d.getTime() <= today.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    const dateKey = toLocalDateKey(d);

    if (!isScheduledForDate(habit, d)) {
      // Unscheduled days do not break or extend streaks.
      continue;
    }

    const completed = isCompleted(habit, dateKey, logs);
    if (completed) {
      current += 1;
      if (current > best) best = current;
      lastCompletedKey = dateKey;
    } else {
      current = 0;
    }
  }

  return { current, best, lastCompletedKey };
}

export function computeAllStreaks(
  habits: Habit[],
  logs: HabitLog[],
  todayKey: string
): HabitStreak[] {
  const streaks: HabitStreak[] = habits.map((habit) => {
    const { current, best, lastCompletedKey } = computeStreak(habit, todayKey, logs);
    return { habit, current, best, lastCompletedKey };
  });

  streaks.sort((a, b) => {
    if (b.current !== a.current) return b.current - a.current;
    if (b.best !== a.best) return b.best - a.best;
    const aName = a.habit.title ?? a.habit.name ?? "";
    const bName = b.habit.title ?? b.habit.name ?? "";
    return aName.localeCompare(bName);
  });

  return streaks;
}

