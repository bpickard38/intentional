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
    background: string;
    observationQuestions: string[];
    interpretation: string[];
    crossReferences: { ref: string; why: string; url: string }[];
    summary: string;
    url: string;
  }[];
  talks: { title: string; speaker?: string; summary: string; url: string }[];
  articles: { title: string; summary: string; url: string }[];
  reflectionPrompts: string[];
  actionStep: string;
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
  createdAt: string;
};
