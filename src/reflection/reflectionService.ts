import { getJson, setJson } from "@/src/core/storage";
import type { WeeklyReflection } from "@/src/core/types";

const REFLECTIONS_KEY = "reflections_v1";

export function getCurrentWeekKey(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function listReflections(): Promise<WeeklyReflection[]> {
  return (await getJson<WeeklyReflection[]>(REFLECTIONS_KEY)) ?? [];
}

export async function getReflectionForWeek(
  weekKey: string
): Promise<WeeklyReflection | null> {
  const all = await listReflections();
  return all.find((r) => r.weekKey === weekKey) ?? null;
}

export async function saveReflection(reflection: WeeklyReflection): Promise<void> {
  const all = await listReflections();
  const exists = all.findIndex((r) => r.id === reflection.id);
  if (exists >= 0) {
    all[exists] = reflection;
    await setJson(REFLECTIONS_KEY, all);
  } else {
    await setJson(REFLECTIONS_KEY, [...all, reflection]);
  }
}

export function shouldShowReflectionPrompt(
  reflections: WeeklyReflection[],
  completedThisWeek: number
): boolean {
  if (completedThisWeek === 0) return false;
  const weekKey = getCurrentWeekKey();
  const existing = reflections.find((r) => r.weekKey === weekKey);
  // Show if no reflection yet for this week, or reflection has no answer
  return !existing || !existing.answer;
}
