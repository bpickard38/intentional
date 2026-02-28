import type { StudyPlan } from "@/src/core/types";

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

export function fallbackPlan(durationMin: 15 | 30 | 60, topic: string): StudyPlan {
  const scriptures = [
    { title: "Trust in the Lord", ref: "Proverbs 3:5-6", summary: "Trust in the Lord with all your heart.", url: "https://www.churchofjesuschrist.org/study/scriptures/ot/prov/3?lang=eng" },
    { title: "Peace", ref: "John 14:27", summary: "Peace I leave with you.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/john/14?lang=eng" },
  ];
  if (durationMin >= 30) {
    scriptures.push({ title: "Strength", ref: "Philippians 4:13", summary: "I can do all things through Christ.", url: "https://www.churchofjesuschrist.org/study/scriptures/nt/philip/4?lang=eng" });
  }
  return {
    scriptures,
    talks: [{ title: "General Conference talk", speaker: "—", summary: "Search for a talk on: " + topic, url: "https://www.churchofjesuschrist.org/general-conference?lang=eng" }],
    reflectionPrompts: [
      "What stood out to you from these scriptures?",
      "How can you apply this to your life this week?",
    ],
    actionStep: "Choose one prompt above and write a short reflection, then pick one action to take today.",
  };
}
