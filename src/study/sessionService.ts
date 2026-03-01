import type { StudySession, StudyPlanV2, ChatMessage } from "@/src/core/types";
import { getJson, setJson } from "@/src/core/storage";

const STUDY_SESSIONS_KEY = "studySessions:v1";

function isPlanV2(plan: unknown): plan is StudyPlanV2 {
  return (
    plan != null &&
    typeof plan === "object" &&
    Array.isArray((plan as Record<string, unknown>).planSteps)
  );
}

function migrateSession(raw: unknown): StudySession | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const plan = s.plan;
  let planV2: StudyPlanV2;
  if (isPlanV2(plan)) {
    planV2 = plan;
  } else {
    const p = plan as Record<string, unknown> | undefined;
    const durationMin = (s.durationMin as 15 | 30 | 60) ?? 30;
    const topic = typeof s.topic === "string" ? s.topic : "Faith";
    const scriptures = Array.isArray(p?.scriptures) ? p.scriptures : [];
    planV2 = {
      title: (p?.title as string) || topic,
      durationMin,
      topic,
      mode: "devotional",
      planSteps: [{ minutes: durationMin, label: "Study", instruction: "Read and reflect." }],
      scriptures: scriptures.map((sc: unknown) => {
        const x = (sc && typeof sc === "object" ? sc : {}) as Record<string, unknown>;
        return {
          ref: String(x.ref ?? ""),
          title: String(x.title ?? "Scripture"),
          background: String(x.summary ?? ""),
          observationQuestions: [],
          interpretation: [],
          crossReferences: [],
          summary: String(x.summary ?? ""),
          url: String(x.url ?? ""),
        };
      }),
      talks: Array.isArray(p?.talks) ? (p.talks as StudyPlanV2["talks"]) : [],
      articles: Array.isArray(p?.articles) ? (p.articles as StudyPlanV2["articles"]) : [],
      reflectionPrompts: Array.isArray(p?.reflectionPrompts) ? (p.reflectionPrompts as string[]) : [],
      actionStep: typeof p?.actionStep === "string" ? p.actionStep : "Reflect and act.",
    };
  }
  return {
    id: String(s.id ?? ""),
    date: String(s.date ?? ""),
    durationMin: (s.durationMin as 15 | 30 | 60) ?? 30,
    topic: String(s.topic ?? "Faith"),
    plan: planV2,
    journal: s.journal as StudySession["journal"],
    chat: Array.isArray(s.chat) ? (s.chat as StudySession["chat"]) : undefined,
    status: (s.status as StudySession["status"]) ?? "completed",
    startedAt: s.startedAt as string | undefined,
    completedAt: s.completedAt as string | undefined,
    timerState: s.timerState as StudySession["timerState"],
    createdAt: String(s.createdAt ?? new Date().toISOString()),
  };
}

export async function listSessions(): Promise<StudySession[]> {
  const raw = await getJson<unknown[]>(STUDY_SESSIONS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateSession).filter((s): s is StudySession => s != null);
}

export async function addSession(session: StudySession): Promise<void> {
  const list = await listSessions();
  list.unshift(session);
  await setJson(STUDY_SESSIONS_KEY, list);
}

export async function updateSession(session: StudySession): Promise<void> {
  const list = await listSessions();
  const idx = list.findIndex((s) => s.id === session.id);
  if (idx < 0) return;
  list[idx] = session;
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

export async function appendChatMessage(sessionId: string, message: ChatMessage): Promise<void> {
  const list = await listSessions();
  const idx = list.findIndex((s) => s.id === sessionId);
  if (idx < 0) return;
  const chat = [...(list[idx].chat ?? []), message];
  list[idx] = { ...list[idx], chat };
  await setJson(STUDY_SESSIONS_KEY, list);
}

export async function setSessionTimerState(
  sessionId: string,
  timerState: StudySession["timerState"]
): Promise<void> {
  const list = await listSessions();
  const idx = list.findIndex((s) => s.id === sessionId);
  if (idx < 0) return;
  list[idx] = { ...list[idx], timerState };
  await setJson(STUDY_SESSIONS_KEY, list);
}

export async function setSessionStatus(
  sessionId: string,
  status: StudySession["status"]
): Promise<void> {
  const list = await listSessions();
  const idx = list.findIndex((s) => s.id === sessionId);
  if (idx < 0) return;
  const updates: Partial<StudySession> = { status };
  if (status === "completed") updates.completedAt = new Date().toISOString();
  list[idx] = { ...list[idx], ...updates };
  await setJson(STUDY_SESSIONS_KEY, list);
}

export async function getSessionById(sessionId: string): Promise<StudySession | null> {
  const list = await listSessions();
  const s = list.find((x) => x.id === sessionId);
  return s ?? null;
}
