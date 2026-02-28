import type { StudyPlan } from "@/src/core/types";
import type { FaithTradition } from "@/src/core/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

function ensureArray<T>(v: unknown, def: T[]): T[] {
  if (Array.isArray(v)) return v as T[];
  return def;
}

function ensureString(v: unknown, def: string): string {
  if (typeof v === "string") return v;
  return def;
}

function normalizePlan(raw: unknown): StudyPlan {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scriptures = ensureArray(o.scriptures, []).map((s: unknown) => {
    const i = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
    return {
      title: ensureString(i.title, "Scripture"),
      ref: ensureString(i.ref, ""),
      summary: ensureString(i.summary, ""),
      url: ensureString(i.url, ""),
    };
  });
  const talks = ensureArray(o.talks, []).map((t: unknown) => {
    const i = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
    return {
      title: ensureString(i.title, "Talk"),
      speaker: i.speaker != null ? ensureString(i.speaker, "") : undefined,
      summary: ensureString(i.summary, ""),
      url: ensureString(i.url, ""),
    };
  });
  const articles = ensureArray(o.articles, []).map((a: unknown) => {
    const i = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
    return {
      title: ensureString(i.title, "Article"),
      summary: ensureString(i.summary, ""),
      url: ensureString(i.url, ""),
    };
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
  if (!API_URL) throw new Error("EXPO_PUBLIC_API_URL is not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/generate-study-session`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      body: JSON.stringify({
        durationMin,
        topic,
        faithTradition,
        requestId: Date.now(),
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort")) throw new Error("Request timed out");
    throw new Error("Network request failed. Check API URL (use your computer's IP on device/emulator).");
  }
  clearTimeout(timeoutId);

  if (!res.ok) throw new Error("API request failed: " + res.status);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid JSON response");
  }
  const raw = (data && typeof data === "object" && ((data as Record<string, unknown>).plan ?? (data as Record<string, unknown>).studyPlan ?? (data as Record<string, unknown>).data)) ?? data;
  return normalizePlan(raw);
}
