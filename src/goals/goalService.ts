import { getJson, setJson } from "@/src/core/storage";
import type { Goal, Value, Milestone } from "@/src/core/types";

const VALUES_KEY = "values_v1";
const GOALS_KEY = "goals_v1";

// ── Values ───────────────────────────────────────────────────────────────────

export async function listValues(): Promise<Value[]> {
  return (await getJson<Value[]>(VALUES_KEY)) ?? [];
}

export async function addValue(value: Value): Promise<void> {
  const values = await listValues();
  await setJson(VALUES_KEY, [...values, value]);
}

export async function removeValue(id: string): Promise<void> {
  const values = await listValues();
  await setJson(VALUES_KEY, values.filter((v) => v.id !== id));
}

// ── Goals ────────────────────────────────────────────────────────────────────

export async function listGoals(): Promise<Goal[]> {
  return (await getJson<Goal[]>(GOALS_KEY)) ?? [];
}

export async function addGoal(goal: Goal): Promise<void> {
  const goals = await listGoals();
  await setJson(GOALS_KEY, [...goals, goal]);
}

export async function updateGoal(updated: Goal): Promise<void> {
  const goals = await listGoals();
  await setJson(
    GOALS_KEY,
    goals.map((g) => (g.id === updated.id ? updated : g))
  );
}

export async function removeGoal(id: string): Promise<void> {
  const goals = await listGoals();
  await setJson(GOALS_KEY, goals.filter((g) => g.id !== id));
}

export async function completeMilestone(
  goalId: string,
  milestoneId: string
): Promise<void> {
  const goals = await listGoals();
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return;
  const updated: Goal = {
    ...goal,
    updatedAt: new Date().toISOString(),
    milestones: goal.milestones.map((m): Milestone =>
      m.id === milestoneId
        ? { ...m, completed: true, completedAt: new Date().toISOString() }
        : m
    ),
  };
  await updateGoal(updated);
}

export async function linkHabitToMilestone(
  goalId: string,
  milestoneId: string,
  habitId: string
): Promise<void> {
  const goals = await listGoals();
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return;
  const updated: Goal = {
    ...goal,
    updatedAt: new Date().toISOString(),
    milestones: goal.milestones.map((m): Milestone =>
      m.id === milestoneId ? { ...m, habitId } : m
    ),
  };
  await updateGoal(updated);
}
