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

NON-NEGOTIABLE COPYRIGHT RULES:
- You MUST NEVER output full scripture passages, verse text, or long quotations.
- You MUST NEVER output any text of verses for LDS standard works (Book of Mormon, Doctrine & Covenants, Pearl of Great Price), the Bible, or General Conference talks.
- You may ONLY output:
  - references (e.g. "Mosiah 4", "Alma 32:21–23"),
  - short paraphrased summaries in your own words,
  - high-level historical or doctrinal context,
  - discussion and "look for" prompts,
  - and official links to read the content on churchofjesuschrist.org or other official sites.

Return ONLY valid JSON (no markdown, no code fences) with:
{
  "chapters": [
    {
      "reference": string, // e.g. "Mosiah 4"
      "bigIdea": string,   // 1–3 sentences, paraphrased
      "themes": [
        {
          "id": string,    // stable id you invent, like "grace-service"
          "title": string, // short phrase, e.g. "Grace and service"
          "summary"?: string // 1–2 sentence summary of the theme (optional)
        }
      ], // 4–8 themes max
      "lookFor": string[], // 3–5 prompts that help notice patterns while reading
      "crossReferences": [
        {
          "themeId"?: string, // matches one of themes[].id when applicable
          "label"?: string,   // short label like "Faith and humility"
          "refs": string[]    // scripture/talk references ONLY, no verse text
        }
      ],
      "discussionQuestions": string[], // 3–6 prompts
      "context": string,   // short historical/background, paraphrased only
      "links": [
        { "label": string, "url": string } // scripture/talk URLs; prefer churchofjesuschrist.org chapter or talk pages
      ],
      "relatedChaptersByTheme"?: {
        [themeId: string]: string[] // 3–6 conservative, relevant chapter references per theme (no text, references only)
      },
      "studyPlanSuggestion"?: string // optional short time-boxed suggestion
    }
  ]
}

Hard constraints:
- NEVER output scripture verse text or quotes.
- Cross references and relatedChaptersByTheme MUST be references only (no quoted text).
- Keep everything concise and structured exactly as the schema above.
- The JSON must be syntactically valid and match the schema (no extra top-level fields).`;

    const user = `User selected the following chapters for study:
${cleanedChapters.map((c) => `- ${c}`).join("\n")}

For each chapter, return ONE structured entry as described in the JSON schema.

Focus on:
- a clear Big Idea (hero summary),
- 4–8 concise themes,
- 3–5 "look for while reading" prompts,
- cross references grouped by theme (references only),
- related chapters per theme (3–6, references only),
- short context,
- and official links.

The JSON must be complete, concise, and directly usable by a mobile app without further reformatting.`;

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

