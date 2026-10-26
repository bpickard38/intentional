import OpenAI from "openai";
import { rateLimit } from "../_lib/rateLimit.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    completedHabits = [],
    goals = [],
    values = [],
    previousReflections = [],
  } = req.body ?? {};

  const habitSummary = completedHabits
    .map((h) => `- ${h.name} (completed ${h.count}x)`)
    .join("\n");

  const goalSummary = goals
    .map((g) => `- ${g.title} (${g.milestonesCompleted} milestones completed)`)
    .join("\n");

  const valuesList = values.join(", ");

  const prompt = `The user's core values are: ${valuesList || "not set yet"}.

This week they completed:
${habitSummary || "No habits logged this week."}

Progress on goals:
${goalSummary || "No goals tracked."}

${previousReflections.length > 0 ? `Previous reflection questions asked: ${previousReflections.slice(-3).join("; ")}` : ""}

Write a brief, warm weekly reflection for this person. Include:
1. A 2-3 sentence summary of what they accomplished and how it connects to their values
2. One thoughtful, open-ended reflective question (not something you've asked recently)
3. A one-line encouragement

Respond as JSON: {"summary":"...","question":"...","encouragement":"..."}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a warm life coach who helps people reflect on their week with intention and compassion. Always respond as valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.9,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}"
    );

    return res.status(200).json({
      summary: parsed.summary ?? "",
      question: parsed.question ?? "",
      encouragement: parsed.encouragement ?? "",
    });
  } catch (err) {
    console.error("reflection/generate error", err);
    return res.status(500).json({ error: "Failed to generate reflection" });
  }
}
