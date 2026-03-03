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

    const { chapters } = body;
    if (!Array.isArray(chapters) || chapters.length === 0) {
      return send(res, 400, { error: "chapters must be a non-empty array of strings" });
    }

    const cleanedChapters = chapters
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter(Boolean)
      .slice(0, 12);
    if (cleanedChapters.length === 0) {
      return send(res, 400, { error: "chapters must contain at least one non-empty string" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return send(res, 500, {
        error: "OPENAI_API_KEY is not set in Vercel",
        details: "Set the env var and redeploy.",
      });
    }

    const system = `You are a Christian scripture study guide.

You MUST NEVER output full scripture passages or verse text.
You may only output:
- references (e.g. "Mosiah 4", "Alma 32:21–23"),
- short paraphrased summaries,
- high-level historical context,
- discussion and "look for" prompts,
- and official links to read the content on churchofjesuschrist.org or other official sites.

Return ONLY valid JSON (no markdown, no code fences) with:
{
  "chapters": [
    {
      "reference": string, // e.g. "Mosiah 4"
      "bigIdea": string,   // 1–2 sentences, paraphrased
      "crossReferences": [
        { "theme": string, "refs": string[] } // refs are scripture references only, no text
      ],
      "discussionQuestions": string[], // 3–6 prompts
      "lookFor": string[], // 2–4 prompts
      "context": string,   // short historical/background, paraphrased only
      "links": [
        { "label": string, "url": string } // scripture/talk URLs; prefer churchofjesuschrist.org chapter or talk pages
      ],
      "studyPlanSuggestion"?: string // optional short time-boxed suggestion
    }
  ]
}

Additional rules:
- For LDS standard works (Book of Mormon, Doctrine & Covenants, Pearl of Great Price) and General Conference talks:
  - DO NOT include any direct verse/talk text or long quotes.
  - Use paraphrased summaries only.
- For the Bible:
  - Assume we are NOT allowed to show full text; use the same "reference + summary + link" pattern.
- Cross references (refs) must be references only, no quoted text.`;

    const user = `User selected the following chapters for study:
${cleanedChapters.map((c) => `- ${c}`).join("\n")}

For each chapter, return a structured entry as described in the JSON schema. Keep everything concise and focused on helping a person study and reflect today.`;

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
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
      console.error("study/generate: model returned non-JSON", text?.slice(0, 400));
      return send(res, 500, {
        error: "Model returned non-JSON",
        sample: String(text).slice(0, 200),
      });
    }

    const safe = raw && typeof raw === "object" ? raw : { chapters: [] };
    if (!Array.isArray(safe.chapters)) {
      safe.chapters = [];
    }

    return send(res, 200, {
      chapters: safe.chapters,
    });
  } catch (err) {
    console.error("study/generate error", err);
    const message = err instanceof Error ? err.message : String(err);
    const trimmed = message.length > 160 ? message.slice(0, 160) + "…" : message;
    return send(res, 500, { error: "Server error", details: trimmed });
  }
}

