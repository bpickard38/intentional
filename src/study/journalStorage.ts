import { getJson, setJson } from "@/src/core/storage";
import type { StudyJournalEntry, StudyPinsMap } from "@/src/core/types";

const JOURNAL_STORAGE_KEY = "study_journal_v1";
const PINS_STORAGE_KEY = "study_pins_v1";

export async function listJournals(): Promise<StudyJournalEntry[]> {
  const raw = await getJson<StudyJournalEntry[]>(JOURNAL_STORAGE_KEY);
  if (!Array.isArray(raw)) return [];
  // Filter out obviously invalid entries and sort by most recent.
  const cleaned = raw
    .filter((e) => e && typeof e.reference === "string")
    .map((e) => ({
      reference: e.reference,
      text: e.text ?? "",
      updatedAt: e.updatedAt ?? new Date().toISOString(),
    }));
  return cleaned.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getJournal(reference: string): Promise<StudyJournalEntry | null> {
  const list = await listJournals();
  const found = list.find((e) => e.reference === reference);
  return found ?? null;
}

export async function setJournal(reference: string, text: string): Promise<void> {
  const trimmedRef = reference.trim();
  if (!trimmedRef) return;
  const now = new Date().toISOString();
  const existing = await listJournals();
  const next: StudyJournalEntry = { reference: trimmedRef, text, updatedAt: now };
  const filtered = existing.filter((e) => e.reference !== trimmedRef);
  filtered.unshift(next);
  await setJson(JOURNAL_STORAGE_KEY, filtered);
}

async function getPinsMap(): Promise<StudyPinsMap> {
  const raw = await getJson<StudyPinsMap>(PINS_STORAGE_KEY);
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

export async function listPins(): Promise<StudyPinsMap> {
  return getPinsMap();
}

export async function getPinnedLookFor(reference: string): Promise<string[]> {
  const map = await getPinsMap();
  const pins = map[reference];
  return Array.isArray(pins) ? pins : [];
}

export async function setPinnedLookFor(reference: string, prompts: string[]): Promise<void> {
  const trimmedRef = reference.trim();
  if (!trimmedRef) return;
  const map = await getPinsMap();
  const unique = Array.from(new Set(prompts.map((p) => p.trim()).filter(Boolean)));
  if (unique.length === 0) {
    // Remove entry when no pins left to avoid unbounded growth.
    delete map[trimmedRef];
  } else {
    map[trimmedRef] = unique;
  }
  await setJson(PINS_STORAGE_KEY, map);
}

