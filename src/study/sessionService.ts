import type { StudySession } from "@/src/core/types";
import { getJson, setJson } from "@/src/core/storage";

const STUDY_SESSIONS_KEY = "studySessions:v1";

export async function listSessions(): Promise<StudySession[]> {
  const list = await getJson<StudySession[]>(STUDY_SESSIONS_KEY);
  return list ?? [];
}

export async function addSession(session: StudySession): Promise<void> {
  const list = await listSessions();
  list.unshift(session);
  await setJson(STUDY_SESSIONS_KEY, list);
}

export async function updateSessionJournal(
  sessionId: string,
  journal: { learned: string; felt: string; action: string }
): Promise<void> {
  const list = await listSessions();
  const idx = list.findIndex((s) => s.id === sessionId);
  if (idx < 0) return;
  list[idx] = { ...list[idx], journal };
  await setJson(STUDY_SESSIONS_KEY, list);
}
