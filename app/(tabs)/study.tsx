import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StudyPlan, StudySession, UserProfile } from "@/src/core/types";
import { getJson, setJson } from "@/src/core/storage";
import { generateStudyPlan } from "@/src/ai/apiClient";
import { fallbackPlan, TOPIC_SUGGESTIONS } from "@/src/study/topics";
import { addSession, updateSessionJournal } from "@/src/study/sessionService";
import { todayKey } from "@/src/core/dates";

const PROFILE_KEY = "profile:v1";

const DEFAULT_PROFILE: UserProfile = {
  id: "default",
  faithTradition: "Christian",
  createdAt: new Date().toISOString(),
};

export default function StudyScreen() {
  const [durationMin, setDurationMin] = useState<15 | 30 | 60>(30);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<StudySession | null>(null);
  const [journalLearned, setJournalLearned] = useState("");
  const [journalFelt, setJournalFelt] = useState("");
  const [journalAction, setJournalAction] = useState("");
  const [savingJournal, setSavingJournal] = useState(false);

  const loadProfile = useCallback(async (): Promise<UserProfile> => {
    const p = await getJson<UserProfile>(PROFILE_KEY);
    return p ?? DEFAULT_PROFILE;
  }, []);

  async function handleGenerate() {
    const t = topic.trim() || "Faith";
    setLoading(true);
    setSession(null);
    try {
      const profile = await loadProfile();
      let plan: StudyPlan;
      try {
        plan = await generateStudyPlan(durationMin, t, profile.faithTradition);
      } catch {
        plan = fallbackPlan(durationMin, t);
      }
      const sess: StudySession = {
        id: "session-" + Date.now(),
        date: todayKey(),
        durationMin,
        topic: t,
        plan,
        createdAt: new Date().toISOString(),
      };
      await addSession(sess);
      setSession(sess);
      setJournalLearned(sess.journal?.learned ?? "");
      setJournalFelt(sess.journal?.felt ?? "");
      setJournalAction(sess.journal?.action ?? "");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveJournal() {
    if (!session) return;
    setSavingJournal(true);
    const journal = { learned: journalLearned, felt: journalFelt, action: journalAction };
    await updateSessionJournal(session.id, journal);
    setSession({ ...session, journal });
    setSavingJournal(false);
  }

  const plan = session?.plan;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Study Session</Text>

      <Text style={styles.label}>Duration</Text>
      <View style={styles.durationRow}>
        {([15, 30, 60] as const).map((d) => (
          <Pressable
            key={d}
            onPress={() => setDurationMin(d)}
            style={[styles.durBtn, durationMin === d && styles.durBtnActive]}
          >
            <Text style={[styles.durBtnText, durationMin === d && styles.durBtnTextActive]}>{d} min</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Topic</Text>
      <View style={styles.topicChips}>
        {TOPIC_SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => setTopic(s)}
            style={[styles.chip, topic === s && styles.chipActive]}
          >
            <Text style={[styles.chipText, topic === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Or type custom topic"
        value={topic}
        onChangeText={setTopic}
      />

      {!plan ? (
        <Pressable
          onPress={handleGenerate}
          style={styles.genBtn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.genBtnText}>Generate</Text>
          )}
        </Pressable>
      ) : null}

      {loading && !plan ? null : plan ? (
        <>
          <Text style={styles.sectionTitle}>Scriptures</Text>
          {plan.scriptures.map((s, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.cardTitle}>{s.title} — {s.ref}</Text>
              <Text style={styles.cardSummary}>{s.summary}</Text>
              <Pressable onPress={() => s.url && Linking.openURL(s.url)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>Open</Text>
              </Pressable>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Talks</Text>
          {plan.talks.map((t, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              {t.speaker ? <Text style={styles.cardMeta}>{t.speaker}</Text> : null}
              <Text style={styles.cardSummary}>{t.summary}</Text>
              <Pressable onPress={() => t.url && Linking.openURL(t.url)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>Open</Text>
              </Pressable>
            </View>
          ))}

          {plan.articles && plan.articles.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Articles</Text>
              {plan.articles.map((a, i) => (
                <View key={i} style={styles.card}>
                  <Text style={styles.cardTitle}>{a.title}</Text>
                  <Text style={styles.cardSummary}>{a.summary}</Text>
                  <Pressable onPress={() => a.url && Linking.openURL(a.url)} style={styles.linkBtn}>
                    <Text style={styles.linkBtnText}>Open</Text>
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Reflection prompts</Text>
          {plan.reflectionPrompts.map((p, i) => (
            <Text key={i} style={styles.prompt}>• {p}</Text>
          ))}

          <Text style={styles.sectionTitle}>Action step</Text>
          <Text style={styles.actionStep}>{plan.actionStep}</Text>

          <Text style={styles.sectionTitle}>Journal</Text>
          <Text style={styles.journalLabel}>What I learned</Text>
          <TextInput
            style={styles.journalInput}
            value={journalLearned}
            onChangeText={setJournalLearned}
            multiline
            placeholder="..."
          />
          <Text style={styles.journalLabel}>What I felt</Text>
          <TextInput
            style={styles.journalInput}
            value={journalFelt}
            onChangeText={setJournalFelt}
            multiline
            placeholder="..."
          />
          <Text style={styles.journalLabel}>Action to take</Text>
          <TextInput
            style={styles.journalInput}
            value={journalAction}
            onChangeText={setJournalAction}
            multiline
            placeholder="..."
          />
          <Pressable onPress={handleSaveJournal} style={styles.saveJournalBtn} disabled={savingJournal}>
            <Text style={styles.saveJournalBtnText}>{savingJournal ? "Saving..." : "Save Journal"}</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  durationRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  durBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  durBtnActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  durBtnText: { fontSize: 15, fontWeight: "600" },
  durBtnTextActive: { color: "#0a7ea4", fontWeight: "700" },
  topicChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  chipActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  chipText: { fontSize: 14 },
  chipTextActive: { fontWeight: "600", color: "#0a7ea4" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  genBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
    marginBottom: 24,
  },
  genBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardMeta: { fontSize: 14, color: "#666", marginBottom: 4 },
  cardSummary: { fontSize: 14, color: "#444", marginBottom: 8 },
  linkBtn: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#eee", borderRadius: 8 },
  linkBtnText: { fontSize: 14, fontWeight: "600" },
  prompt: { fontSize: 15, marginBottom: 4, color: "#333" },
  actionStep: { fontSize: 15, fontStyle: "italic", color: "#333" },
  journalLabel: { fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  journalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: "top",
  },
  saveJournalBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
  },
  saveJournalBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
