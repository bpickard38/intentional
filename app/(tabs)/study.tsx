import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import type { StudySession, StudyMode, ChatMessage, UserProfile } from "@/src/core/types";
import { todayKey } from "@/src/core/dates";
import { getJson } from "@/src/core/storage";
import { generateStudySession, studyChat } from "@/src/ai/apiClient";
import { fallbackPlanV2, TOPIC_SUGGESTIONS } from "@/src/study/topics";
import {
  addSession,
  updateSession,
  updateSessionJournal,
  appendChatMessage,
  setSessionTimerState,
  setSessionStatus,
  getSessionById,
} from "@/src/study/sessionService";

const PROFILE_KEY = "profile:v1";
const DEFAULT_PROFILE: UserProfile = { id: "default", faithTradition: "Christian", createdAt: new Date().toISOString() };
const TIMER_PERSIST_INTERVAL_MS = 10000;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function StudyScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [session, setSession] = useState<StudySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [durationMin, setDurationMin] = useState<15 | 30 | 60>(30);
  const [mode, setMode] = useState<StudyMode>("devotional");
  const [topic, setTopic] = useState("");

  const [journalLearned, setJournalLearned] = useState("");
  const [journalFelt, setJournalFelt] = useState("");
  const [journalAction, setJournalAction] = useState("");
  const [savingJournal, setSavingJournal] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const timerPersistRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<StudySession | null>(session);
  sessionRef.current = session;

  const loadProfile = useCallback(async (): Promise<UserProfile> => {
    const p = await getJson<UserProfile>(PROFILE_KEY);
    return p ?? DEFAULT_PROFILE;
  }, []);

  const loadResumedSession = useCallback(async () => {
    if (!sessionId) return;
    const s = await getSessionById(sessionId);
    if (s && s.status === "in_progress") {
      setSession(s);
      setDurationMin(s.durationMin);
      setMode(s.plan.mode);
      setTopic(s.plan.topic);
      setJournalLearned(s.journal?.learned ?? "");
      setJournalFelt(s.journal?.felt ?? "");
      setJournalAction(s.journal?.action ?? "");
    }
  }, [sessionId]);

  useEffect(() => {
    loadResumedSession();
  }, [loadResumedSession]);

  useEffect(() => {
    if (!session?.id || session.status !== "in_progress" || !session.timerState?.isRunning) return;
    const sid = session.id;
    const tick = async () => {
      const s = sessionRef.current;
      if (!s?.timerState?.isRunning || s.id !== sid) return;
      const ts = s.timerState!;
      let remaining = ts.remainingSec - 1;
      let stepIndex = ts.currentStepIndex;
      const steps = s.plan.planSteps;
      const stepEndTimes: number[] = [];
      let cum = 0;
      steps.forEach((st) => {
        cum += st.minutes * 60;
        stepEndTimes.push(cum);
      });
      const totalDuration = s.durationMin * 60;
      const elapsed = totalDuration - remaining;
      if (remaining <= 0) {
        remaining = 0;
        stepIndex = steps.length - 1;
      } else if (stepIndex < steps.length && stepEndTimes[stepIndex] <= elapsed + 1) {
        stepIndex = Math.min(stepIndex + 1, steps.length - 1);
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
      }
      const next: StudySession["timerState"] = { remainingSec: remaining, isRunning: true, currentStepIndex: stepIndex };
      setSession((prev) => (prev && prev.id === sid ? { ...prev, timerState: next } : prev));
      timerPersistRef.current += 1000;
      if (timerPersistRef.current >= TIMER_PERSIST_INTERVAL_MS) {
        timerPersistRef.current = 0;
        await setSessionTimerState(sid, next);
      }
    };
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [session?.id, session?.status, session?.timerState?.isRunning]);

  const handleStartSession = async () => {
    const t = topic.trim() || "Faith";
    setLoading(true);
    setApiError(null);
    try {
      const profile = await loadProfile();
      let plan;
      try {
        plan = await generateStudySession(durationMin, t, mode, profile.faithTradition);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : String(err));
        plan = fallbackPlanV2(durationMin, t, mode);
      }
      const totalSec = durationMin * 60;
      const sess: StudySession = {
        id: "session-" + Date.now(),
        date: todayKey(),
        durationMin,
        topic: t,
        plan,
        status: "in_progress",
        startedAt: new Date().toISOString(),
        timerState: { remainingSec: totalSec, isRunning: true, currentStepIndex: 0 },
        chat: [],
        createdAt: new Date().toISOString(),
      };
      await addSession(sess);
      setSession(sess);
      setJournalLearned("");
      setJournalFelt("");
      setJournalAction("");
    } catch (_err) {
      setApiError("Something went wrong");
      const plan = fallbackPlanV2(durationMin, topic.trim() || "Faith", mode);
      const sess: StudySession = {
        id: "session-" + Date.now(),
        date: todayKey(),
        durationMin,
        topic: topic.trim() || "Faith",
        plan,
        status: "in_progress",
        startedAt: new Date().toISOString(),
        timerState: { remainingSec: durationMin * 60, isRunning: true, currentStepIndex: 0 },
        chat: [],
        createdAt: new Date().toISOString(),
      };
      await addSession(sess).catch(() => {});
      setSession(sess);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseResume = async () => {
    if (!session?.timerState) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const next = { ...session.timerState, isRunning: !session.timerState.isRunning };
    setSession((prev) => (prev ? { ...prev, timerState: next } : null));
    await setSessionTimerState(session.id, next);
  };

  const handleNextStep = async () => {
    if (!session?.timerState || !session.plan.planSteps.length) return;
    const idx = Math.min(session.timerState.currentStepIndex + 1, session.plan.planSteps.length - 1);
    const next = { ...session.timerState, currentStepIndex: idx };
    setSession((prev) => (prev ? { ...prev, timerState: next } : null));
    await setSessionTimerState(session.id, next);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const handleFinishSession = async () => {
    if (!session) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const next: StudySession = {
      ...session,
      status: "completed",
      completedAt: new Date().toISOString(),
      timerState: session.timerState ? { ...session.timerState, isRunning: false } : undefined,
    };
    await setSessionStatus(session.id, "completed");
    if (session.timerState) await setSessionTimerState(session.id, { ...session.timerState, isRunning: false });
    setSession(next);
  };

  const handleSaveJournal = async () => {
    if (!session) return;
    setSavingJournal(true);
    const journal = { learned: journalLearned, felt: journalFelt, action: journalAction };
    await updateSessionJournal(session.id, journal);
    setSession((prev) => (prev ? { ...prev, journal } : null));
    setSavingJournal(false);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || !session || chatSending) return;
    const userMsg: ChatMessage = { id: "msg-" + Date.now(), role: "user", text, createdAt: new Date().toISOString() };
    setSession((prev) => (prev ? { ...prev, chat: [...(prev.chat ?? []), userMsg] } : null));
    await appendChatMessage(session.id, userMsg);
    setChatInput("");
    setChatSending(true);
    try {
      const profile = await loadProfile();
      const lastMessages = (session.chat ?? []).slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const res = await studyChat({
        plan: session.plan,
        mode: session.plan.mode,
        topic: session.topic,
        faithTradition: profile.faithTradition,
        userQuestion: text,
        lastMessages,
      });
      const answer = res.answer || "I'm not sure how to answer that right now.";
      const assistantMsg: ChatMessage = { id: "msg-" + Date.now(), role: "assistant", text: answer, createdAt: new Date().toISOString() };
      setSession((prev) => (prev ? { ...prev, chat: [...(prev.chat ?? []), assistantMsg] } : null));
      await appendChatMessage(session.id, assistantMsg);
    } catch {
      const errMsg: ChatMessage = { id: "msg-err-" + Date.now(), role: "assistant", text: "I couldn't reach the server. Try again, or ask in fewer words.", createdAt: new Date().toISOString() };
      setSession((prev) => (prev ? { ...prev, chat: [...(prev.chat ?? []), errMsg] } : null));
      await appendChatMessage(session.id, errMsg);
    } finally {
      setChatSending(false);
    }
  };

  const isInSession = session?.status === "in_progress";
  const plan = session?.plan;
  const timerState = session?.timerState;
  const currentStepIndex = timerState?.currentStepIndex ?? 0;
  const currentStep = plan?.planSteps[currentStepIndex];
  const stepRemainingSec = (() => {
    if (!session?.timerState || !plan?.planSteps.length) return 0;
    const totalSec = session.durationMin * 60;
    const elapsed = totalSec - session.timerState.remainingSec;
    let cum = 0;
    for (let i = 0; i <= currentStepIndex && i < plan.planSteps.length; i++) {
      const stepEnd = cum + plan.planSteps[i].minutes * 60;
      if (elapsed < stepEnd) return stepEnd - elapsed;
      cum = stepEnd;
    }
    return 0;
  })();

  if (isInSession && plan) {
    return (
      <View style={styles.container}>
        <View style={styles.timerHeader}>
          <Text style={styles.timerText}>{formatTime(timerState?.remainingSec ?? 0)}</Text>
          <Text style={styles.stepLabel}>{currentStep?.label ?? "—"} ({currentStep?.minutes ?? 0} min)</Text>
          <View style={styles.timerActions}>
            <Pressable onPress={handlePauseResume} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>{timerState?.isRunning ? "Pause" : "Resume"}</Text>
            </Pressable>
            <Pressable onPress={handleNextStep} style={styles.smallBtn} disabled={currentStepIndex >= (plan.planSteps?.length ?? 1) - 1}>
              <Text style={styles.smallBtnText}>Next step</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Plan</Text>
          {(plan.planSteps ?? []).map((step, i) => (
            <View key={i} style={[styles.stepRow, i === currentStepIndex && styles.stepRowActive]}>
              <Text style={styles.stepBullet}>{i === currentStepIndex ? "●" : "○"} {step.label}</Text>
              <Text style={styles.stepInstruction}>{step.instruction}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Scriptures</Text>
          {(plan.scriptures ?? []).map((sc, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.cardTitle}>{sc.title} — {sc.ref}</Text>
              {sc.background ? <Text style={styles.cardSummary}>{sc.background}</Text> : null}
              {(sc.observationQuestions ?? []).length > 0 && <Text style={styles.cardLabel}>Observe</Text>}
              {(sc.observationQuestions ?? []).map((q, j) => <Text key={j} style={styles.bullet}>• {q}</Text>)}
              {(sc.interpretation ?? []).length > 0 && <Text style={styles.cardLabel}>Interpret</Text>}
              {(sc.interpretation ?? []).map((x, j) => <Text key={j} style={styles.bullet}>• {x}</Text>)}
              {(sc.crossReferences ?? []).length > 0 && <Text style={styles.cardLabel}>Cross-refs</Text>}
              {(sc.crossReferences ?? []).map((cr, j) => (
                <Pressable key={j} onPress={() => cr.url && Linking.openURL(cr.url)}>
                  <Text style={styles.linkText}>{cr.ref}: {cr.why}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => sc.url && Linking.openURL(sc.url)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>Open</Text>
              </Pressable>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Talks</Text>
          {(plan.talks ?? []).map((t, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              {t.speaker ? <Text style={styles.cardMeta}>{t.speaker}</Text> : null}
              <Text style={styles.cardSummary}>{t.summary}</Text>
              <Pressable onPress={() => t.url && Linking.openURL(t.url)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>Open</Text>
              </Pressable>
            </View>
          ))}

          {plan.articles && plan.articles.length > 0 && (
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
          )}

          <Text style={styles.sectionTitle}>Reflection</Text>
          {(plan.reflectionPrompts ?? []).map((p, i) => <Text key={i} style={styles.bullet}>• {p}</Text>)}
          <Text style={styles.sectionTitle}>Action step</Text>
          <Text style={styles.actionStep}>{plan.actionStep}</Text>

          <Text style={styles.sectionTitle}>Journal</Text>
          <Text style={styles.journalLabel}>What I learned</Text>
          <TextInput style={styles.journalInput} value={journalLearned} onChangeText={setJournalLearned} multiline placeholder="..." />
          <Text style={styles.journalLabel}>What I felt</Text>
          <TextInput style={styles.journalInput} value={journalFelt} onChangeText={setJournalFelt} multiline placeholder="..." />
          <Text style={styles.journalLabel}>Action to take</Text>
          <TextInput style={styles.journalInput} value={journalAction} onChangeText={setJournalAction} multiline placeholder="..." />
          <Pressable onPress={handleSaveJournal} style={styles.saveJournalBtn} disabled={savingJournal}>
            <Text style={styles.saveJournalBtnText}>{savingJournal ? "Saving…" : "Save journal"}</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Ask during study</Text>
          <ScrollView style={styles.chatThread} nestedScrollEnabled>
            {(session?.chat ?? []).map((m) => (
              <View key={m.id} style={[styles.chatBubble, m.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
                <Text style={styles.chatBubbleText}>{m.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask a question…"
              editable={!chatSending}
            />
            <Pressable onPress={handleSendChat} style={styles.sendBtn} disabled={chatSending || !chatInput.trim()}>
              <Text style={styles.sendBtnText}>{chatSending ? "…" : "Send"}</Text>
            </Pressable>
          </View>

          <Pressable onPress={handleFinishSession} style={styles.finishBtn}>
            <Text style={styles.finishBtnText}>Finish session</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.setupContent}>
      <Text style={styles.title}>Study session</Text>
      {!process.env.EXPO_PUBLIC_API_URL?.trim() && (
        <View style={styles.envBanner}>
          <Text style={styles.envBannerText}>EXPO_PUBLIC_API_URL is not set. Add it to .env and run: npx expo start -c</Text>
        </View>
      )}

      <Text style={styles.label}>Duration</Text>
      <View style={styles.durationRow}>
        {([15, 30, 60] as const).map((d) => (
          <Pressable key={d} onPress={() => setDurationMin(d)} style={[styles.durBtn, durationMin === d && styles.durBtnActive]}>
            <Text style={[styles.durBtnText, durationMin === d && styles.durBtnTextActive]}>{d} min</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Mode</Text>
      <View style={styles.modeRow}>
        {(["devotional", "deep", "challenge"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeBtn, mode === m && styles.modeBtnActive]}>
            <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>{m === "devotional" ? "Devotional" : m === "deep" ? "Deep Study" : "Challenge"}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Topic</Text>
      <View style={styles.topicChips}>
        {TOPIC_SUGGESTIONS.map((s) => (
          <Pressable key={s} onPress={() => setTopic(s)} style={[styles.chip, topic === s && styles.chipActive]}>
            <Text style={[styles.chipText, topic === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.input} placeholder="Or type custom topic" value={topic} onChangeText={setTopic} />

      {apiError ? <Text style={styles.errorText}>{apiError}</Text> : null}

      <Pressable onPress={handleStartSession} style={styles.genBtn} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.genBtnText}>Start session</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  setupContent: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  durationRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  durBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#ddd" },
  durBtnActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  durBtnText: { fontSize: 15, fontWeight: "600" },
  durBtnTextActive: { color: "#0a7ea4", fontWeight: "700" },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#ddd" },
  modeBtnActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  modeBtnText: { fontSize: 14 },
  modeBtnTextActive: { fontWeight: "700", color: "#0a7ea4" },
  topicChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#ddd" },
  chipActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  chipText: { fontSize: 14 },
  chipTextActive: { fontWeight: "600", color: "#0a7ea4" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 16 },
  envBanner: { backgroundColor: "#fff3cd", padding: 10, borderRadius: 8, marginBottom: 12 },
  envBannerText: { fontSize: 12, color: "#856404" },
  errorText: { fontSize: 12, color: "#c00", marginBottom: 8 },
  genBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#0a7ea4" },
  genBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },

  timerHeader: { padding: 12, backgroundColor: "#f0f4f8", borderBottomWidth: 1, borderBottomColor: "#ddd" },
  timerText: { fontSize: 28, fontWeight: "800" },
  stepLabel: { fontSize: 14, color: "#666", marginTop: 4 },
  timerActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#0a7ea4", borderRadius: 8 },
  smallBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  stepRow: { padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: "#eee" },
  stepRowActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  stepBullet: { fontSize: 16, fontWeight: "600" },
  stepInstruction: { fontSize: 14, color: "#444", marginTop: 4 },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardMeta: { fontSize: 14, color: "#666", marginBottom: 4 },
  cardSummary: { fontSize: 14, color: "#444", marginBottom: 8 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#666", marginTop: 8, marginBottom: 4 },
  bullet: { fontSize: 14, color: "#333", marginBottom: 2 },
  linkText: { fontSize: 14, color: "#0a7ea4", marginBottom: 4 },
  linkBtn: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#eee", borderRadius: 8, marginTop: 6 },
  linkBtnText: { fontSize: 14, fontWeight: "600" },
  actionStep: { fontSize: 15, fontStyle: "italic", color: "#333" },
  journalLabel: { fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  journalInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, minHeight: 56, textAlignVertical: "top" },
  saveJournalBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#0a7ea4" },
  saveJournalBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  chatThread: { maxHeight: 180, marginBottom: 8 },
  chatBubble: { maxWidth: "85%", padding: 10, borderRadius: 12, marginBottom: 6 },
  chatBubbleUser: { alignSelf: "flex-end", backgroundColor: "#0a7ea4" },
  chatBubbleAssistant: { alignSelf: "flex-start", backgroundColor: "#eee" },
  chatBubbleText: { fontSize: 14 },
  chatInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 10, fontSize: 15 },
  sendBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "#0a7ea4", borderRadius: 10 },
  sendBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  finishBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#2b8a3e" },
  finishBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
