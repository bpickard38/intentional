import { toLocalDateKey as coreToLocalDateKey } from "@/src/core/dates";

export function toLocalDateKey(date: Date): string {
  return coreToLocalDateKey(date);
}

export function parseDateKey(key: string): Date | null {
  if (!key) return null;
  const parts = key.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => Number(p));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

