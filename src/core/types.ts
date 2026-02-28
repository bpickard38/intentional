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

export type StudySession = {
  id: string;
  date: string;
  durationMin: 15 | 30 | 60;
  topic: string;
  plan: StudyPlan;
  journal?: { learned: string; felt: string; action: string };
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
