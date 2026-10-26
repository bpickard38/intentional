import OpenAI from "openai";
import { rateLimit } from "../_lib/rateLimit.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a warm, thoughtful life coach helping someone discover their core values and set meaningful goals.

Your job is to have a natural conversation to help the user:
1. Identify 3-5 core values (things that matter most to them in life, e.g. "family", "health", "creativity", "growth")
2. Define 1-3 concrete goals tied to those values
3. Suggest 1-2 small daily or weekly habits for each goal

Guidelines:
- Be warm, curious, and encouraging — not clinical
- Ask one question at a time
- Reflect back what you hear before asking the next question
- When you have enough to suggest values/goals, include them in your response as JSON
- Keep responses concise (2-4 sentences max)

When you have gathered enough information to suggest values and goals, include this JSON block at the END of your message (after your conversational reply):

SUGGESTIONS_JSON:{"suggestedValues":[{"text":"...","description":"..."}],"suggestedGoals":[{"title":"...","description":"...","milestones":[{"title":"..."}]}],"suggestedHabits":[{"title":"...","schedule":"daily"}],"onboardingReady":true}

Only include SUGGESTIONS_JSON when you have enough context (usually after 3-4 exchanges). Set onboardingReady to true only when you have at least 2 values and 1 goal.`;

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages = [] } = req.body ?? {};

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    // Parse optional suggestions JSON block
    let reply = raw;
    let suggestedValues;
    let suggestedGoals;
    let suggestedHabits;
    let onboardingReady = false;

    const jsonMatch = raw.match(/SUGGESTIONS_JSON:(\{.*\})/s);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        suggestedValues = parsed.suggestedValues;
        suggestedGoals = parsed.suggestedGoals;
        suggestedHabits = parsed.suggestedHabits;
        onboardingReady = parsed.onboardingReady ?? false;
      } catch {
        // ignore parse errors
      }
      reply = raw.replace(/SUGGESTIONS_JSON:\{.*\}/s, "").trim();
    }

    return res.status(200).json({
      reply,
      suggestedValues,
      suggestedGoals,
      suggestedHabits,
      onboardingReady,
    });
  } catch (err) {
    console.error("onboarding/chat error", err);
    return res.status(500).json({ error: "Failed to generate response" });
  }
}
