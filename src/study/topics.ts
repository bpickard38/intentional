import type { StudyPlan, ScriptureItem } from "@/src/core/types";

export const TOPIC_SUGGESTIONS: string[] = [
  "Faith",
  "Anxiety & Peace",
  "Forgiveness",
  "Purpose",
  "Gratitude",
  "Discipline",
  "Relationships",
  "Temptation",
  "Guidance",
];

const SCRIPTURE_POOL: ScriptureItem[] = [
  { title: "Trust in the Lord", ref: "Proverbs 3:5-6", summary: "Trust in the Lord with all your heart.", url: "https://www.churchofjesuschrist.org/study/scriptures/ot/prov/3?lang=eng" },
  { title: "Peace", ref: "John 14:27", summary: "Peace I leave with you.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/john/14?lang=eng" },
  { title: "Strength", ref: "Philippians 4:13", summary: "I can do all things through Christ.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/philip/4?lang=eng" },
  { title: "Love one another", ref: "John 13:34-35", summary: "A new commandment: love one another.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/john/13?lang=eng" },
  { title: "The Lord is my shepherd", ref: "Psalm 23:1", summary: "The Lord is my shepherd; I shall not want.", url: "https://www.churchofjesuschrist.org/study/scriptures/ot/ps/23?lang=eng" },
  { title: "Be still", ref: "Psalm 46:10", summary: "Be still, and know that I am God.", url: "https://www.churchofjesuschrist.org/study/scriptures/ot/ps/46?lang=eng" },
  { title: "Faith and works", ref: "James 2:17", summary: "Faith without works is dead.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/james/2?lang=eng" },
  { title: "Do not be anxious", ref: "Matthew 6:34", summary: "Do not be anxious about tomorrow.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/matt/6?lang=eng" },
  { title: "Forgiveness", ref: "Matthew 18:21-22", summary: "Forgive seventy times seven.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/matt/18?lang=eng" },
  { title: "Gratitude", ref: "1 Thessalonians 5:18", summary: "Give thanks in all circumstances.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/1-thes/5?lang=eng" },
  { title: "Guidance", ref: "Proverbs 16:9", summary: "The heart plans, but the Lord establishes steps.", url: "https://www.churchofjesuschrist.org/study/scriptures/ot/prov/16?lang=eng" },
  { title: "Temptation", ref: "1 Corinthians 10:13", summary: "God will not let you be tempted beyond what you can bear.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/1-cor/10?lang=eng" },
];

const REFLECTION_PROMPTS_POOL: string[] = [
  "What stood out to you from these scriptures?",
  "How can you apply this to your life this week?",
  "Where did you see God in this study?",
  "What one thing will you do differently today?",
  "What question do you still have?",
  "How does this connect to your current challenges?",
];

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = shuffle(arr);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

export function fallbackPlan(durationMin: 15 | 30 | 60, topic: string): StudyPlan {
  const count = durationMin >= 60 ? 3 : durationMin >= 30 ? 3 : 2;
  const scriptures = pickRandom(SCRIPTURE_POOL, count);
  const reflectionPrompts = pickRandom(REFLECTION_PROMPTS_POOL, 2);
  return {
    scriptures,
    talks: [{ title: "General Conference talk", speaker: "—", summary: "Search for a talk on: " + topic, url: "https://www.churchofjesuschrist.org/general-conference?lang=eng" }],
    reflectionPrompts,
    actionStep: "Choose one prompt above and write a short reflection, then pick one action to take today.",
  };
}
