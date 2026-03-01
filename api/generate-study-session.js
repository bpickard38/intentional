import OpenAI from "openai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function bibleGatewayUrl(ref) {
  if (!ref || typeof ref !== "string") return "https://www.biblegateway.com/";
  const encoded = encodeURIComponent(ref.trim()).replace(/%20/g, "+");
  return `https://www.biblegateway.com/passage/?search=${encoded}&version=ESV`;
}

function safeUrl(url, fallbackQuery) {
  if (url && typeof url === "string" && url.startsWith("http")) return url;
  const q = encodeURIComponent(fallbackQuery || "Christian resource");
  return `https://www.google.com/search?q=${q}`;
}

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

    const { durationMin, topic, mode, faithTradition } = body;
    const validDurations = [15, 30, 60];
    const validModes = ["devotional", "deep", "challenge"];

    if (!validDurations.includes(Number(durationMin))) {
      return send(res, 400, { error: "durationMin must be 15, 30, or 60" });
    }
    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return send(res, 400, { error: "topic is required" });
    }
    if (!validModes.includes(mode)) {
      return send(res, 400, { error: 'mode must be "devotional", "deep", or "challenge"' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return send(res, 500, { error: "OPENAI_API_KEY is not set in Vercel", details: "Set the env var and redeploy." });
    }

    const tradition = (faithTradition && String(faithTradition).trim()) || "Christian";
    const isLDS = tradition === "LDS";

    const scriptureSourceRule = isLDS
      ? "- SCRIPTURES: Include Bible (OT/NT) AND Book of Mormon AND Doctrine and Covenants AND Pearl of Great Price. Use full names: e.g. \"1 Nephi 3:7\", \"Doctrine and Covenants 4:2\", \"Matthew 5:14-16\". For LDS scriptures use churchofjesuschrist.org URLs."
      : "- SCRIPTURES: Bible only (OT/NT). Use full book names: e.g. \"Matthew 5:14-16\", \"1 Corinthians 13:4-7\". Use BibleGateway ESV URLs.";

    const talksRule = isLDS
      ? "- TALKS: Include General Conference talks relevant to the topic. Return 1-2 talks with title, speaker, summary, and churchofjesuschrist.org URL."
      : "- TALKS: Return empty array []. Do NOT include conference talks for non-LDS users.";

    const system = `You generate a Christian study session plan. Return ONLY valid JSON matching this exact schema (no markdown, no code fence):

{
  "title": string (short session title),
  "durationMin": ${durationMin},
  "topic": string,
  "mode": "${mode}",
  "planSteps": [{"minutes": number, "label": string, "instruction": string}],
  "scriptures": [{
    "ref": string (full reference, e.g. "1 Nephi 3:7" or "Matthew 5:14-16"),
    "title": string,
    "passage": string (the full text of the verse(s), include actual wording),
    "background": string (1-2 sentences),
    "observationQuestions": string[],
    "interpretation": string[],
    "crossReferences": [{"ref": string, "why": string, "url": string, "passage": string (full verse text)}],
    "summary": string,
    "url": string
  }],
  "talks": [{"title": string, "speaker": string, "summary": string, "url": string}],
  "articles": [{"title": string, "summary": string, "url": string}],
  "reflectionPrompts": string[],
  "actionStep": string,
  "optional": {"memoryVerse": string (optional), "prayerPrompt": string (optional)}
}

RULES:
- planSteps[].minutes must sum to exactly ${durationMin}. Include an opening prayer step and a closing prayer/commit step.
- For every scripture: set "passage" to the full verse text. Set "url" to BibleGateway (Bible) or churchofjesuschrist.org (LDS scriptures).
- For crossReferences: include "passage" with full verse text for each cross-ref.
- Never invent or guess URLs.
- User's faithTradition: ${tradition}. Avoid denominational controversy.
${scriptureSourceRule}
${talksRule}
- Mode behavior:
  - devotional: gentle, fewer cross-refs, more comfort and gratitude.
  - deep: more observation/interpretation questions and cross-refs.
  - challenge: include one "conviction question" in reflectionPrompts and a concrete, specific actionStep.`;

    const user = `Create a ${durationMin}-minute ${mode} study session on topic: "${String(topic).trim()}". Return only the JSON object.`;

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    });

    const text = completion.choices?.[0]?.message?.content || "{}";
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (parseErr) {
      console.error("Model returned non-JSON", text?.slice(0, 500));
      return send(res, 500, {
        error: "Model returned non-JSON",
        sample: String(text).slice(0, 200)
      });
    }

    const plan = raw?.plan ?? raw?.studyPlan ?? raw?.data ?? raw;
    const src = plan && typeof plan === "object" && !Array.isArray(plan) ? plan : raw;

    const planSteps = Array.isArray(src.planSteps) ? src.planSteps : [];
    const sum = planSteps.reduce((s, step) => s + (Number(step?.minutes) || 0), 0);
    if (planSteps.length > 0 && sum !== durationMin) {
      const last = planSteps[planSteps.length - 1];
      const diff = durationMin - (sum - (Number(last?.minutes) || 0));
      planSteps[planSteps.length - 1] = {
        ...(last && typeof last === "object" ? last : {}),
        minutes: Math.max(1, diff),
        label: last?.label ?? "Closing",
        instruction: last?.instruction ?? "Pray and commit."
      };
    }

    const scriptures = (Array.isArray(src.scriptures) ? src.scriptures : []).map((s) => {
      const ref = s?.ref || "";
      const cr = Array.isArray(s?.crossReferences) ? s.crossReferences : [];
      return {
        ref: String(ref),
        title: String(s?.title ?? ""),
        passage: String(s?.passage ?? ""),
        background: String(s?.background ?? ""),
        observationQuestions: Array.isArray(s?.observationQuestions) ? s.observationQuestions : [],
        interpretation: Array.isArray(s?.interpretation) ? s.interpretation : [],
        crossReferences: cr.map((c) => ({
          ref: String(c?.ref ?? ""),
          why: String(c?.why ?? ""),
          url: c?.url && String(c.url).startsWith("http") ? c.url : bibleGatewayUrl(c?.ref || ref),
          passage: String(c?.passage ?? "")
        })),
        summary: String(s?.summary ?? ""),
        url: s?.url && String(s.url).startsWith("http") ? s.url : bibleGatewayUrl(ref)
      };
    });

    const rawTalks = isLDS ? (Array.isArray(src.talks) ? src.talks : []) : [];
    const talks = rawTalks.map((t) => ({
      title: String(t?.title ?? ""),
      speaker: String(t?.speaker ?? ""),
      summary: String(t?.summary ?? ""),
      url: safeUrl(t?.url, t?.title || topic)
    }));

    const articles = (Array.isArray(src.articles) ? src.articles : []).map((a) => ({
      title: String(a?.title ?? ""),
      summary: String(a?.summary ?? ""),
      url: safeUrl(a?.url, a?.title || topic)
    }));

    const reflectionPrompts = Array.isArray(src.reflectionPrompts) ? src.reflectionPrompts : [];
    const actionStep = String(src?.actionStep ?? "");
    const optional = src?.optional && typeof src.optional === "object"
      ? {
          ...(src.optional.memoryVerse != null && { memoryVerse: String(src.optional.memoryVerse) }),
          ...(src.optional.prayerPrompt != null && { prayerPrompt: String(src.optional.prayerPrompt) })
        }
      : {};

    const normalized = {
      title: String(src?.title ?? topic),
      durationMin: Number(durationMin),
      topic: String(topic).trim(),
      mode: String(mode),
      planSteps,
      scriptures,
      talks,
      articles,
      reflectionPrompts,
      actionStep,
      optional: Object.keys(optional).length ? optional : undefined
    };

    return send(res, 200, normalized);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    const safe = message.length > 120 ? message.slice(0, 120) + "…" : message;
    return send(res, 500, { error: "Server error", details: safe });
  }
}
