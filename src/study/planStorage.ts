import { getJson, setJson } from "@/src/core/storage";
import type { StudyPlanDoc, StudyPlanSources } from "@/src/core/types";

const PLANS_STORAGE_KEY = "study_plans_v1";
const PLAN_CACHE_KEY = "study_plan_cache_v1";
const PLAN_PROMPT_VERSION = "study_plan_v1";

export async function listPlans(): Promise<StudyPlanDoc[]> {
  const raw = await getJson<StudyPlanDoc[]>(PLANS_STORAGE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p.id === "string" && Array.isArray(p.days))
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
}

export async function getPlan(id: string): Promise<StudyPlanDoc | null> {
  const list = await listPlans();
  return list.find((p) => p.id === id) ?? null;
}

export async function savePlan(plan: StudyPlanDoc): Promise<void> {
  const list = await listPlans();
  const updated = { ...plan, updatedAt: new Date().toISOString() };
  const idx = list.findIndex((p) => p.id === plan.id);
  const next = idx >= 0 ? [...list.slice(0, idx), updated, ...list.slice(idx + 1)] : [updated, ...list];
  await setJson(PLANS_STORAGE_KEY, next);
}

export async function deletePlan(id: string): Promise<void> {
  const list = await listPlans();
  await setJson(PLANS_STORAGE_KEY, list.filter((p) => p.id !== id));
}

export async function toggleDayComplete(planId: string, dayId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) return;
  const completed = plan.progress?.completedDayIds ?? [];
  const nextCompleted = completed.includes(dayId)
    ? completed.filter((id) => id !== dayId)
    : [...completed, dayId];
  await savePlan({
    ...plan,
    progress: { completedDayIds: nextCompleted },
  });
}

export function buildPlanCacheHash(params: {
  topic: string;
  length: number;
  minutesPerDay: number;
  sources: StudyPlanSources;
}): string {
  const payload = {
    topic: (params.topic || "").trim().toLowerCase(),
    length: params.length,
    minutesPerDay: params.minutesPerDay,
    sources: params.sources,
    promptVersion: PLAN_PROMPT_VERSION,
  };
  return JSON.stringify(payload);
}

type PlanCacheMap = Record<string, StudyPlanDoc>;

export async function getCachedPlan(hash: string): Promise<StudyPlanDoc | null> {
  const raw = await getJson<PlanCacheMap>(PLAN_CACHE_KEY);
  if (!raw || typeof raw !== "object") return null;
  const plan = raw[hash];
  if (!plan || !plan.days?.length) return null;
  return plan;
}

export async function setCachedPlan(hash: string, plan: StudyPlanDoc): Promise<void> {
  const map = (await getJson<PlanCacheMap>(PLAN_CACHE_KEY)) ?? {};
  map[hash] = plan;
  await setJson(PLAN_CACHE_KEY, map);
}
