import type { StudyPlanV2, StudyMode } from "@/src/core/types";

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

const SCRIPTURE_V2_POOL: StudyPlanV2["scriptures"][0][] = [
  { ref: "Proverbs 3:5-6", title: "Trust in the Lord", passage: "5 Trust in the Lord with all your heart, and do not lean on your own understanding. 6 In all your ways acknowledge him, and he will make straight your paths.", background: "Trust in the Lord with all your heart.", observationQuestions: ["What does it mean to trust?", "What are we not to lean on?"], interpretation: ["God directs our paths when we trust Him."], crossReferences: [{ ref: "Psalm 37:5", why: "Commit your way", url: "https://www.biblegateway.com/passage/?search=Psalm+37:5", passage: "Commit your way to the Lord; trust in him, and he will act." }], summary: "Trust in the Lord with all your heart.", url: "https://www.biblegateway.com/passage/?search=Proverbs+3:5-6" },
  { ref: "John 14:27", title: "Peace", passage: "Peace I leave with you; my peace I give to you. Not as the world gives do I give to you. Let not your hearts be troubled, neither let them be afraid.", background: "Jesus offers peace that the world cannot give.", observationQuestions: ["What kind of peace does Jesus give?"], interpretation: ["His peace calms our fears."], crossReferences: [{ ref: "Philippians 4:7", why: "Peace that surpasses understanding", url: "https://www.biblegateway.com/passage/?search=Philippians+4:7", passage: "And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus." }], summary: "Peace I leave with you.", url: "https://www.biblegateway.com/passage/?search=John+14:27" },
  { ref: "Philippians 4:13", title: "Strength", passage: "I can do all things through him who strengthens me.", background: "Paul writes from prison about strength in Christ.", observationQuestions: ["What can we do through Christ?"], interpretation: ["We are empowered for every good work."], crossReferences: [{ ref: "2 Corinthians 12:9", why: "Strength in weakness", url: "https://www.biblegateway.com/passage/?search=2+Corinthians+12:9", passage: "My grace is sufficient for you, for my power is made perfect in weakness." }], summary: "I can do all things through Christ.", url: "https://www.biblegateway.com/passage/?search=Philippians+4:13" },
  { ref: "Psalm 23:1", title: "The Lord is my shepherd", passage: "The Lord is my shepherd; I shall not want.", background: "David describes God as shepherd.", observationQuestions: ["What does the shepherd provide?"], interpretation: ["We lack nothing when we follow Him."], crossReferences: [{ ref: "John 10:11", why: "Good Shepherd", url: "https://www.biblegateway.com/passage/?search=John+10:11", passage: "I am the good shepherd. The good shepherd lays down his life for the sheep." }], summary: "The Lord is my shepherd; I shall not want.", url: "https://www.biblegateway.com/passage/?search=Psalm+23" },
  { ref: "Matthew 6:34", title: "Do not be anxious", passage: "Therefore do not be anxious about tomorrow, for tomorrow will be anxious for itself. Sufficient for the day is its own trouble.", background: "Jesus teaches on worry and tomorrow.", observationQuestions: ["What are we told not to do about tomorrow?"], interpretation: ["Each day has enough trouble; focus on today."], crossReferences: [{ ref: "1 Peter 5:7", why: "Cast your anxiety on Him", url: "https://www.biblegateway.com/passage/?search=1+Peter+5:7", passage: "Casting all your anxieties on him, because he cares for you." }], summary: "Do not be anxious about tomorrow.", url: "https://www.biblegateway.com/passage/?search=Matthew+6:34" },
  { ref: "James 2:17", title: "Faith and works", passage: "So also faith by itself, if it does not have works, is dead.", background: "James argues that faith without works is dead.", observationQuestions: ["What kind of faith is dead?"], interpretation: ["Genuine faith produces action."], crossReferences: [{ ref: "Ephesians 2:8-10", why: "Saved for good works", url: "https://www.biblegateway.com/passage/?search=Ephesians+2:8-10", passage: "8 For by grace you have been saved through faith. And this is not your own doing; it is the gift of God, 9 not a result of works, so that no one may boast. 10 For we are his workmanship, created in Christ Jesus for good works, which God prepared beforehand, that we should walk in them." }], summary: "Faith without works is dead.", url: "https://www.biblegateway.com/passage/?search=James+2:17" },
];

const REFLECTION_DEVOTIONAL = ["What touched your heart?", "How can you rest in this today?"];
const REFLECTION_DEEP = ["What does the text say? What does it mean? How does it apply?", "What cross-references deepen your understanding?"];
const REFLECTION_CHALLENGE = ["What is one hard thing this calls you to do?", "What will you do differently by tomorrow?"];

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

function buildPlanSteps(durationMin: number, mode: StudyMode): { minutes: number; label: string; instruction: string }[] {
  if (mode === "devotional") {
    if (durationMin <= 15) return [{ minutes: 15, label: "Read & reflect", instruction: "Read the passage slowly. Notice what stirs your heart." }];
    if (durationMin <= 30) return [{ minutes: 10, label: "Read", instruction: "Read the scripture once slowly." }, { minutes: 10, label: "Reflect", instruction: "What is God saying to you?" }, { minutes: durationMin - 20, label: "Pray", instruction: "Respond in prayer." }];
    return [{ minutes: 10, label: "Read", instruction: "Read the passage." }, { minutes: 10, label: "Reflect", instruction: "Notice one phrase that stands out." }, { minutes: 15, label: "Meditate", instruction: "Hold that phrase before God." }, { minutes: durationMin - 35, label: "Pray & journal", instruction: "Pray and jot one sentence." }];
  }
  if (mode === "deep") {
    const step = Math.max(5, Math.floor(durationMin / 4));
    const steps: { minutes: number; label: string; instruction: string }[] = [];
    let remaining = durationMin;
    const labels = ["Read & observe", "Interpret", "Cross-references", "Apply"];
    for (let i = 0; i < 4 && remaining > 0; i++) {
      const min = i < 3 ? Math.min(step, remaining) : remaining;
      steps.push({ minutes: min, label: labels[i], instruction: labels[i] + "." });
      remaining -= min;
    }
    if (remaining > 0 && steps.length) steps[steps.length - 1].minutes += remaining;
    return steps;
  }
  const step = Math.max(5, Math.floor(durationMin / 3));
  let rem = durationMin;
  return [
    { minutes: step, label: "Read", instruction: "Read the passage. What challenges you?" },
    { minutes: step, label: "Reflect", instruction: "What is one concrete action this calls for?" },
    { minutes: rem - step * 2, label: "Commit", instruction: "Write one commitment and pray for strength." },
  ];
}

export function fallbackPlanV2(
  durationMin: 15 | 30 | 60,
  topic: string,
  mode: StudyMode,
  faithTradition?: string
): StudyPlanV2 {
  const numScriptures = durationMin >= 60 ? 4 : durationMin >= 30 ? 3 : 2;
  const scriptures = pickRandom(SCRIPTURE_V2_POOL, numScriptures);
  if (mode === "devotional" && scriptures.length > 0) {
    scriptures.forEach((s) => {
      s.crossReferences = s.crossReferences.slice(0, 1);
    });
  }
  if (mode === "challenge" && scriptures.length > 0) {
    scriptures.forEach((s) => {
      s.observationQuestions = [...(s.observationQuestions ?? []), "What does this require of you today?"];
    });
  }
  const reflectionPrompts = mode === "devotional" ? REFLECTION_DEVOTIONAL : mode === "deep" ? REFLECTION_DEEP : REFLECTION_CHALLENGE;
  const actionStep =
    mode === "devotional"
      ? "Carry one word or phrase with you today."
      : mode === "deep"
        ? "Write one paragraph connecting this to another passage."
        : "Choose one action to do in the next 24 hours and tell someone.";

  const planSteps = buildPlanSteps(durationMin, mode);
  const sum = planSteps.reduce((s, st) => s + st.minutes, 0);
  if (sum !== durationMin && planSteps.length > 0) {
    planSteps[planSteps.length - 1].minutes += durationMin - sum;
  }

  const isLDS = faithTradition === "LDS";
  return {
    title: topic,
    durationMin,
    topic,
    mode,
    planSteps,
    scriptures,
    talks: isLDS
      ? [
          {
            title: "General Conference",
            summary: "Search for a talk on: " + topic,
            url: "https://www.churchofjesuschrist.org/general-conference?lang=eng",
            officialUrl: undefined,
            speaker: undefined,
            conference: undefined,
            why: undefined,
            themes: undefined,
          },
        ]
      : [],
    articles: [],
    reflectionPrompts,
    actionStep,
    studySummary: `This plan focuses on "${topic}" with ${scriptures.length} passage${scriptures.length !== 1 ? "s" : ""} for ${durationMin} minutes of ${mode} study.`,
    optional: mode === "devotional" ? { prayerPrompt: "Ask God to make this word real to you today." } : undefined,
  };
}
