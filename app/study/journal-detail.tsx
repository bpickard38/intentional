import React, { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { StudyJournalEntry } from "@/src/core/types";
import { getJournal, setJournal } from "@/src/study/journalStorage";

export default function JournalDetailScreen() {
  const router = useRouter();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const [entry, setEntry] = useState<StudyJournalEntry | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!ref) return;
      (async () => {
        const e = await getJournal(ref);
        if (e) {
          setEntry(e);
          setText(e.text);
          setSavedAt(e.updatedAt);
        }
      })();
    }, [ref])
  );

  const scheduleAutoSave = useCallback((val: string) => {
    setText(val);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!ref) return;
      setSaving(true);
      try {
        await setJournal(ref, val, entry?.chapters);
        setSavedAt(new Date().toISOString());
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [ref, entry?.chapters]);

  if (!ref) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No entry found.</Text>
      </View>
    );
  }

  // Determine if this looks like a chapter reference (e.g. "Matthew 5")
  // or a session reference (e.g. "Faith (2026-03-31)")
  const isSession = /\(\d{4}-\d{2}-\d{2}\)/.test(ref);
  const displayTitle = isSession ? ref.replace(/\s*\(\d{4}-\d{2}-\d{2}\)/, "") : ref;
  const displayDate = isSession ? ref.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1] : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>{displayTitle}</Text>
      {displayDate && <Text style={styles.date}>{new Date(displayDate + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</Text>}

      {/* Chapters studied */}
      {entry?.chapters && entry.chapters.length > 0 && (
        <View style={styles.chaptersBox}>
          <Text style={styles.chaptersLabel}>Chapters studied</Text>
          <View style={styles.chipsRow}>
            {entry.chapters.map((ch) => (
              <View key={ch} style={styles.chip}>
                <Text style={styles.chipText}>{ch}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* For chapter studies (not session), show the reference as the chapter */}
      {!isSession && (
        <View style={styles.chaptersBox}>
          <Text style={styles.chaptersLabel}>Chapter</Text>
          <View style={styles.chipsRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{ref}</Text>
            </View>
          </View>
        </View>
      )}

      <Text style={styles.journalLabel}>Your notes</Text>
      <TextInput
        style={styles.journalInput}
        value={text}
        onChangeText={scheduleAutoSave}
        multiline
        placeholder="Write your thoughts here…"
        textAlignVertical="top"
      />
      <Text style={styles.saveStatus}>
        {saving
          ? "Saving…"
          : savedAt
          ? `Saved ${new Date(savedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
          : ""}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060f20" },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  backBtn: { alignSelf: "flex-start", marginBottom: 16 },
  backBtnText: { fontSize: 16, color: "#f5a623", fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 4, color: "rgba(255,255,255,0.95)" },
  date: { fontSize: 14, color: "rgba(255,255,255,0.40)", marginBottom: 16 },
  chaptersBox: {
    backgroundColor: "#091828",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.28)",
  },
  chaptersLabel: { fontSize: 12, fontWeight: "700", color: "#f5a623", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(245,166,35,0.18)", borderRadius: 999, borderWidth: 1, borderColor: "#f5a623" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#f5a623" },
  journalLabel: { fontSize: 16, fontWeight: "700", marginBottom: 8, color: "rgba(255,255,255,0.90)" },
  journalInput: {
    borderWidth: 1,
    borderColor: "#142030",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 180,
    color: "#fff",
    lineHeight: 22,
    backgroundColor: "#091828",
  },
  saveStatus: { fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 6 },
  error: { fontSize: 16, color: "#e74c3c", padding: 20 },
});
