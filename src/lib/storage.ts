import { getJson, setJson, removeKey } from "@/src/core/storage";

export { getJson as getJSON, setJson as setJSON, removeKey };

export function safeParse<T>(value: string | null, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

