import { getJson, setJson } from "@/src/core/storage";

const HISTORY_KEY = "study_history_v1";
const MAX_ENTRIES = 50;
const RECENT_DAYS = 30;

type StudyHistoryEntry = {
  refs: string[];
  studiedAt: string;
};

export async function addToStudyHistory(refs: string[]): Promise<void> {
  const cleaned = refs.map((r) => r.trim()).filter(Boolean);
  if (cleaned.length === 0) return;
  const existing = (await getJson<StudyHistoryEntry[]>(HISTORY_KEY)) ?? [];
  const entry: StudyHistoryEntry = { refs: cleaned, studiedAt: new Date().toISOString() };
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  await setJson(HISTORY_KEY, next);
}

export async function getRecentlyStudiedRefs(): Promise<string[]> {
  const existing = (await getJson<StudyHistoryEntry[]>(HISTORY_KEY)) ?? [];
  const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const recent = existing
    .filter((e) => e.studiedAt >= cutoff)
    .flatMap((e) => e.refs);
  return [...new Set(recent)];
}
