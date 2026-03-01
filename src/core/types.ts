export type HabitSchedule =
  | { type: "daily" }
  | { type: "weekly"; targetPerWeek: number };

export type Habit = {
  id: string;
  name: string;
  schedule: HabitSchedule;
  reminderTime?: string;
  createdAt: string;
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

/** Scripture source for copyright: do not show full text for BOM, DNC, PGP. */
export type ScriptureSource = "BOM" | "DNC" | "PGP" | "BIBLE";

export type StudyMode = "devotional" | "deep" | "challenge";

export type StudyPlanV2 = {
  title: string;
  durationMin: 15 | 30 | 60;
  topic: string;
  mode: StudyMode;
  planSteps: { minutes: number; label: string; instruction: string }[];
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
  reflectionPrompts: string[];
  actionStep: string;
  /** 2–4 sentence recap; no "next step" planning UI. */
  studySummary?: string;
  optional?: { memoryVerse?: string; prayerPrompt?: string };
};

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
  createdAt: string;
};
