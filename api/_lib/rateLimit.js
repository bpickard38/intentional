// Fixed-window, per-IP rate limiter. State lives in function-instance memory,
// so it is best-effort: it stops a single client from hammering an instance,
// but limits are not shared across instances. Pair with an OpenAI spend cap.
// Files under api/_lib are not exposed as routes by Vercel.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 30;

const hits = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

/**
 * Returns true if the request may proceed. Otherwise sends a 429 and returns false.
 */
export function rateLimit(req, res, { max = MAX_REQUESTS, windowMs = WINDOW_MS } = {}) {
  const now = Date.now();
  const ip = clientIp(req);

  let entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    hits.set(ip, entry);
  }
  entry.count += 1;

  if (hits.size > 5000) {
    for (const [key, value] of hits) {
      if (now >= value.resetAt) hits.delete(key);
    }
  }

  if (entry.count > max) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return false;
  }
  return true;
}
