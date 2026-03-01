import type { ScriptureSource } from "./types";

/** Client-side flag: allow full Bible text (e.g. KJV) when true. */
const ALLOW_FULL_BIBLE_TEXT =
  process.env.EXPO_PUBLIC_ALLOW_FULL_BIBLE_TEXT === "true" ||
  process.env.EXPO_PUBLIC_ALLOW_FULL_BIBLE_TEXT === "1";

/**
 * Copyright-safe display: only show full verse/chapter text for Bible when allowed.
 * Never show full text for BOM, D&C, PGP, or General Conference.
 */
export function canShowFullText(source: ScriptureSource | undefined): boolean {
  if (!source || source === "BOM" || source === "DNC" || source === "PGP") return false;
  if (source === "BIBLE" && ALLOW_FULL_BIBLE_TEXT) return true;
  if (source === undefined && ALLOW_FULL_BIBLE_TEXT) return true;
  return false;
}
