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

    const { durationMin, topic, mode, faithTradition, studyDisplayMode, studyDepth } = body;
    const validDurations = [15, 30, 60];
    const validModes = ["devotional", "deep", "challenge"];
    const displayMode = ["KEY_VERSES", "FULL_CHAPTER", "BOTH"].includes(studyDisplayMode) ? studyDisplayMode : "BOTH";
    const validDepths = ["QUICK", "GUIDED", "DEEP_DIVE"];
    const depth = validDepths.includes(studyDepth) ? studyDepth : "GUIDED";

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
      ? "- SCRIPTURES: Include Bible (OT/NT) AND Book of Mormon AND Doctrine and Covenants AND Pearl of Great Price. For each scripture or reading card set source: \"BIBLE\" | \"BOM\" | \"DNC\" | \"PGP\". Use chapter-based references by default (e.g. \"1 Nephi 3\", \"Alma 32\", \"Matthew 5\"). For LDS scriptures set officialUrl to the exact churchofjesuschrist.org/study/scriptures URL when possible, otherwise use https://www.churchofjesuschrist.org/study/scriptures/search?lang=eng&query=REF."
      : "- SCRIPTURES: Bible only (OT/NT). Set source: \"BIBLE\". Use full book names. Set officialUrl to BibleGateway ESV URL.";

    const copyrightRule = `- COPYRIGHT: Do NOT include full verse/chapter text (passage) for Book of Mormon, Doctrine and Covenants, or Pearl of Great Price. For those sources only provide: reference, why, themes, keyVersesSummary (1-3 sentence AI summary of the key verses), background, and officialUrl. For BIBLE: ${allowFullBibleText ? "you may include passage (KJV or ESV) for display." : "do NOT include passage; provide keyVersesSummary and officialUrl only."} For General Conference talks: never include full talk text; only title, speaker, conference, why, themes, summary (short), and officialUrl.`;

    const talksRule = isLDS
      ? "- TALKS: Include 1-2 General Conference talks. For each talk provide officialUrl: the exact URL to the talk on churchofjesuschrist.org (e.g. https://www.churchofjesuschrist.org/study/general-conference/2024/04/surname?lang=eng). If you cannot determine the exact URL, leave officialUrl empty and the app will show \"Link unavailable\"."
      : "- TALKS: Return empty array []. Do NOT include conference talks for non-LDS users.";

    const system = `You generate a Christian study session plan focused on GUIDED SPIRITUAL FOCUS.

Return ONLY valid JSON matching this schema (no markdown, no code fence):

{
  "bigIdeaHeadline": string,                 // one sentence, 10–18 words
  "bigIdeaSupport"?: string,                 // optional short second sentence
  "studyDepth": "QUICK" | "GUIDED" | "DEEP_DIVE",
  "studyPlan": {
    "read": Array<{
      "source": "BIBLE" | "BOM" | "DNC" | "PGP",
      "reference": string,                   // chapter-based, e.g. "1 Nephi 3", "Alma 32", "Matthew 5"
      "url": string                          // official scripture URL (churchofjesuschrist.org or BibleGateway)
    }>,
    "lookFor": string,                       // one focus lens sentence
    "ponder": string                         // one reflection question
  },
  "readingCards": Array<{
    "source": "BIBLE" | "BOM" | "DNC" | "PGP",
    "reference": string,                     // chapter-based
    "url": string,                           // official URL for the chapter
    "whyOneLine": string,                    // one short line why this chapter
    "keyMoments": string[],                  // 3–6 bullets describing what happens / what to notice
    "keyVerses"?: string[],                  // verse references ONLY (e.g. "1 Nephi 3:7")
    "crossRefs"?: Array<{ "label": string, "url": string }>
  }>,
  "deepDive"?: {
    "backgroundBullets"?: string[],          // 2–4 bullets of extra context
    "crossRefs"?: Array<{ "label": string, "url": string }>,
    "talk"?: {                               // ONLY when user is LDS
      "title": string,
      "speaker": string,
      "whyOneLine": string,
      "officialUrl": string                  // exact churchofjesuschrist.org/study/general-conference/... URL
    }
  },
  "reflectionPrompts": string[]              // 1–2 short prompts max
}

RULES:
- studyDepth is "${depth}" for this request.
- For QUICK: keep readingCards to 1 item, keyMoments <= 3 bullets, deepDive omitted.
- For GUIDED: 1–3 readingCards, keyMoments up to 4–5 bullets, deepDive optional and collapsed by default.
- For DEEP_DIVE: up to 3 readingCards, 3–6 keyMoments, and include deepDive with backgroundBullets and crossRefs; include a talk only if LDS.
- ${copyrightRule}
- Never invent or guess URLs. For talks, officialUrl must be a real churchofjesuschrist.org/study/general-conference/... URL or leave empty.
- User faithTradition: ${tradition}. ${scriptureSourceRule}
${talksRule}
- All LDS scripture and talk content MUST follow copyright rules: no full text, only references, summaries, key moments, and official links.
- Bible passages: ${allowFullBibleText ? "you MAY include full text in your internal reasoning, but DO NOT put full verse text in keyMoments; they must be summaries." : "do NOT include full verse text; only summaries, key moments, and references."}`;

    const user = `Create a ${durationMin}-minute ${mode} (${depth.toLowerCase().replace("_", " ")}) study session on topic: "${String(topic).trim()}". Return only the JSON object.`;

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

    const plan = raw?.plan ?? raw?.data ?? raw;
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

    // New schema fields -------------------------------------------------------
    const bigIdeaHeadline = src?.bigIdeaHeadline != null ? String(src.bigIdeaHeadline) : "";
    const bigIdeaSupport = src?.bigIdeaSupport != null ? String(src.bigIdeaSupport) : undefined;

    const readingCardsRaw = Array.isArray(src.readingCards) ? src.readingCards : [];
    let readingCards = readingCardsRaw
      .map((c) => {
        const reference = String(c?.reference ?? "").trim();
        if (!reference) return null;
        const srcType = ["BOM", "DNC", "PGP", "BIBLE"].includes(c?.source)
          ? c.source
          : (reference.match(/^(1|2)\s*Nephi|Alma|Mosiah|Helaman|Moroni|Jacob|Enos|Jarom|Omni|Words of Mormon|Doctrine|Pearl|Moses|Abraham|Joseph Smith—Matthew|Joseph Smith—History|Articles of Faith/i)
              ? "BOM"
              : "BIBLE");
        if (!isLDS && (srcType === "BOM" || srcType === "DNC" || srcType === "PGP")) {
          // Non-LDS users should not see LDS-only sources.
          return null;
        }
        const baseUrl = c?.url && String(c.url).startsWith("http")
          ? c.url
          : (srcType === "BIBLE" ? bibleGatewayUrl(reference) : churchScriptureUrl(reference, srcType));
        return {
          source: srcType,
          reference,
          url: baseUrl,
          whyOneLine: String(c?.whyOneLine ?? ""),
          keyMoments: Array.isArray(c?.keyMoments) ? c.keyMoments.map((km) => String(km)) : [],
          keyVerses: Array.isArray(c?.keyVerses) ? c.keyVerses.map((kv) => String(kv)) : undefined,
          crossRefs: Array.isArray(c?.crossRefs)
            ? c.crossRefs.map((cr) => ({
                label: String(cr?.label ?? ""),
                url: cr?.url && String(cr.url).startsWith("http") ? cr.url : safeUrl(cr?.url, cr?.label || reference)
              }))
            : undefined
        };
      })
      .filter(Boolean);

    // Fallback: if model returned old "scriptures" array instead of "readingCards", build readingCards from it
    if (readingCards.length === 0 && Array.isArray(src.scriptures) && src.scriptures.length > 0) {
      readingCards = src.scriptures
        .map((s) => {
          const ref = String(s?.reference ?? s?.ref ?? "").trim();
          if (!ref) return null;
          const srcType = ["BOM", "DNC", "PGP", "BIBLE"].includes(s?.source)
            ? s.source
            : (ref.match(/^(1|2)\s*Nephi|Alma|Mosiah|Helaman|Moroni|Jacob|Enos|Jarom|Omni|Words of Mormon|Doctrine|Pearl|Moses|Abraham|Joseph Smith—Matthew|Joseph Smith—History|Articles of Faith/i)
                ? "BOM"
                : "BIBLE");
          if (!isLDS && (srcType === "BOM" || srcType === "DNC" || srcType === "PGP")) return null;
          const baseUrl = s?.officialUrl && String(s.officialUrl).startsWith("http")
            ? s.officialUrl
            : (srcType === "BIBLE" ? bibleGatewayUrl(ref) : churchScriptureUrl(ref, srcType));
          const whyOneLine = Array.isArray(s?.why) && s.why.length
            ? s.why[0]
            : (s?.summary ?? s?.title ?? ref);
          const keyMoments = [];
          if (s?.keyVersesSummary) keyMoments.push(String(s.keyVersesSummary));
          if (s?.background) keyMoments.push(String(s.background));
          if (keyMoments.length === 0) keyMoments.push(whyOneLine);
          const crossRefs = Array.isArray(s?.crossReferences)
            ? s.crossReferences.map((cr) => ({
                label: String(cr?.ref ?? ""),
                url: cr?.url && String(cr.url).startsWith("http") ? cr.url : bibleGatewayUrl(cr?.ref || ref)
              }))
            : undefined;
          return {
            source: srcType,
            reference: ref,
            url: baseUrl,
            whyOneLine: String(whyOneLine),
            keyMoments,
            keyVerses: Array.isArray(s?.keyVerses) ? s.keyVerses.map((v) => String(v)) : undefined,
            crossRefs
          };
        })
        .filter(Boolean);
    }

    const studyPlanRaw = src?.studyPlan && typeof src.studyPlan === "object" ? src.studyPlan : null;
    const studyPlan = {
      read: Array.isArray(studyPlanRaw?.read)
        ? studyPlanRaw.read
            .map((r) => {
              const reference = String(r?.reference ?? "").trim();
              if (!reference) return null;
              const srcType = ["BOM", "DNC", "PGP", "BIBLE"].includes(r?.source)
                ? r.source
                : (reference.match(/^(1|2)\s*Nephi|Alma|Mosiah|Helaman|Moroni|Jacob|Enos|Jarom|Omni|Words of Mormon|Doctrine|Pearl|Moses|Abraham|Joseph Smith—Matthew|Joseph Smith—History|Articles of Faith/i)
                    ? "BOM"
                    : "BIBLE");
              if (!isLDS && (srcType === "BOM" || srcType === "DNC" || srcType === "PGP")) {
                return null;
              }
              const baseUrl = r?.url && String(r.url).startsWith("http")
                ? r.url
                : (srcType === "BIBLE" ? bibleGatewayUrl(reference) : churchScriptureUrl(reference, srcType));
              return { source: srcType, reference, url: baseUrl };
            })
            .filter(Boolean)
        : readingCards.slice(0, 2).map((c) => ({
            source: c.source,
            reference: c.reference,
            url: c.url
          })),
      lookFor: studyPlanRaw?.lookFor != null ? String(studyPlanRaw.lookFor) : (bigIdeaHeadline || "Notice what God highlights for you."),
      ponder:
        studyPlanRaw?.ponder != null
          ? String(studyPlanRaw.ponder)
          : "What do you feel invited to do in response?"
    };

    const deepDiveRaw = src?.deepDive && typeof src.deepDive === "object" ? src.deepDive : null;
    const deepDive = deepDiveRaw
      ? {
          backgroundBullets: Array.isArray(deepDiveRaw.backgroundBullets)
            ? deepDiveRaw.backgroundBullets.map((b) => String(b))
            : undefined,
          crossRefs: Array.isArray(deepDiveRaw.crossRefs)
            ? deepDiveRaw.crossRefs.map((cr) => ({
                label: String(cr?.label ?? ""),
                url: cr?.url && String(cr.url).startsWith("http") ? cr.url : safeUrl(cr?.url, cr?.label || topic)
              }))
            : undefined,
          talk:
            isLDS && deepDiveRaw.talk && typeof deepDiveRaw.talk === "object"
              ? (() => {
                  const t = deepDiveRaw.talk;
                  const url = t?.officialUrl && String(t.officialUrl).startsWith("http") ? t.officialUrl : null;
                  if (!url) return undefined;
                  return {
                    title: String(t?.title ?? ""),
                    speaker: String(t?.speaker ?? ""),
                    whyOneLine: String(t?.whyOneLine ?? ""),
                    officialUrl: url
                  };
                })()
              : undefined
        }
      : undefined;

    // Legacy scripture array built from readingCards so history + old UI continue to work.
    const scriptures = readingCards.map((c) => {
      const ref = c.reference;
      const source = c.source;
      const allowPassage = source === "BIBLE" && allowFullBibleText;
      const officialUrl = c.url && String(c.url).startsWith("http")
        ? c.url
        : (source === "BIBLE" ? bibleGatewayUrl(ref) : churchScriptureUrl(ref, source));
      return {
        ref,
        title: ref,
        source,
        keyVerses: displayMode === "FULL_CHAPTER" ? undefined : c.keyVerses,
        why: [c.whyOneLine].filter(Boolean),
        themes: undefined,
        officialUrl,
        keyVersesSummary: c.keyMoments && c.keyMoments.length ? c.keyMoments.join(" ") : undefined,
        passage: allowPassage ? "" : "",
        background: "",
        observationQuestions: [],
        interpretation: [],
        crossReferences: (c.crossRefs || []).map((cr) => ({
          ref: cr.label,
          why: "",
          url: cr.url,
          passage: undefined
        })),
        summary: c.whyOneLine,
        url: officialUrl
      };
    });

    // Legacy talks array derived from deepDive.talk when present.
    const talks =
      isLDS && deepDive && deepDive.talk
        ? [
            {
              title: deepDive.talk.title,
              speaker: deepDive.talk.speaker,
              summary: deepDive.talk.whyOneLine,
              officialUrl: deepDive.talk.officialUrl,
              url: deepDive.talk.officialUrl,
              why: [deepDive.talk.whyOneLine],
              themes: undefined,
              conference: undefined
            }
          ]
        : [];

    const articles = [];

    const reflectionPrompts =
      Array.isArray(src.reflectionPrompts) && src.reflectionPrompts.length
        ? src.reflectionPrompts.map((p) => String(p))
        : [
            "What stood out to you?",
            "What do you feel invited to do?"
          ];
    const actionStep = "";
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
      bigIdeaHeadline,
      bigIdeaSupport,
      studyDepth: depth,
      planSteps,
      studyPlan,
      readingCards,
      deepDive,
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
