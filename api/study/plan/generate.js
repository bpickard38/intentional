import OpenAI from "openai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function send(res, status, body) {
  res.setHeader("Content-Type", "application/json");
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).json(body);
}

function generateId() {
  return "plan-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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

    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const length = Math.min(30, Math.max(3, Number(body.length) || 7));
    const minutesPerDay = [5, 10, 15, 20].includes(Number(body.minutesPerDay))
      ? Number(body.minutesPerDay)
      : 10;
    const sources = {
      bible: body.sources?.bible !== false,
      bom: body.sources?.bom !== false,
      dc: body.sources?.dc !== false,
      pgp: body.sources?.pgp !== false,
    };

    if (!topic) {
      return send(res, 400, { error: "topic is required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return send(res, 500, {
        error: "OPENAI_API_KEY is not set in Vercel",
        details: "Set the env var and redeploy.",
      });
    }

    const sourceList = [];
    if (sources.bible) sourceList.push("Bible");
    if (sources.bom) sourceList.push("Book of Mormon");
    if (sources.dc) sourceList.push("Doctrine and Covenants");
    if (sources.pgp) sourceList.push("Pearl of Great Price");

    const system = `You are a Christian scripture study guide that creates multi-day study plans.

NON-NEGOTIABLE COPYRIGHT RULES:
- You MUST NEVER output full scripture passages, verse text, or long quotations.
- Output REFERENCES ONLY (e.g. "Alma 32", "Mosiah 4", "Enos 1"). No verse text or quotes.
- Include official churchofjesuschrist.org links for each chapter reference.

Return ONLY valid JSON (no markdown, no code fences) with this exact shape:
{
  "title": string,        // Short plan title, e.g. "7-Day Plan: Faith"
  "description": string,  // 1–2 sentences describing the plan
  "days": [
    {
      "dayNumber": number,
      "focus": string,    // One short sentence, action-oriented, <= 18 words
      "references": string[],  // 1 chapter (default) or 2 short chapters only if user has >= 15 min/day
      "bigIdea": string,  // 1–2 sentences only
      "lookFor": string[],    // 2–4 bullet prompts
      "reflection": string,    // 1 question
      "whyNext": string,  // Optional: 1 sentence linking this day to the previous
      "linkUrls": [ { "label": string, "url": string } ]  // Official link per reference
    }
  ]
}

RULES:
- Default 1 chapter per day. Only use 2 references for a day if minutesPerDay >= 15 and both chapters are short (e.g. Enos 1, Moroni 7).
- Progression must be logical: build a coherent arc (e.g. definition → examples → application → deeper principle → commitment).
- focus: <= 18 words, action-oriented.
- bigIdea: <= 2 sentences.
- lookFor: exactly 2–4 items.
- reflection: exactly 1 question.
- whyNext: optional 1 sentence for day 2 onward linking to previous day.
- linkUrls: use https://www.churchofjesuschrist.org/study/scriptures/... or equivalent for each reference.`;

    const user = `Create a ${length}-day study plan on the topic: "${topic}".

Constraints:
- Minutes per day: ${minutesPerDay}. ${minutesPerDay >= 15 ? "You may assign 2 short chapters to a day if it fits." : "Use 1 chapter per day."}
- Use only these sources: ${sourceList.join(", ") || "Bible, Book of Mormon, D&C, Pearl of Great Price"}.

Return the JSON object with "title", "description", and "days" as specified. Each day must have dayNumber (1 to ${length}), focus, references (array of chapter refs only), bigIdea, lookFor (2–4 items), reflection (1 question), whyNext (optional from day 2), and linkUrls (one official link per reference). No verse text anywhere.`;

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const text = completion.choices?.[0]?.message?.content || "{}";
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      console.error("study/plan/generate: non-JSON", text?.slice(0, 400));
      return send(res, 500, {
        error: "Model returned non-JSON",
        sample: String(text).slice(0, 200),
      });
    }

    const now = new Date().toISOString();
    const planId = generateId();
    const days = Array.isArray(raw.days) ? raw.days : [];
    const daysNormalized = days.slice(0, length).map((d, i) => ({
      id: `${planId}-day-${i + 1}`,
      dayNumber: typeof d.dayNumber === "number" ? d.dayNumber : i + 1,
      focus: String(d.focus ?? "").slice(0, 200),
      references: Array.isArray(d.references) ? d.references.map((r) => String(r).trim()).filter(Boolean).slice(0, 2) : [],
      bigIdea: String(d.bigIdea ?? "").slice(0, 500),
      lookFor: Array.isArray(d.lookFor) ? d.lookFor.map((l) => String(l)).filter(Boolean).slice(0, 4) : [],
      reflection: String(d.reflection ?? "").slice(0, 300),
      whyNext: d.whyNext != null ? String(d.whyNext).slice(0, 200) : undefined,
      linkUrls: Array.isArray(d.linkUrls) ? d.linkUrls.slice(0, 4).map((l) => ({ label: String(l.label ?? "Open"), url: String(l.url ?? "") })) : [],
    }));

    const plan = {
      id: planId,
      title: String(raw.title ?? `${topic} – ${length} Day Plan`).slice(0, 120),
      topic,
      createdAt: now,
      updatedAt: now,
      length: daysNormalized.length,
      minutesPerDay,
      sources,
      description: String(raw.description ?? "").slice(0, 500),
      days: daysNormalized,
      progress: { completedDayIds: [] },
    };

    return send(res, 200, plan);
  } catch (err) {
    console.error("study/plan/generate error", err);
    const message = err instanceof Error ? err.message : String(err);
    const trimmed = message.length > 160 ? message.slice(0, 160) + "…" : message;
    return send(res, 500, { error: "Server error", details: trimmed });
  }
}
