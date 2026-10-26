import type { Habit, HabitLog, HabitSchedule } from "@/src/core/types";
import { isSameWeek, todayKey } from "@/src/core/dates";
import { getJson, setJson } from "@/src/core/storage";

const HABITS_KEY = "habits:v1";
const HABIT_LOGS_KEY = "habitLogs:v1";

const DEFAULT_HABITS: Habit[] = [
  {
    id: "default-pray",
    name: "Pray",
    title: "Pray",
    schedule: { type: "daily" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-scripture",
    name: "Scripture",
    title: "Scripture",
    schedule: { type: "daily" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-journal",
    name: "Journal",
    title: "Journal",
    schedule: { type: "daily" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-workout",
    name: "Workout",
    title: "Workout",
    schedule: { type: "daily" },
    createdAt: new Date().toISOString(),
  },
];

export async function listHabits(): Promise<Habit[]> {
  const list = await getJson<Habit[]>(HABITS_KEY);
  if (!list || list.length === 0) {
    await setJson(HABITS_KEY, DEFAULT_HABITS);
    return DEFAULT_HABITS;
  }
  return list;
}

export async function addHabit(name: string, schedule: HabitSchedule): Promise<void> {
  const list = await listHabits();
  const id = "habit-" + Date.now();
  const trimmed = name.trim();
  const habit: Habit = {
    id,
    name: trimmed,
    title: trimmed,
    schedule,
    createdAt: new Date().toISOString(),
  };
  list.push(habit);
  await setJson(HABITS_KEY, list);
}

export async function updateHabit(updated: Habit): Promise<void> {
  const list = await listHabits();
  const idx = list.findIndex((h) => h.id === updated.id);
  if (idx === -1) return;
  const next = [...list];
  next[idx] = { ...next[idx], ...updated };
  await setJson(HABITS_KEY, next);
}

export async function deleteHabit(id: string): Promise<void> {
  const [habits, logs] = await Promise.all([listHabits(), getAllLogs()]);

  const nextHabits = habits.filter((h) => h.id !== id);
  const nextLogs = logs
    .map<HabitLog>((log) => ({
      ...log,
      completedHabitIds: log.completedHabitIds.filter((hid) => hid !== id),
    }))
    .filter((log) => log.completedHabitIds.length > 0);

  await Promise.all([setJson(HABITS_KEY, nextHabits), setJson(HABIT_LOGS_KEY, nextLogs)]);
}

export async function getAllLogs(): Promise<HabitLog[]> {
  const logs = await getJson<HabitLog[]>(HABIT_LOGS_KEY);
  return logs ?? [];
}

export async function getTodayHabitLog(): Promise<HabitLog> {
  const key = todayKey();
  const logs = await getAllLogs();
  const today = logs.find((l) => l.date === key);
  if (today) return today;
  return { date: key, completedHabitIds: [] };
}

export async function toggleHabitCompleteToday(habitId: string): Promise<HabitLog> {
  const key = todayKey();
  const logs = await getAllLogs();
  const idx = logs.findIndex((l) => l.date === key);
  let today: HabitLog;
  if (idx >= 0) {
    today = { ...logs[idx] };
    const i = today.completedHabitIds.indexOf(habitId);
    if (i >= 0) today.completedHabitIds = today.completedHabitIds.filter((id) => id !== habitId);
    else today.completedHabitIds = [...today.completedHabitIds, habitId];
    logs[idx] = today;
  } else {
    today = { date: key, completedHabitIds: [habitId] };
    logs.push(today);
  }
  await setJson(HABIT_LOGS_KEY, logs);
  return today;
}

export function getTodayProgress(
  habits: Habit[],
  log: HabitLog
): { done: number; total: number; percent: number } {
  const daily = habits.filter((h) => h.schedule.type === "daily" && !h.archived);
  const total = daily.length;
  const done = daily.filter((h) => log.completedHabitIds.includes(h.id)).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

export function getWeeklyProgress(
  habits: Habit[],
  logs: HabitLog[]
): { doneThisWeek: number; targetThisWeek: number } {
  const weekly = habits.filter((h) => h.schedule.type === "weekly" && !h.archived);
  const targetThisWeek = weekly.reduce(
    (s, h) => s + (h.schedule.type === "weekly" ? h.schedule.targetPerWeek ?? 0 : 0),
    0
  );
  const key = todayKey();
  const thisWeekLogs = logs.filter((l) => isSameWeek(l.date, key));
  let doneThisWeek = 0;
  weekly.forEach((h) => {
    const count = thisWeekLogs.reduce(
      (c, l) => c + (l.completedHabitIds.includes(h.id) ? 1 : 0),
      0
    );
    const target = h.schedule.type === "weekly" ? h.schedule.targetPerWeek ?? 0 : 0;
    doneThisWeek += Math.min(count, target);
  });
  return { doneThisWeek, targetThisWeek };
}
