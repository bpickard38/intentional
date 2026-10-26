import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { StudyPlanDoc, StudyPlanDay, UserProfile, StudyPlanV2 } from "@/src/core/types";
import { getPlan, toggleDayComplete } from "@/src/study/planStorage";
import { setJournal, getJournal } from "@/src/study/journalStorage";
import { studyChat } from "@/src/ai/apiClient";
import { getJson } from "@/src/core/storage";

const PROFILE_KEY = "profile:v1";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function buildMinimalPlan(plan: StudyPlanDoc, day: StudyPlanDay): StudyPlanV2 {
  return {
    title: day.focus,
    durationMin: plan.minutesPerDay >= 60 ? 60 : plan.minutesPerDay >= 30 ? 30 : 15,
    topic: plan.topic,
    mode: "devotional",
    planSteps: [{ minutes: plan.minutesPerDay, label: "Read", instruction: day.focus }],
    studyPlan: {
      read: day.references.map((r) => ({ source: "BIBLE" as const, reference: r, url: "" })),
      lookFor: day.lookFor[0] ?? "",
      ponder: day.reflection,
    },
    scriptures: [],
    talks: [],
    articles: [],
    reflectionPrompts: [day.reflection],
    actionStep: "",
  };
}

export default function DayDetailScreen() {
  const router = useRouter();
  const { id, dayId } = useLocalSearchParams<{ id: string; dayId: string }>();
  const [plan, setPlan] = useState<StudyPlanDoc | null>(null);
  const [day, setDay] = useState<StudyPlanDay | null>(null);
  const [loading, setLoading] = useState(true);

  // Timer
  const [timerSec, setTimerSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Journal
  const [journalText, setJournalText] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalSavedAt, setJournalSavedAt] = useState<string | null>(null);
  const journalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ask a question
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const p = await getPlan(id);
      setPlan(p);
      const d = p?.days?.find((x) => x.id === dayId) ?? null;
      setDay(d);
      if (d) {
        const key = `plan:${id}:day:${d.dayNumber}`;
        const saved = await getJournal(key);
        if (saved) {
          setJournalText(saved.text);
          setJournalSavedAt(saved.updatedAt);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id, dayId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Start timer automatically when plan/day load.
  useEffect(() => {
    if (!plan || !day) return;
    const totalSec = plan.minutesPerDay * 60;
    setTimerSec(totalSec);
    setTimerRunning(true);
    // Restart only when a different plan/day loads, not on every object refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, day?.id]);

  useEffect(() => {
    if (timerRunning && timerSec > 0) {
      intervalRef.current = setInterval(() => {
        setTimerSec((s) => {
          if (s <= 1) {
            setTimerRunning(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else if (!timerRunning && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // The interval counts down via a functional update; re-running on every tick would recreate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  const isCompleted = plan?.progress?.completedDayIds?.includes(dayId ?? "") ?? false;

  const handleToggleComplete = useCallback(async () => {
    if (!id || !dayId) return;
    await toggleDayComplete(id, dayId);
    await load();
  }, [id, dayId, load]);

  const scheduleJournalSave = useCallback((text: string) => {
    setJournalText(text);
    if (journalTimerRef.current) clearTimeout(journalTimerRef.current);
    journalTimerRef.current = setTimeout(async () => {
      if (!day) return;
      setJournalSaving(true);
      try {
        const key = `plan:${id}:day:${day.dayNumber}`;
        await setJournal(key, text);
        setJournalSavedAt(new Date().toISOString());
      } finally {
        setJournalSaving(false);
      }
    }, 800);
  }, [day, id]);

  const handleSendQuestion = useCallback(async () => {
    const q = question.trim();
    if (!q || !plan || !day || chatSending) return;
    setChatError(null);
    setChatSending(true);
    const newHistory = [...chatHistory, { role: "user", text: q }];
    setChatHistory(newHistory);
    setQuestion("");
    try {
      const profile = await getJson<UserProfile>(PROFILE_KEY);
      const minimalPlan = buildMinimalPlan(plan, day);
      const res = await studyChat({
        plan: minimalPlan,
        mode: "devotional",
        topic: plan.topic,
        faithTradition: profile?.faithTradition ?? "Christian",
        userQuestion: q,
        lastMessages: chatHistory.slice(-6),
      });
      const replyText = res.answer || "I'm not sure how to answer that right now.";
      setChatHistory((prev) => [...prev, { role: "assistant", text: replyText }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setChatError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setChatSending(false);
    }
  }, [question, plan, day, chatSending, chatHistory]);

  if (!id || !dayId || loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{loading ? "Loading…" : "Day not found."}</Text>
      </View>
    );
  }

  if (!plan || !day) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Day not found.</Text>
      </View>
    );
  }

  const totalSec = plan.minutesPerDay * 60;
  const progressPct = totalSec > 0 ? Math.max(0, (totalSec - timerSec) / totalSec) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>

      {/* Timer */}
      <View style={styles.timerRow}>
        <View style={styles.timerBox}>
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: `${progressPct * 100}%` as any }]} />
          </View>
          <Text style={styles.timerText}>{formatTime(timerSec)}</Text>
        </View>
        <Pressable
          onPress={() => setTimerRunning((r) => !r)}
          style={styles.timerBtn}
        >
          <Text style={styles.timerBtnText}>{timerRunning ? "Pause" : "Resume"}</Text>
        </Pressable>
      </View>

      <Text style={styles.kicker}>Day {day.dayNumber} · {plan.title}</Text>
      <Text style={styles.focus}>{day.focus}</Text>

      {day.whyNext ? (
        <View style={styles.whyNextBox}>
          <Text style={styles.whyNextLabel}>Why this next?</Text>
          <Text style={styles.whyNextText}>{day.whyNext}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Read</Text>
      <View style={styles.refRow}>
        {day.references.map((ref) => (
          <Text key={ref} style={styles.refText}>{ref}</Text>
        ))}
      </View>
      {day.linkUrls.length > 0 && (
        <View style={styles.linkRow}>
          {day.linkUrls.map((ln) => (
            <Pressable
              key={ln.label + ln.url}
              onPress={() => ln.url && Linking.openURL(ln.url)}
              style={styles.linkBtn}
            >
              <Text style={styles.linkBtnText}>{ln.label || "Open"}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Big Idea</Text>
      <Text style={styles.bodyText}>{day.bigIdea}</Text>

      {day.lookFor?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Look For</Text>
          {day.lookFor.map((lf, i) => (
            <Text key={i} style={styles.bullet}>• {lf}</Text>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>Reflection</Text>
      <Text style={styles.bodyText}>{day.reflection}</Text>

      {/* Journal */}
      <Text style={styles.sectionTitle}>Journal</Text>
      <TextInput
        style={styles.journalInput}
        value={journalText}
        onChangeText={scheduleJournalSave}
        multiline
        placeholder="What stood out to you? Any impressions or actions?"
            placeholderTextColor="rgba(255,255,255,0.28)"
      />
      <Text style={styles.journalStatus}>
        {journalSaving ? "Saving…" : journalSavedAt ? `Saved at ${new Date(journalSavedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
      </Text>

      {/* Ask a question */}
      <Text style={styles.sectionTitle}>Ask a Question</Text>
      {chatHistory.length > 0 && (
        <View style={styles.chatHistory}>
          {chatHistory.map((msg, i) => (
            <View key={i} style={[styles.chatBubble, msg.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
              <Text style={[styles.chatBubbleText, msg.role === "user" ? styles.chatBubbleTextUser : null]}>
                {msg.text}
              </Text>
            </View>
          ))}
        </View>
      )}
      {chatError ? <Text style={styles.errorText}>{chatError}</Text> : null}
      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about today's reading…"
              placeholderTextColor="rgba(255,255,255,0.28)"
          multiline
          editable={!chatSending}
        />
        <Pressable
          onPress={handleSendQuestion}
          style={[styles.sendBtn, (chatSending || !question.trim()) && styles.sendBtnDisabled]}
          disabled={chatSending || !question.trim()}
        >
          <Text style={styles.sendBtnText}>{chatSending ? "…" : "Send"}</Text>
        </Pressable>
      </View>

      <Pressable onPress={handleToggleComplete} style={[styles.completeBtn, isCompleted && styles.completeBtnDone]}>
        <Text style={styles.completeBtnText}>
          {isCompleted ? "✓ Completed" : "Mark Complete"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060f20" },
  center: { flex: 1, backgroundColor: "#060f20", justifyContent: "center", alignItems: "center", padding: 20 },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  backBtn: { alignSelf: "flex-start", marginBottom: 12 },
  backBtnText: { fontSize: 16, color: "#f5a623", fontWeight: "600" },

  timerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  timerBox: { flex: 1 },
  timerTrack: { height: 6, backgroundColor: "#142030", borderRadius: 3, overflow: "hidden", marginBottom: 4 },
  timerFill: { height: "100%", backgroundColor: "#f5a623", borderRadius: 3 },
  timerText: { fontSize: 22, fontWeight: "800", color: "#f5a623" },
  timerBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#f5a623" },
  timerBtnText: { fontSize: 14, fontWeight: "600", color: "#f5a623" },

  kicker: { fontSize: 12, color: "#f5a623", fontWeight: "600", marginBottom: 4 },
  focus: { fontSize: 20, fontWeight: "800", marginBottom: 16, color: "rgba(255,255,255,0.95)" },
  whyNextBox: { padding: 12, backgroundColor: "#091828", borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: "#142030" },
  whyNextLabel: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.45)", marginBottom: 4 },
  whyNextText: { fontSize: 14, color: "rgba(255,255,255,0.70)" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 16, marginBottom: 6, color: "rgba(255,255,255,0.90)" },
  refRow: { marginBottom: 8 },
  refText: { fontSize: 15, fontWeight: "600", color: "#f5a623" },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(245,166,35,0.12)", borderWidth: 1, borderColor: "#f5a623" },
  linkBtnText: { fontSize: 14, fontWeight: "600", color: "#f5a623" },
  bodyText: { fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 22 },
  bullet: { fontSize: 15, color: "rgba(255,255,255,0.75)", marginBottom: 4 },

  journalInput: {
    borderWidth: 1,
    borderColor: "#142030",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: "top",
    color: "#fff",
    backgroundColor: "#091828",
  },
  journalStatus: { fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 4, marginBottom: 4 },

  chatHistory: { gap: 8, marginBottom: 10 },
  chatBubble: { padding: 12, borderRadius: 12, maxWidth: "90%" },
  chatBubbleUser: { backgroundColor: "#f5a623", alignSelf: "flex-end" },
  chatBubbleAssistant: { backgroundColor: "#142030", alignSelf: "flex-start" },
  chatBubbleText: { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20 },
  chatBubbleTextUser: { color: "#060f20", fontWeight: "600" },
  chatInputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#142030",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    maxHeight: 120,
    textAlignVertical: "top",
    color: "#fff",
    backgroundColor: "#091828",
  },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f5a623" },
  sendBtnDisabled: { backgroundColor: "rgba(245,166,35,0.35)" },
  sendBtnText: { fontSize: 15, fontWeight: "700", color: "#060f20" },

  completeBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#f5a623",
  },
  completeBtnDone: { backgroundColor: "rgba(245,166,35,0.35)" },
  completeBtnText: { fontSize: 16, fontWeight: "700", color: "#060f20" },
  loadingText: { fontSize: 16, color: "rgba(255,255,255,0.55)" },
  errorText: { fontSize: 14, color: "#e74c3c", marginBottom: 8 },
});
