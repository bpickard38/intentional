import type { StudyPlan, StudyPlanV2 } from "@/src/core/types";
import type { FaithTradition } from "@/src/core/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";

function getBase(): string {
  if (!API_URL) throw new Error("EXPO_PUBLIC_API_URL is not set. Add it to .env and restart with: npx expo start -c");
  return API_URL;
}

function ensureArray<T>(v: unknown, def: T[]): T[] {
  if (Array.isArray(v)) return v as T[];
  return def;
}

function ensureString(v: unknown, def: string): string {
  if (typeof v === "string") return v;
  return def;
}

async function fetchJson<T>(
  url: string,
  body: unknown
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) throw new Error("Request timed out.");
    throw new Error("Network request failed. Check API URL.");
  }
  clearTimeout(timeoutId);

  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new Error("Failed to read response.");
  }

  if (!res.ok) {
    const snippet = text.length > 80 ? text.slice(0, 80) + "…" : text;
    throw new Error(`API error ${res.status}: ${snippet}`);
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Invalid JSON response.");
  }

  return data as T;
}

function normalizePlanV2(raw: unknown, durationMin: 15 | 30 | 60, topic: string, mode: "devotional" | "deep" | "challenge"): StudyPlanV2 {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const planSteps = ensureArray(o.planSteps, []).map((step: unknown) => {
    const s = (step && typeof step === "object" ? step : {}) as Record<string, unknown>;
    return {
      minutes: Number(s.minutes) || 5,
      label: ensureString(s.label, "Step"),
      instruction: ensureString(s.instruction, ""),
    };
  });
  const scriptures = ensureArray(o.scriptures, []).map((sc: unknown) => {
    const s = (sc && typeof sc === "object" ? sc : {}) as Record<string, unknown>;
    return {
      ref: ensureString(s.ref, ""),
      title: ensureString(s.title, "Scripture"),
      background: ensureString(s.background, ensureString(s.summary, "")),
      observationQuestions: ensureArray(s.observationQuestions, []).map((q) => ensureString(q, "")),
      interpretation: ensureArray(s.interpretation, []).map((i) => ensureString(i, "")),
      crossReferences: ensureArray(s.crossReferences, []).map((x: unknown) => {
        const cr = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        return { ref: ensureString(cr.ref, ""), why: ensureString(cr.why, ""), url: ensureString(cr.url, "") };
      }),
      summary: ensureString(s.summary, ""),
      url: ensureString(s.url, ""),
    };
  });
  const talks = ensureArray(o.talks, []).map((t: unknown) => {
    const x = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    return {
      title: ensureString(x.title, "Talk"),
      speaker: x.speaker != null ? ensureString(x.speaker, "") : undefined,
      summary: ensureString(x.summary, ""),
      url: ensureString(x.url, ""),
    };
  });
  const articles = ensureArray(o.articles, []).map((a: unknown) => {
    const x = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    return { title: ensureString(x.title, "Article"), summary: ensureString(x.summary, ""), url: ensureString(x.url, "") };
  });
  const reflectionPrompts = ensureArray(o.reflectionPrompts, []).map((p) => ensureString(p, ""));
  const actionStep = ensureString(o.actionStep, "Reflect and choose one action.");
  const totalStepMinutes = planSteps.reduce((sum, st) => sum + st.minutes, 0);
  const defaultSteps =
    totalStepMinutes <= 0
      ? [{ minutes: durationMin, label: "Study", instruction: "Read the scriptures and reflect." }]
      : planSteps;

  return {
    title: ensureString(o.title, topic),
    durationMin,
    topic,
    mode,
    planSteps: defaultSteps,
    scriptures: scriptures.length ? scriptures : [{ ref: "", title: "Scripture", background: "", observationQuestions: [], interpretation: [], crossReferences: [], summary: "No scriptures returned.", url: "" }],
    talks: talks.length ? talks : [{ title: "General Conference", summary: "Search for a talk on your topic.", url: "https://www.churchofjesuschrist.org/general-conference?lang=eng" }],
    articles,
    reflectionPrompts: reflectionPrompts.length ? reflectionPrompts : ["What stood out?", "How will you apply this?"],
    actionStep,
    optional: o.optional && typeof o.optional === "object" ? (o.optional as StudyPlanV2["optional"]) : undefined,
  };
}

export async function generateStudySession(
  durationMin: 15 | 30 | 60,
  topic: string,
  mode: "devotional" | "deep" | "challenge",
  faithTradition: FaithTradition
): Promise<StudyPlanV2> {
  const base = getBase();
  const url = `${base}/api/generate-study-session`;
  const data = await fetchJson<unknown>(url, {
    durationMin,
    topic,
    mode,
    faithTradition,
    requestId: Date.now(),
  });
  const raw = (data && typeof data === "object" && ((data as Record<string, unknown>).plan ?? (data as Record<string, unknown>).studyPlan ?? (data as Record<string, unknown>).data)) ?? data;
  return normalizePlanV2(raw, durationMin, topic, mode);
}

export type StudyChatResponse = {
  answer: string;
  followUpQuestion?: string;
  goDeeper?: string;
};

export async function studyChat(params: {
  plan: StudyPlanV2;
  mode: "devotional" | "deep" | "challenge";
  topic: string;
  faithTradition: FaithTradition;
  userQuestion: string;
  lastMessages: { role: string; text: string }[];
}): Promise<StudyChatResponse> {
  const base = getBase();
  const url = `${base}/api/study-chat`;
  const data = await fetchJson<StudyChatResponse>(url, {
    plan: params.plan,
    mode: params.mode,
    topic: params.topic,
    faithTradition: params.faithTradition,
    userQuestion: params.userQuestion,
    lastMessages: params.lastMessages.slice(-6),
  });
  return {
    answer: ensureString((data as Record<string, unknown>)?.answer, "I'm not sure how to answer that right now."),
    followUpQuestion: (data as Record<string, unknown>)?.followUpQuestion as string | undefined,
    goDeeper: (data as Record<string, unknown>)?.goDeeper as string | undefined,
  };
}

function normalizePlan(raw: unknown): StudyPlan {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scriptures = ensureArray(o.scriptures, []).map((s: unknown) => {
    const i = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return {
      title: ensureString(i.title, "Scripture"),
      ref: ensureString(i.ref, ""),
      summary: ensureString(i.summary, ""),
      url: ensureString(i.url, ""),
    };
  });
  const talks = ensureArray(o.talks, []).map((t: unknown) => {
    const i = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    return {
      title: ensureString(i.title, "Talk"),
      speaker: i.speaker != null ? ensureString(i.speaker, "") : undefined,
      summary: ensureString(i.summary, ""),
      url: ensureString(i.url, ""),
    };
  });
  const articles = ensureArray(o.articles, []).map((a: unknown) => {
    const i = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    return { title: ensureString(i.title, "Article"), summary: ensureString(i.summary, ""), url: ensureString(i.url, "") };
  });
  const reflectionPrompts = ensureArray(o.reflectionPrompts, []).map((p) => ensureString(p, ""));
  const actionStep = ensureString(o.actionStep, "Reflect on what you read and choose one action.");
  return {
    scriptures: scriptures.length ? scriptures : [{ title: "Scripture", ref: "", summary: "No scriptures returned.", url: "" }],
    talks: talks.length ? talks : [{ title: "General Conference", speaker: "—", summary: "Search for a talk on your topic.", url: "https://www.churchofjesuschrist.org/general-conference?lang=eng" }],
    articles: articles.length ? articles : undefined,
    reflectionPrompts: reflectionPrompts.length ? reflectionPrompts : ["What stood out to you?", "How will you apply this?"],
    actionStep,
  };
}

export async function generateStudyPlan(
  durationMin: 15 | 30 | 60,
  topic: string,
  faithTradition: FaithTradition
): Promise<StudyPlan> {
  const base = getBase();
  const url = `${base}/api/generate-study-session`;
  const data = await fetchJson<unknown>(url, { durationMin, topic, faithTradition, requestId: Date.now() });
  const raw = (data && typeof data === "object" && ((data as Record<string, unknown>).plan ?? (data as Record<string, unknown>).studyPlan ?? (data as Record<string, unknown>).data)) ?? data;
  return normalizePlan(raw);
}
