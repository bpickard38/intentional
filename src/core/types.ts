export type HabitSchedule =
  | { type: "daily" }
  | {
      type: "weekly";
      /**
       * Optional target completions per week (existing behavior).
       * When omitted, streak logic still works based on scheduled days.
       */
      targetPerWeek?: number;
      /**
       * Optional days of week this habit is scheduled for (0 = Sunday ... 6 = Saturday).
       * When omitted, treat all days in the week as candidates for completion.
       */
      daysOfWeek?: number[];
    };

export type Habit = {
  id: string;
  /** Legacy name field used throughout Today screen. */
  name: string;
  /** Optional display title; fall back to `name` when not set. */
  title?: string;
  schedule: HabitSchedule;
  reminderTime?: string;
  createdAt: string;
  /** Soft-delete / hide from normal lists without losing history. */
  archived?: boolean;
};

export type HabitLog = {
  date: string;
  completedHabitIds: string[];
};

export type ScriptureItem = { title: string; ref: string; summary: string; url: string };
export type TalkItem = { title: string; speaker?: string; summary: string; url: string };
export type ArticleItem = { title: string; summary: string; url: string };

export type StudyPlan = {
  scriptures: ScriptureItem[];
  talks: TalkItem[];
  articles?: ArticleItem[];
  reflectionPrompts: string[];
  actionStep: string;
};

/** User preference: Key Verses only, Full Chapter only, or Both. */
export type StudyDisplayMode = "KEY_VERSES" | "FULL_CHAPTER" | "BOTH";

/** Study depth - user-facing toggle for how rich the result is. */
export type StudyDepth = "QUICK" | "GUIDED" | "DEEP_DIVE";

/** Scripture source for copyright: do not show full text for BOM, DNC, PGP. */
export type ScriptureSource = "BOM" | "DNC" | "PGP" | "BIBLE";

export type StudyMode = "devotional" | "deep" | "challenge";

export type StudyPlanV2 = {
  title: string;
  durationMin: 15 | 30 | 60;
  topic: string;
  /** Legacy internal study mode (devotional/deep/challenge). */
  mode: StudyMode;

  /** NORTH STAR: Big Idea hero at the top of the result. */
  bigIdeaHeadline?: string;
  bigIdeaSupport?: string;

  /** Study depth for this plan (Quick / Guided / Deep Dive). */
  studyDepth?: StudyDepth;

  /** Timer-friendly micro steps (kept for the header timer experience). */
  planSteps: { minutes: number; label: string; instruction: string }[];

  /**
   * Micro study plan rows:
   * - read: 1–2 chapter references + official URLs
   * - lookFor: one line focus lens
   * - ponder: one reflection question
   */
  studyPlan?: {
    read: { source: ScriptureSource; reference: string; url: string }[];
    lookFor: string;
    ponder: string;
  };

  /**
   * Main reading cards for the session (1–3).
   * Chapter-based references with per-card big idea and key moments.
   */
  readingCards?: {
    source: ScriptureSource;
    reference: string;
    url: string;
    /** One-sentence big idea for this scripture (not the overall topic). */
    bigIdea?: string;
    whyOneLine: string;
    keyMoments: string[];
    keyVerses?: string[];
    crossRefs?: { label: string; url: string }[];
  }[];

  /**
   * Optional deep dive accordion content.
   * - background bullets
   * - cross refs as chips
   * - related talk (LDS only)
   */
  deepDive?: {
    backgroundBullets?: string[];
    crossRefs?: { label: string; url: string }[];
    talk?: {
      title: string;
      speaker: string;
      whyOneLine: string;
      officialUrl: string;
    };
  };

  /**
   * Legacy scripture/talk/article fields kept for compatibility (history, old sessions).
   * New UI primarily uses bigIdeaHeadline/studyPlan/readingCards/deepDive.
   */
  scriptures: {
    ref: string;
    title: string;
    /** When set, use new card UI (reference + why + themes + official link); otherwise legacy. */
    source?: ScriptureSource;
    keyVerses?: string[];
    why?: string[];
    themes?: string[];
    /** Official read link; prefer over url for display. */
    officialUrl?: string;
    passage: string;
    background: string;
    /** AI summary of key verses (for copyrighted sources; do not show full text). */
    keyVersesSummary?: string;
    observationQuestions: string[];
    interpretation: string[];
    crossReferences: { ref: string; why: string; url: string; passage?: string }[];
    summary: string;
    url: string;
  }[];
  talks: {
    title: string;
    speaker?: string;
    summary: string;
    /** Official talk page URL; if missing, show "Link unavailable". */
    officialUrl?: string;
    url: string;
    why?: string[];
    themes?: string[];
    conference?: string;
  }[];
  articles: { title: string; summary: string; url: string }[];
  /** Prompts shown in the Reflection section; keep this short (1–2) for new UI. */
  reflectionPrompts: string[];
  /** Kept for compatibility; new UI does not expose explicit "next step". */
  actionStep: string;
  /** Optional recap; new UI focuses on Big Idea hero + micro plan instead. */
  studySummary?: string;
  optional?: { memoryVerse?: string; prayerPrompt?: string };
};

export type StudyTheme = {
  id: string;
  title: string;
  summary?: string;
};

export type StudyCrossReference = {
  /** Optional theme id this group belongs to (matches StudyTheme.id). */
  themeId?: string;
  /** Optional short label for this group (e.g., "Faith and humility"). */
  label?: string;
  /** Scripture or talk references only; no verse text or quotes. */
  refs: string[];
};

export type StudyChapterResult = {
  reference: string; // e.g., "Mosiah 4"
  bigIdea: string; // 1–3 sentences
  themes: StudyTheme[]; // 4–8 themes max
  lookFor: string[]; // 3–5 prompts max
  crossReferences: StudyCrossReference[]; // grouped by theme, references only
  discussionQuestions: string[]; // optional in API, always safe to treat as array
  context: string; // short bullets or short paragraph
  links: { label: string; url: string }[]; // churchofjesuschrist.org links
  /** Optional per-theme related chapters; key is StudyTheme.id, values are references only. */
  relatedChaptersByTheme?: Record<string, string[]>;
  /** Optional short time-boxed suggestion kept for compatibility with existing UI. */
  studyPlanSuggestion?: string;
};

// Backwards-compatible alias for existing references.
export type ChapterStudyResult = StudyChapterResult;

export type ChapterStudyResponse = {
  chapters: StudyChapterResult[];
  cacheKey?: string;
  generatedAt: string;
};

export type StudyJournalEntry = {
  reference: string;
  text: string;
  updatedAt: string;
};

/** Persisted per-chapter pinned "Look for" prompts keyed by chapter reference. */
export type StudyPinsMap = Record<string, string[]>;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type TimerState = {
  remainingSec: number;
  isRunning: boolean;
  currentStepIndex: number;
};

export type StudySessionStatus = "draft" | "in_progress" | "completed";

export type StudySession = {
  id: string;
  date: string;
  durationMin: 15 | 30 | 60;
  topic: string;
  plan: StudyPlanV2;
  journal?: { learned: string; felt: string; action: string };
  chat?: ChatMessage[];
  status: StudySessionStatus;
  startedAt?: string;
  completedAt?: string;
  timerState?: TimerState;
  createdAt: string;
};

export type FaithTradition =
  | "Christian"
  | "Catholic"
  | "Protestant"
  | "LDS"
  | "Other"
  | "PreferNotToSay";

export type UserProfile = {
  id: string;
  faithTradition: FaithTradition;
  /** Key Verses | Full Chapter | Both. Default BOTH. */
  studyDisplayMode?: StudyDisplayMode;
   /** Quick | Guided | Deep Dive. Default GUIDED. */
   studyDepth?: StudyDepth;
  createdAt: string;
};

/** Sources toggles for AI Study Plan Generator. */
export type StudyPlanSources = {
  bible: boolean;
  bom: boolean;
  dc: boolean;
  pgp: boolean;
};

/** Single day in a generated study plan (references only, no verse text). */
export type StudyPlanDay = {
  id: string;
  dayNumber: number;
  focus: string;
  references: string[];
  bigIdea: string;
  lookFor: string[];
  reflection: string;
  whyNext?: string;
  linkUrls: { label: string; url: string }[];
};

/** Multi-day study plan (AI-generated, persisted locally). */
export type StudyPlanDoc = {
  id: string;
  title: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  length: number;
  minutesPerDay: number;
  sources: StudyPlanSources;
  description: string;
  days: StudyPlanDay[];
  progress: { completedDayIds: string[] };
};
