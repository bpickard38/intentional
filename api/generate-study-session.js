import OpenAI from "openai";
import { rateLimit } from "./_lib/rateLimit.js";

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

function churchConferenceTalkUrl(title, speaker) {
  const q = [title, speaker].filter(Boolean).join(" ").trim();
  if (!q) return "https://www.churchofjesuschrist.org/study/general-conference?lang=eng";
  return `https://www.churchofjesuschrist.org/search?lang=eng&query=${encodeURIComponent(q)}`;
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

    const { durationMin, topic, mode, faithTradition, studyDisplayMode, studyDepth, recentlyStudied } = body;
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
      ? "- SCRIPTURES: You MUST include 1-3 scripture entries. Include Bible (OT/NT) AND Book of Mormon AND Doctrine and Covenants AND Pearl of Great Price. For each entry set source: \"BIBLE\" | \"BOM\" | \"DNC\" | \"PGP\". Use reference as chapter (e.g. \"1 Nephi 3\", \"Alma 32\", \"Matthew 5\"). Include title, why (array of 1-2 short strings), keyVersesSummary (1-2 sentence summary), background (1 sentence), keyVerses (array of verse refs like \"1 Nephi 3:7\"), crossReferences (array of {ref, why, url})."
      : "- SCRIPTURES: You MUST include 1-3 Bible scripture entries. Set source: \"BIBLE\". Use full book names in reference (e.g. \"Matthew 5\", \"Psalm 23\"). Include title, why, keyVersesSummary, background, keyVerses, crossReferences.";

    const talksRule = isLDS
      ? "- TALKS: Include 0-2 General Conference talks with title, speaker, summary. Do NOT include officialUrl — it will be generated server-side."
      : "- TALKS: Return empty array []. Do NOT include conference talks for non-LDS users.";

    const recentRefs = Array.isArray(recentlyStudied) && recentlyStudied.length
      ? recentlyStudied.slice(0, 20).map((r) => String(r).trim()).filter(Boolean)
      : [];
    const uniquenessRule = recentRefs.length
      ? `- UNIQUENESS: The user has recently studied these references: ${recentRefs.join(", ")}. Do NOT reuse these exact references. Choose different chapters/books. If possible, prioritize references the user has never seen. Also ensure the ponderQuestion and lookFor are fresh and different from any generic prompts.`
      : "- UNIQUENESS: Choose varied scriptures and a fresh, specific ponderQuestion tailored to the topic.";

    const system = `You generate a Christian study session plan. Return ONLY valid JSON (no markdown, no code fence).

You MUST include a "scriptures" array with at least 1 and preferably 2-3 entries. Each entry must have:
- "source": "BIBLE" | "BOM" | "DNC" | "PGP"
- "reference": string (chapter e.g. "1 Nephi 3", "Matthew 5")
- "title": string
- "bigIdea": string (ONE sentence specific to THIS scripture—the main takeaway for this passage, not the overall topic)
- "why": ["one short reason why this applies"]
- "keyVersesSummary": string (1-2 sentence summary; no full verse text for BOM/DNC/PGP)
- "background": string (1 sentence)
- "keyVerses": ["verse ref only e.g. 1 Nephi 3:7"] (optional)
- "crossReferences": [{"ref": "Psalm 23:1", "why": "related", "url": "https://www.biblegateway.com/passage/?search=Psalm+23"}] (optional)
- "officialUrl": string (BibleGateway for Bible; churchofjesuschrist.org for LDS)

Also include at TOP level (once for the whole session):
- "lookFor": string (one short focus lens sentence, 1-2 lines max, e.g. "Look for moments where faith comes before results.")
- "ponderQuestion": string (one reflection question for the end, e.g. "What do you feel invited to do?")
- "reflectionPrompts": ["What stood out to you?", "What do you feel invited to do?"] (optional; can use ponderQuestion as first)
${isLDS ? '- "talks": [{"title": string, "speaker": string, "summary": string, "officialUrl": string or empty}] (0-2 talks)' : '- "talks": [] (empty for non-LDS)'}

RULES:
- User faithTradition: ${tradition}. ${scriptureSourceRule}
${talksRule}
${uniquenessRule}
- COPYRIGHT: Do NOT include full verse/chapter text for BOM, D&C, PGP, or talks. Only references, summaries, and officialUrl.
- For Bible: ${allowFullBibleText ? "you may include a short passage if helpful." : "no full passage; use keyVersesSummary only."}`;

    const user = `Create a ${durationMin}-minute study session on topic: "${String(topic).trim()}". Return a JSON object with: (1) "scriptures" array with 1-3 entries—each must have source, reference, title, bigIdea (one sentence for THAT scripture), why, keyVersesSummary, background, keyVerses, crossReferences, officialUrl; (2) top-level "lookFor" (one focus sentence); (3) "ponderQuestion" (one reflection question); (4) "reflectionPrompts". ${isLDS ? 'Include "talks" array with 0-2 General Conference talks.' : 'Include "talks": [].'}`;

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
    } catch {
      console.error("Model returned non-JSON", text?.slice(0, 500));
      return send(res, 500, {
        error: "Model returned non-JSON",
        sample: String(text).slice(0, 200)
      });
    }

    const plan = raw?.plan ?? raw?.data ?? raw;
    const src = plan && typeof plan === "object" && !Array.isArray(plan) ? plan : raw;

    let planSteps = Array.isArray(src.planSteps) ? src.planSteps : [];
    if (planSteps.length === 0) {
      planSteps = [
        { minutes: Math.max(5, Math.floor(Number(durationMin) / 2)), label: "Read", instruction: "Read the recommended chapters." },
        { minutes: Math.max(5, Number(durationMin) - Math.max(5, Math.floor(Number(durationMin) / 2))), label: "Reflect", instruction: "Ponder and pray." }
      ];
    }
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

    // PRIMARY: Build readingCards from "scriptures" array (what we ask the model for)
    const scripturesRaw = Array.isArray(src.scriptures) ? src.scriptures : [];
    let readingCards = scripturesRaw
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
        const bigIdea = s?.bigIdea != null ? String(s.bigIdea).trim() : (whyOneLine || "");
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
          bigIdea: bigIdea || undefined,
          whyOneLine: String(whyOneLine),
          keyMoments,
          keyVerses: Array.isArray(s?.keyVerses) ? s.keyVerses.map((v) => String(v)) : undefined,
          crossRefs
        };
      })
      .filter(Boolean);

    // FALLBACK: if model returned new schema only (readingCards) with no scriptures, use that
    if (readingCards.length === 0) {
      const readingCardsRaw = Array.isArray(src.readingCards) ? src.readingCards : [];
      readingCards = readingCardsRaw
        .map((c) => {
          const reference = String(c?.reference ?? "").trim();
          if (!reference) return null;
          const srcType = ["BOM", "DNC", "PGP", "BIBLE"].includes(c?.source)
            ? c.source
            : (reference.match(/^(1|2)\s*Nephi|Alma|Mosiah|Helaman|Moroni|Jacob|Enos|Jarom|Omni|Words of Mormon|Doctrine|Pearl|Moses|Abraham|Joseph Smith—Matthew|Joseph Smith—History|Articles of Faith/i)
                ? "BOM"
                : "BIBLE");
          if (!isLDS && (srcType === "BOM" || srcType === "DNC" || srcType === "PGP")) return null;
          const baseUrl = c?.url && String(c.url).startsWith("http")
            ? c.url
            : (srcType === "BIBLE" ? bibleGatewayUrl(reference) : churchScriptureUrl(reference, srcType));
          return {
            source: srcType,
            reference,
            url: baseUrl,
            bigIdea: c?.bigIdea != null ? String(c.bigIdea) : undefined,
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
      lookFor: src?.lookFor != null ? String(src.lookFor) : (studyPlanRaw?.lookFor != null ? String(studyPlanRaw.lookFor) : "Notice what God highlights for you."),
      ponder:
        src?.ponderQuestion != null
          ? String(src.ponderQuestion)
          : (studyPlanRaw?.ponder != null ? String(studyPlanRaw.ponder) : "What do you feel invited to do in response?")
    };

    const deepDiveRaw = src?.deepDive && typeof src.deepDive === "object" ? src.deepDive : null;
    const talksRaw = isLDS && Array.isArray(src.talks) ? src.talks : [];
    const firstTalk = talksRaw[0] && typeof talksRaw[0] === "object" ? talksRaw[0] : null;

    function buildTalkEntry(t) {
      if (!t) return undefined;
      const title = String(t.title ?? "").trim();
      const speaker = String(t.speaker ?? "").trim();
      if (!title) return undefined;
      return {
        title,
        speaker,
        whyOneLine: String(t.whyOneLine ?? t.summary ?? "").trim(),
        officialUrl: churchConferenceTalkUrl(title, speaker),
      };
    }

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
              ? buildTalkEntry(deepDiveRaw.talk)
              : (isLDS ? buildTalkEntry(firstTalk) : undefined)
        }
      : (isLDS && firstTalk
          ? {
              backgroundBullets: undefined,
              crossRefs: undefined,
              talk: buildTalkEntry(firstTalk)
            }
          : undefined);

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
    // Full error is in the server logs; never echo upstream messages to clients.
    return send(res, 500, { error: "Server error" });
  }
}
