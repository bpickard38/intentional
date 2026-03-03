import { getApiBaseUrl, getApiPathPrefix } from "@/src/ai/apiClient";

export type ApiError = {
  message: string;
};

export async function apiPost<T>(path: string, body: unknown, timeoutMs = 45000): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error("EXPO_PUBLIC_API_URL is not set. Add it to .env and restart with: npx expo start -c");
  }
  const prefix = getApiPathPrefix();
  const url =
    prefix && prefix !== "(root)"
      ? `${base}${prefix}/${path}`.replace(/\/+/g, "/")
      : `${base}/${path}`.replace(/\/+/g, "/");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) throw new Error("Request timed out.");
    throw new Error("Network request failed. Check API URL.");
  }
  clearTimeout(timeoutId);

  const text = await res.text();

  if (!res.ok) {
    const snippet = text.length > 80 ? text.slice(0, 80) + "…" : text;
    throw new Error(`API error ${res.status}: ${snippet}`);
  }

  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON response.");
  }
}

