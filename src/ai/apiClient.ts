import type {
  StudyPlan,
  StudyPlanV2,
  FaithTradition,
  ScriptureSource,
  StudyDisplayMode,
  StudyDepth,
  ChapterStudyResponse,
  ChapterStudyResult,
  StudyPlanDoc,
  StudyPlanSources,
} from "@/src/core/types";
import { getJson, setJson } from "@/src/core/storage";
import {
  buildPlanCacheHash,
  getCachedPlan,
  setCachedPlan,
} from "@/src/study/planStorage";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";

// Path prefix: default "api" -> /api/study-chat. Set EXPO_PUBLIC_API_PATH=root if API is deployed with api folder as project root (routes at /study-chat).
const API_PATH = (process.env.EXPO_PUBLIC_API_PATH ?? "api").trim().toLowerCase();
const API_PREFIX = API_PATH === "root" || API_PATH === "none" || API_PATH === "" ? "" : `/${API_PATH}`;

function getBase(): string {
  if (!API_URL) throw new Error("EXPO_PUBLIC_API_URL is not set. Add it to .env and restart with: npx expo start -c");
  return API_URL;
}

function apiUrl(path: string): string {
  const base = getBase();
  return `${base}${API_PREFIX}/${path}`.replace(/\/+/g, "/");
}

/** Returns the base URL (no trailing slash). Only use when API_URL is set. */
export function getApiBaseUrl(): string | null {
  if (!API_URL) return null;
  return API_URL;
}

/** Path prefix in use (e.g. "/api" or ""). */
export function getApiPathPrefix(): string {
  return API_PREFIX || "(root)";
}

/**
 * Check if the API is reachable (GET the root). Returns the URL we tried and any error.
 * Use this to verify EXPO_PUBLIC_API_URL and deployment.
 */
export async function checkApiReachability(): Promise<{ ok: boolean; url: string; status?: number; error?: string }> {
  const base = API_URL;
  if (!base) {
    return { ok: false, url: "", error: "EXPO_PUBLIC_API_URL is not set" };
  }
  // GET the root of the API: with /api prefix we hit base/api, with root we hit base/
  const healthUrl = API_PREFIX ? `${base}${API_PREFIX}`.replace(/\/+/g, "/") : base;
  try {
    const res = await fetch(healthUrl, { method: "GET" });
    if (res.ok) {
      return { ok: true, url: healthUrl, status: res.status };
    }
    const text = await res.text();
    return { ok: false, url: healthUrl, status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 60)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, url: healthUrl, error: msg };
  }
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
  body: unknown,
  opts?: { signal?: AbortSignal }
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  const signal = opts?.signal;
  const onAbort = () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
  if (signal?.aborted) {
    clearTimeout(timeoutId);
    throw new Error("Request aborted.");
  }
  signal?.addEventListener("abort", onAbort);

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
    signal?.removeEventListener("abort", onAbort);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) throw new Error("Request aborted.");
    throw new Error("Network request failed. Check API URL.");
  }
  clearTimeout(timeoutId);
  signal?.removeEventListener("abort", onAbort);

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

function normalizeChapterStudy(raw: unknown, cacheKey: string): ChapterStudyResponse {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const chaptersRaw = ensureArray(o.chapters, []);
  const chapters: ChapterStudyResult[] = chaptersRaw.map((c: unknown) => {
    const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const themes = ensureArray(x.themes, []).map((t: unknown) => {
      const y = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      return {
        id: ensureString(y.id, ""),
        title: ensureString(y.title, ""),
        summary: y.summary != null ? ensureString(y.summary, "") : undefined,
      };
    });

    const crossReferences = ensureArray(x.crossReferences, []).map((cr: unknown) => {
      const y = (cr && typeof cr === "object" ? cr : {}) as Record<string, unknown>;
      return {
        themeId: y.themeId != null ? ensureString(y.themeId, "") : undefined,
        label: y.label != null ? ensureString(y.label, "") : undefined,
        refs: ensureArray(y.refs, []).map((r) => ensureString(r, "")),
      };
    });

    const relatedChaptersSource =
      x.relatedChaptersByTheme && typeof x.relatedChaptersByTheme === "object"
        ? (x.relatedChaptersByTheme as Record<string, unknown>)
        : undefined;
    const relatedChaptersByTheme: Record<string, string[]> | undefined = relatedChaptersSource
      ? Object.fromEntries(
          Object.entries(relatedChaptersSource).map(([k, v]) => [
            k,
            ensureArray(v, []).map((ref) => ensureString(ref, "")),
          ])
        )
      : undefined;

    return {
      reference: ensureString(x.reference, ""),
      bigIdea: ensureString(x.bigIdea, ""),
      themes,
      crossReferences,
      discussionQuestions: ensureArray(x.discussionQuestions, []).map((q) =>
        ensureString(q, "")
      ),
      lookFor: ensureArray(x.lookFor, []).map((l) => ensureString(l, "")).slice(0, 5),
      context: ensureString(x.context, ""),
      links: ensureArray(x.links, []).map((ln: unknown) => {
        const y = (ln && typeof ln === "object" ? ln : {}) as Record<string, unknown>;
        return {
          label: ensureString(y.label, ""),
          url: ensureString(y.url, ""),
        };
      }),
      relatedChaptersByTheme,
      studyPlanSuggestion:
        x.studyPlanSuggestion != null ? ensureString(x.studyPlanSuggestion, "") : undefined,
    };
  });

  return {
    chapters,
    cacheKey,
    generatedAt: new Date().toISOString(),
  };
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
    const source = ["BOM", "DNC", "PGP", "BIBLE"].includes(s.source as string) ? (s.source as ScriptureSource) : undefined;
    return {
      ref: ensureString(s.ref, ""),
      title: ensureString(s.title, "Scripture"),
      source,
      keyVerses: Array.isArray(s.keyVerses) ? (s.keyVerses as string[]).map((v) => String(v)) : undefined,
      why: Array.isArray(s.why) ? (s.why as string[]).map((w) => String(w)) : undefined,
      themes: Array.isArray(s.themes) ? (s.themes as string[]).map((t) => String(t)) : undefined,
      officialUrl: s.officialUrl != null ? ensureString(s.officialUrl, "") : undefined,
      keyVersesSummary: s.keyVersesSummary != null ? ensureString(s.keyVersesSummary, "") : undefined,
      passage: ensureString(s.passage, ""),
      background: ensureString(s.background, ensureString(s.summary, "")),
      observationQuestions: ensureArray(s.observationQuestions, []).map((q) => ensureString(q, "")),
      interpretation: ensureArray(s.interpretation, []).map((i) => ensureString(i, "")),
      crossReferences: ensureArray(s.crossReferences, []).map((x: unknown) => {
        const cr = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        return {
          ref: ensureString(cr.ref, ""),
          why: ensureString(cr.why, ""),
          url: ensureString(cr.url, ""),
          passage: cr.passage != null ? ensureString(cr.passage, "") : undefined,
        };
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
      officialUrl: x.officialUrl != null ? ensureString(x.officialUrl, "") : undefined,
      url: ensureString(x.url, ""),
      why: Array.isArray(x.why) ? (x.why as string[]).map((w) => String(w)) : undefined,
      themes: Array.isArray(x.themes) ? (x.themes as string[]).map((t) => String(t)) : undefined,
      conference: x.conference != null ? ensureString(x.conference, "") : undefined,
    };
  });
  const articles = ensureArray(o.articles, []).map((a: unknown) => {
    const x = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    return { title: ensureString(x.title, "Article"), summary: ensureString(x.summary, ""), url: ensureString(x.url, "") };
  });
  const reflectionPrompts = ensureArray(o.reflectionPrompts, []).map((p) => ensureString(p, ""));
  const actionStep = ensureString(o.actionStep, "");
  const studySummary = o.studySummary != null ? ensureString(o.studySummary, "") : undefined;

  const bigIdeaHeadline = o.bigIdeaHeadline != null ? ensureString(o.bigIdeaHeadline, "") : undefined;
  const bigIdeaSupport = o.bigIdeaSupport != null ? ensureString(o.bigIdeaSupport, "") : undefined;
  const studyDepth = ((): StudyDepth | undefined => {
    const d = o.studyDepth;
    if (d === "QUICK" || d === "GUIDED" || d === "DEEP_DIVE") return d;
    return undefined;
  })();

  const studyPlan =
    o.studyPlan && typeof o.studyPlan === "object"
      ? (() => {
          const sp = o.studyPlan as Record<string, unknown>;
          const read = ensureArray(sp.read, []).map((r: unknown) => {
            const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
            const source = ["BOM", "DNC", "PGP", "BIBLE"].includes(x.source as string)
              ? (x.source as ScriptureSource)
              : "BIBLE";
            return {
              source,
              reference: ensureString(x.reference, ""),
              url: ensureString(x.url, ""),
            };
          });
          return {
            read,
            lookFor: ensureString(sp.lookFor, ""),
            ponder: ensureString(sp.ponder, ""),
          };
        })()
      : undefined;

  const readingCards = ensureArray(o.readingCards, []).map((c: unknown) => {
    const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const source = ["BOM", "DNC", "PGP", "BIBLE"].includes(x.source as string)
      ? (x.source as ScriptureSource)
      : "BIBLE";
    return {
      source,
      reference: ensureString(x.reference, ""),
      url: ensureString(x.url, ""),
      bigIdea: x.bigIdea != null ? ensureString(x.bigIdea, "") : undefined,
      whyOneLine: ensureString(x.whyOneLine, ""),
      keyMoments: ensureArray(x.keyMoments, []).map((km) => ensureString(km, "")),
      keyVerses: Array.isArray(x.keyVerses) ? (x.keyVerses as string[]).map((kv) => String(kv)) : undefined,
      crossRefs: ensureArray(x.crossRefs, []).map((cr: unknown) => {
        const y = (cr && typeof cr === "object" ? cr : {}) as Record<string, unknown>;
        return {
          label: ensureString(y.label, ""),
          url: ensureString(y.url, ""),
        };
      }),
    };
  });

  // Fallback: if API sent only scriptures (legacy), derive readingCards so the new UI has content
  const readingCardsFinal =
    readingCards.length > 0
      ? readingCards
      : scriptures
          .filter((sc) => sc.ref && sc.url)
          .map((sc) => ({
            source: (sc.source ?? "BIBLE") as ScriptureSource,
            reference: sc.ref,
            url: sc.officialUrl || sc.url,
            bigIdea: undefined,
            whyOneLine: (sc.why && sc.why[0]) || sc.summary || sc.ref,
            keyMoments: sc.keyVersesSummary ? [sc.keyVersesSummary] : sc.background ? [sc.background] : [sc.summary || sc.ref],
            keyVerses: sc.keyVerses,
            crossRefs: (sc.crossReferences ?? []).map((cr) => ({ label: cr.ref, url: cr.url })),
          }));

  const deepDive =
    o.deepDive && typeof o.deepDive === "object"
      ? (() => {
          const d = o.deepDive as Record<string, unknown>;
          const backgroundBullets = ensureArray(d.backgroundBullets, []).map((b) => ensureString(b, ""));
          const crossRefs = ensureArray(d.crossRefs, []).map((cr: unknown) => {
            const y = (cr && typeof cr === "object" ? cr : {}) as Record<string, unknown>;
            return {
              label: ensureString(y.label, ""),
              url: ensureString(y.url, ""),
            };
          });
          let talk;
          if (d.talk && typeof d.talk === "object") {
            const t = d.talk as Record<string, unknown>;
            talk = {
              title: ensureString(t.title, ""),
              speaker: ensureString(t.speaker, ""),
              whyOneLine: ensureString(t.whyOneLine, ""),
              officialUrl: ensureString(t.officialUrl, ""),
            };
          }
          return {
            backgroundBullets: backgroundBullets.length ? backgroundBullets : undefined,
            crossRefs: crossRefs.length ? crossRefs : undefined,
            talk,
          };
        })()
      : undefined;
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
    bigIdeaHeadline,
    bigIdeaSupport,
    studyDepth,
    planSteps: defaultSteps,
    studyPlan,
    readingCards: readingCardsFinal,
    deepDive,
    scriptures: scriptures.length ? scriptures : [{ ref: "", title: "Scripture", passage: "", background: "", observationQuestions: [], interpretation: [], crossReferences: [], summary: "No scriptures returned.", url: "" }],
    talks,
    articles,
    reflectionPrompts: reflectionPrompts.length ? reflectionPrompts : ["What stood out to you?", "What do you feel invited to do?"],
    actionStep,
    studySummary,
    optional: o.optional && typeof o.optional === "object" ? (o.optional as StudyPlanV2["optional"]) : undefined,
  };
}

export async function generateStudySession(
  durationMin: 15 | 30 | 60,
  topic: string,
  mode: "devotional" | "deep" | "challenge",
  faithTradition: FaithTradition,
  studyDisplayMode?: StudyDisplayMode,
  studyDepth?: StudyDepth
): Promise<StudyPlanV2> {
  const url = apiUrl("generate-study-session");
  const data = await fetchJson<unknown>(url, {
    durationMin,
    topic,
    mode,
    faithTradition,
    studyDisplayMode: studyDisplayMode ?? "BOTH",
    studyDepth: studyDepth ?? "GUIDED",
    requestId: Date.now(),
  });
  // API returns the full plan at top level (title, scriptures, readingCards, studyPlan, etc.).
  // Do NOT use data.studyPlan as raw — that's the small { read, lookFor, ponder } object. Use data.plan or data.data only if present (nested wrapper), else the whole response.
  const raw =
    (data &&
      typeof data === "object" &&
      ((data as Record<string, unknown>).plan ?? (data as Record<string, unknown>).data)) ??
    data;
  return normalizePlanV2(raw, durationMin, topic, mode);
}

function normalizeChapterKey(chapters: string[]): string {
  return chapters
    .map((c) => c.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join(" | ");
}

const STUDY_CACHE_KEY = "study_cache_v1";
const STUDY_PROMPT_VERSION = "study_v1";

type StudyCacheMap = Record<string, ChapterStudyResponse>;

async function getStudyCacheMap(): Promise<StudyCacheMap> {
  const raw = await getJson<StudyCacheMap>(STUDY_CACHE_KEY);
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

async function getStudyCacheEntry(hash: string): Promise<ChapterStudyResponse | null> {
  const map = await getStudyCacheMap();
  const entry = map[hash];
  if (!entry || !Array.isArray(entry.chapters) || entry.chapters.length === 0) {
    return null;
  }
  return entry;
}

async function setStudyCacheEntry(hash: string, value: ChapterStudyResponse): Promise<void> {
  const map = await getStudyCacheMap();
  map[hash] = value;
  await setJson(STUDY_CACHE_KEY, map);
}

function buildStudyCacheHash(
  chapters: string[],
  opts?: { studyDepth?: StudyDepth | null }
): string {
  const normalizedChapters = normalizeChapterKey(chapters);
  const payload = {
    chapters: normalizedChapters,
    studyDepth: opts?.studyDepth ?? null,
    promptVersion: STUDY_PROMPT_VERSION,
  };
  return JSON.stringify(payload);
}

export async function generateChapterStudy(
  chapterRefs: string[],
  opts?: { forceRefresh?: boolean; studyDepth?: StudyDepth; signal?: AbortSignal }
): Promise<{ result: ChapterStudyResponse; fromCache: boolean }> {
  const normalizedKey = normalizeChapterKey(chapterRefs);
  const legacyStorageKey = `chapterStudyCache:v1:${normalizedKey}`;
  const cacheHash = buildStudyCacheHash(chapterRefs, { studyDepth: opts?.studyDepth ?? null });

  if (!opts?.forceRefresh) {
    // 1) New cache map (study_cache_v1).
    const cachedNew = await getStudyCacheEntry(cacheHash);
    if (cachedNew) {
      return { result: cachedNew, fromCache: true };
    }
    // 2) Legacy per-key cache (chapterStudyCache:v1:...).
    const cachedLegacy = await getJson<ChapterStudyResponse>(legacyStorageKey);
    if (cachedLegacy && cachedLegacy.chapters && cachedLegacy.chapters.length > 0) {
      // Keep legacy entry, but also seed the new cache map.
      await setStudyCacheEntry(cacheHash, cachedLegacy);
      return { result: cachedLegacy, fromCache: true };
    }
  }

  const url = apiUrl("study/generate");
  const data = await fetchJson<unknown>(
    url,
    { chapters: chapterRefs },
    opts?.signal ? { signal: opts.signal } : undefined
  );
  const raw =
    data && typeof data === "object" && (data as Record<string, unknown>).chapters
      ? data
      : { chapters: data };
  const normalized = normalizeChapterStudy(raw, normalizedKey);
  // Write to both caches so existing behavior continues to work.
  await setJson(legacyStorageKey, normalized);
  await setStudyCacheEntry(cacheHash, normalized);
  return { result: normalized, fromCache: false };
}

export async function generateStudyPlanDoc(
  params: {
    topic: string;
    length: number;
    minutesPerDay: number;
    sources: StudyPlanSources;
  },
  opts?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<{ plan: StudyPlanDoc; fromCache: boolean }> {
  const hash = buildPlanCacheHash(params);
  if (!opts?.forceRefresh) {
    const cached = await getCachedPlan(hash);
    if (cached) return { plan: cached, fromCache: true };
  }

  const url = apiUrl("study/plan/generate");
  const data = await fetchJson<StudyPlanDoc>(
    url,
    {
      topic: params.topic.trim(),
      length: params.length,
      minutesPerDay: params.minutesPerDay,
      sources: params.sources,
    },
    opts?.signal ? { signal: opts.signal } : undefined
  );

  const plan: StudyPlanDoc = {
    id: typeof data.id === "string" ? data.id : "plan-" + Date.now(),
    title: String(data.title ?? "").slice(0, 120),
    topic: params.topic.trim(),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    length: Array.isArray(data.days) ? data.days.length : 0,
    minutesPerDay: params.minutesPerDay,
    sources: params.sources,
    description: String(data.description ?? "").slice(0, 500),
    days: Array.isArray(data.days)
      ? data.days.map((d: unknown, i: number) => {
          const x = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
          return {
            id: typeof x.id === "string" ? x.id : `${data.id}-day-${i + 1}`,
            dayNumber: typeof x.dayNumber === "number" ? x.dayNumber : i + 1,
            focus: String(x.focus ?? "").slice(0, 200),
            references: Array.isArray(x.references) ? x.references.map((r) => String(r)).slice(0, 2) : [],
            bigIdea: String(x.bigIdea ?? "").slice(0, 500),
            lookFor: Array.isArray(x.lookFor) ? x.lookFor.map((l) => String(l)).slice(0, 4) : [],
            reflection: String(x.reflection ?? "").slice(0, 300),
            whyNext: x.whyNext != null ? String(x.whyNext).slice(0, 200) : undefined,
            linkUrls: Array.isArray(x.linkUrls) ? x.linkUrls.slice(0, 4).map((l: unknown) => {
              const y = l && typeof l === "object" ? (l as Record<string, unknown>) : {};
              return { label: String(y.label ?? "Open"), url: String(y.url ?? "") };
            }) : [],
          };
        })
      : [],
    progress: data.progress && typeof data.progress === "object" && Array.isArray((data.progress as { completedDayIds?: unknown }).completedDayIds)
      ? { completedDayIds: (data.progress as { completedDayIds: string[] }).completedDayIds }
      : { completedDayIds: [] },
  };

  await setCachedPlan(hash, plan);
  return { plan, fromCache: false };
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
  const url = apiUrl("study-chat");
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
  const url = apiUrl("generate-study-session");
  const data = await fetchJson<unknown>(url, { durationMin, topic, faithTradition, requestId: Date.now() });
  const raw = (data && typeof data === "object" && ((data as Record<string, unknown>).plan ?? (data as Record<string, unknown>).studyPlan ?? (data as Record<string, unknown>).data)) ?? data;
  return normalizePlan(raw);
}

// ── Life-planning API calls ───────────────────────────────────────────────────

export type OnboardingChatResponse = {
  reply: string;
  suggestedValues?: { text: string; description?: string }[];
  suggestedGoals?: { title: string; description?: string; milestones?: { title: string }[] }[];
  suggestedHabits?: { title: string; schedule: "daily" | "weekly" }[];
  onboardingReady?: boolean;
};

export async function onboardingChat(
  messages: { role: "user" | "assistant"; text: string }[],
  opts?: { signal?: AbortSignal }
): Promise<OnboardingChatResponse> {
  const url = apiUrl("onboarding/chat");
  return fetchJson<OnboardingChatResponse>(url, { messages }, opts);
}

export type ReflectionResponse = {
  summary: string;
  question: string;
  encouragement: string;
};

export async function generateReflection(params: {
  completedHabits: { name: string; count: number }[];
  goals: { title: string; milestonesCompleted: number }[];
  values: string[];
  previousReflections?: string[];
}): Promise<ReflectionResponse> {
  const url = apiUrl("reflection/generate");
  return fetchJson<ReflectionResponse>(url, params);
}
