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

function churchScriptureUrl(ref, source) {
  if (!ref || typeof ref !== "string") return "https://www.churchofjesuschrist.org/study/scriptures?lang=eng";
  const encoded = encodeURIComponent(ref.trim()).replace(/%20/g, "+");
  return `https://www.churchofjesuschrist.org/study/scriptures/search?lang=eng&query=${encoded}`;
}

function churchConferenceUrl() {
  return "https://www.churchofjesuschrist.org/study/general-conference?lang=eng";
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

    const { durationMin, topic, mode, faithTradition, studyDisplayMode } = body;
    const validDurations = [15, 30, 60];
    const validModes = ["devotional", "deep", "challenge"];
    const displayMode = ["KEY_VERSES", "FULL_CHAPTER", "BOTH"].includes(studyDisplayMode) ? studyDisplayMode : "BOTH";

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
    const allowFullBibleText = process.env.ALLOW_FULL_BIBLE_TEXT === "true" || process.env.ALLOW_FULL_BIBLE_TEXT === "1";

    const scriptureSourceRule = isLDS
      ? "- SCRIPTURES: Include Bible (OT/NT) AND Book of Mormon AND Doctrine and Covenants AND Pearl of Great Price. For each scripture set source: \"BIBLE\" | \"BOM\" | \"DNC\" | \"PGP\". Use reference as chapter or verse (e.g. \"1 Nephi 3\", \"Alma 32\", \"Matthew 5:14-16\"). For LDS scriptures set officialUrl to the exact churchofjesuschrist.org/study/scriptures URL when possible, otherwise use https://www.churchofjesuschrist.org/study/scriptures/search?lang=eng&query=REF."
      : "- SCRIPTURES: Bible only (OT/NT). Set source: \"BIBLE\". Use full book names. Set officialUrl to BibleGateway ESV URL.";

    const copyrightRule = `- COPYRIGHT: Do NOT include full verse/chapter text (passage) for Book of Mormon, Doctrine and Covenants, or Pearl of Great Price. For those sources only provide: reference, why, themes, keyVersesSummary (1-3 sentence AI summary of the key verses), background, and officialUrl. For BIBLE: ${allowFullBibleText ? "you may include passage (KJV or ESV) for display." : "do NOT include passage; provide keyVersesSummary and officialUrl only."} For General Conference talks: never include full talk text; only title, speaker, conference, why, themes, summary (short), and officialUrl.`;

    const talksRule = isLDS
      ? "- TALKS: Include 1-2 General Conference talks. For each talk provide officialUrl: the exact URL to the talk on churchofjesuschrist.org (e.g. https://www.churchofjesuschrist.org/study/general-conference/2024/04/surname?lang=eng). If you cannot determine the exact URL, leave officialUrl empty and the app will show \"Link unavailable\"."
      : "- TALKS: Return empty array []. Do NOT include conference talks for non-LDS users.";

    const system = `You generate a Christian study session plan. Return ONLY valid JSON matching this schema (no markdown, no code fence):

{
  "title": string (short session title),
  "durationMin": ${durationMin},
  "topic": string,
  "mode": "${mode}",
  "studyDisplayMode": "${displayMode}",
  "planSteps": [{"minutes": number, "label": string, "instruction": string}],
  "scriptures": [{
    "source": "BIBLE" | "BOM" | "DNC" | "PGP",
    "reference": string (e.g. "1 Nephi 3", "Alma 32", "Matthew 5" for chapter; or "Matthew 5:14-16" only when studyDisplayMode is KEY_VERSES or BOTH),
    "title": string,
    "keyVerses": string[] (ONLY when studyDisplayMode is KEY_VERSES or BOTH; when FULL_CHAPTER omit or leave empty),
    "why": string[] (1-3 bullets why this applies),
    "themes": string[] (e.g. ["obedience", "faith"]),
    "officialUrl": string (required: churchofjesuschrist.org for LDS, BibleGateway for Bible),
    "keyVersesSummary": string (AI summary of key verses; for BOM/DNC/PGP always provide; for BIBLE provide if no passage),
    "background": string (1-2 sentences),
    "observationQuestions": string[],
    "interpretation": string[],
    "crossReferences": [{"ref": string, "why": string, "url": string}],
    "summary": string,
    "passage": string (ONLY for source BIBLE when allowed; otherwise omit or empty)
  }],
  "talks": [{
    "title": string,
    "speaker": string,
    "conference": string (e.g. "Apr 2024"),
    "summary": string (short),
    "why": string[],
    "themes": string[],
    "officialUrl": string (exact talk URL on churchofjesuschrist.org when known; else empty)
  }],
  "articles": [{"title": string, "summary": string, "url": string}],
  "reflectionPrompts": string[],
  "actionStep": string,
  "studySummary": string (2-4 sentence recap of what was recommended and why; no next-step checklist),
  "optional": {"memoryVerse": string (optional), "prayerPrompt": string (optional)}
}

RULES:
- planSteps[].minutes must sum to exactly ${durationMin}.
${copyrightRule}
- Never invent or guess URLs. For talks, officialUrl must be a real churchofjesuschrist.org/study/general-conference/... URL or leave empty.
- User faithTradition: ${tradition}. ${scriptureSourceRule}
${talksRule}
- studyDisplayMode: ${displayMode}. STRICT: When FULL_CHAPTER — every scripture reference MUST be chapter-only (e.g. "1 Nephi 3", "Alma 32", "Matthew 5"). Do NOT include verse numbers in reference. Do NOT include keyVerses. When KEY_VERSES — use verse-level references and include keyVerses. When BOTH — include both chapter refs and keyVerses where helpful.
- Mode: devotional=gentle; deep=more questions/cross-refs; challenge=conviction question + concrete actionStep.`;

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
      let ref = String(s?.reference ?? s?.ref ?? "").trim() || String(s?.ref ?? "");
      if (displayMode === "FULL_CHAPTER" && ref) {
        const chapterOnly = ref.replace(/\s*:\s*\d+(-\d+)?\s*$/i, "").trim();
        if (chapterOnly) ref = chapterOnly;
      }
      const source = ["BOM", "DNC", "PGP", "BIBLE"].includes(s?.source) ? s.source : (ref.match(/^(1|2)\s*Nephi|Alma|Mosiah|Helaman|Moroni|Jacob|Enos|Jarom|Omni|Words of Mormon|Doctrine|Pearl|Moses|Abraham|Joseph Smith—Matthew|Joseph Smith—History|Articles of Faith/i) ? "BOM" : "BIBLE");
      const isLdsSource = source === "BOM" || source === "DNC" || source === "PGP";
      const allowPassage = source === "BIBLE" && allowFullBibleText;
      const officialUrl = s?.officialUrl && String(s.officialUrl).startsWith("http") ? s.officialUrl : (source === "BIBLE" ? bibleGatewayUrl(ref) : churchScriptureUrl(ref, source));
      const cr = Array.isArray(s?.crossReferences) ? s.crossReferences : [];
      const keyVerses = displayMode === "FULL_CHAPTER" ? undefined : (Array.isArray(s?.keyVerses) ? s.keyVerses.map((v) => String(v)) : undefined);
      return {
        ref,
        title: String(s?.title ?? ""),
        source,
        keyVerses,
        why: Array.isArray(s?.why) ? s.why.map((w) => String(w)) : undefined,
        themes: Array.isArray(s?.themes) ? s.themes.map((t) => String(t)) : undefined,
        officialUrl,
        keyVersesSummary: s?.keyVersesSummary != null ? String(s.keyVersesSummary) : undefined,
        passage: allowPassage ? String(s?.passage ?? "") : "",
        background: String(s?.background ?? ""),
        observationQuestions: Array.isArray(s?.observationQuestions) ? s.observationQuestions : [],
        interpretation: Array.isArray(s?.interpretation) ? s.interpretation : [],
        crossReferences: cr.map((c) => ({
          ref: String(c?.ref ?? ""),
          why: String(c?.why ?? ""),
          url: c?.url && String(c.url).startsWith("http") ? c.url : bibleGatewayUrl(c?.ref || ref),
          passage: undefined
        })),
        summary: String(s?.summary ?? ""),
        url: officialUrl
      };
    });

    const rawTalks = isLDS ? (Array.isArray(src.talks) ? src.talks : []) : [];
    const talks = rawTalks.map((t) => {
      const officialUrl = t?.officialUrl && String(t.officialUrl).startsWith("http") ? t.officialUrl : null;
      return {
        title: String(t?.title ?? ""),
        speaker: String(t?.speaker ?? ""),
        summary: String(t?.summary ?? ""),
        officialUrl: officialUrl || undefined,
        url: officialUrl || churchConferenceUrl(),
        why: Array.isArray(t?.why) ? t.why.map((w) => String(w)) : undefined,
        themes: Array.isArray(t?.themes) ? t.themes.map((x) => String(x)) : undefined,
        conference: t?.conference != null ? String(t.conference) : undefined
      };
    });

    const articles = (Array.isArray(src.articles) ? src.articles : []).map((a) => ({
      title: String(a?.title ?? ""),
      summary: String(a?.summary ?? ""),
      url: safeUrl(a?.url, a?.title || topic)
    }));

    const reflectionPrompts = Array.isArray(src.reflectionPrompts) ? src.reflectionPrompts : [];
    const actionStep = String(src?.actionStep ?? "");
    const studySummary = src?.studySummary != null ? String(src.studySummary) : undefined;
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
      studySummary,
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
