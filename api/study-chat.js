import OpenAI from "openai";
import { rateLimit } from "./_lib/rateLimit.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function send(res, status, body) {
  res.setHeader("Content-Type", "application/json");
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).json(body);
}

function condensePlan(plan) {
  if (!plan || typeof plan !== "object") return "";
  const parts = [];
  if (plan.topic) parts.push(`Topic: ${plan.topic}`);
  if (plan.mode) parts.push(`Mode: ${plan.mode}`);
  if (Array.isArray(plan.scriptures) && plan.scriptures.length > 0) {
    parts.push(
      "Scriptures: " +
        plan.scriptures
          .map(
            (s) =>
              `${s.ref || "?"}: ${(s.background || s.summary || "").slice(0, 120)}…`
          )
          .join(" | ")
    );
    plan.scriptures.forEach((s) => {
      if (Array.isArray(s.crossReferences) && s.crossReferences.length > 0) {
        parts.push(
          `Cross-refs (${s.ref}): ` +
            s.crossReferences.map((c) => `${c.ref}: ${c.why || ""}`).join("; ")
        );
      }
    });
  }
  if (Array.isArray(plan.reflectionPrompts) && plan.reflectionPrompts.length > 0) {
    parts.push("Reflection prompts: " + plan.reflectionPrompts.join(" | "));
  }
  if (plan.actionStep) parts.push("Action step: " + plan.actionStep);
  return parts.join("\n");
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (!rateLimit(req, res)) return;

  try {
    if (req.method !== "POST") {
      return send(res, 405, { error: "Method not allowed" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return send(res, 400, { error: "Invalid JSON body" });
      }
    }
    body = body || {};

    const { topic, mode, faithTradition, userQuestion, plan, lastMessages } = body;

    if (!userQuestion || typeof userQuestion !== "string" || !userQuestion.trim()) {
      return send(res, 400, { error: "userQuestion is required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return send(res, 500, { error: "OPENAI_API_KEY is not set in Vercel", details: "Set the env var and redeploy." });
    }

    const tradition = (faithTradition && String(faithTradition).trim()) || "Christian";
    const condensed = condensePlan(plan);
    const recent = Array.isArray(lastMessages) ? lastMessages.slice(-6) : [];

    const system = `You are a supportive Christian study mentor (Mentor style A). Be short, punchy, practical. Not preachy; no long essays.

Rules:
- Answer in 6–10 sentences max.
- Give 1 direct answer to the user's question.
- Give 1 practical next step they can do today.
- Optionally 1 follow-up question to deepen reflection.
- Optionally a "goDeeper" suggestion (e.g. a scripture to re-read, a question to sit with).
- Respect all Christian traditions. User's faithTradition: ${tradition}. Avoid denominational controversy.

Current study context:
Topic: ${topic || "general"}
Mode: ${mode || "devotional"}

Condensed plan (for context only):
${condensed || "(no plan provided)"}

Respond with valid JSON only, no markdown:
{
  "answer": string (your main response, 6–10 sentences),
  "followUpQuestion": string (optional, one question to ponder),
  "goDeeper": string (optional, e.g. "Re-read [ref] and sit with the question: ...")
}`;

    const messages = [
      { role: "system", content: system.trim() },
      ...recent.map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.text ?? m?.content ?? "")
      })),
      { role: "user", content: userQuestion.trim() }
    ].filter((m) => m.content);

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages,
      response_format: { type: "json_object" }
    });

    const text = completion.choices?.[0]?.message?.content || "{}";
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      console.error("Study-chat model returned non-JSON", text?.slice(0, 300));
      return send(res, 500, { error: "Model returned non-JSON" });
    }

    const result = {
      answer: String(raw?.answer ?? "").trim() || "I’m not sure how to answer that. Try rephrasing or ask about a specific part of your study."
    };
    if (raw?.followUpQuestion && String(raw.followUpQuestion).trim()) {
      result.followUpQuestion = String(raw.followUpQuestion).trim();
    }
    if (raw?.goDeeper && String(raw.goDeeper).trim()) {
      result.goDeeper = String(raw.goDeeper).trim();
    }

    return send(res, 200, result);
  } catch (err) {
    console.error(err);
    // Full error is in the server logs; never echo upstream messages to clients.
    return send(res, 500, { error: "Server error" });
  }
}
