/**
 * Study screen - session view and setup.
 *
 * MANUAL VERIFICATION:
 * 1. Ask input: Type a long multi-line question; cursor and text should stay visible (auto-grow up to ~240px, then scroll).
 * 2. Scriptures: Full ref (e.g. "1 Nephi 3:7") and complete passage text displayed.
 * 3. Cross-refs: Tap a cross-ref chip; it expands inline with passage. Tap again to collapse.
 * 4. Background info: Tap "Background info" to expand/collapse.
 * 5. Layout order: Ask during study → Scriptures → Talks (only if Settings > Faith tradition = LDS).
 * 6. Non-LDS: No talks section. LDS: Talks from General Conference shown.
 */
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
import type { StudySession, StudyMode, ChatMessage, UserProfile, ScriptureSource } from "@/src/core/types";
import { canShowFullText } from "@/src/core/copyright";
import { todayKey } from "@/src/core/dates";
import { getJson } from "@/src/core/storage";
import { generateStudySession, studyChat, checkApiReachability } from "@/src/ai/apiClient";
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
const DEFAULT_PROFILE: UserProfile = { id: "default", faithTradition: "Christian", studyDisplayMode: "BOTH", createdAt: new Date().toISOString() };
const TIMER_PERSIST_INTERVAL_MS = 10000;

/** Copyright helper is in @/src/core/copyright (canShowFullText). */

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [expandedBackground, setExpandedBackground] = useState<Record<number, boolean>>({});
  const [expandedCrossRef, setExpandedCrossRef] = useState<Record<string, boolean>>({});
  const [expandedKeyVerses, setExpandedKeyVerses] = useState<Record<number, boolean>>({});
  const [apiStatus, setApiStatus] = useState<{ ok: boolean; url: string; error?: string } | null>(null);
  const [apiCheckLoading, setApiCheckLoading] = useState(false);

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
    if (session?.status === "in_progress") {
      loadProfile().then(setProfile);
    }
  }, [session?.status, loadProfile]);

  const runApiCheck = useCallback(async () => {
    if (!process.env.EXPO_PUBLIC_API_URL?.trim()) {
      setApiStatus(null);
      return;
    }
    setApiCheckLoading(true);
    setApiStatus(null);
    try {
      const result = await checkApiReachability();
      setApiStatus({ ok: result.ok, url: result.url, error: result.error });
    } finally {
      setApiCheckLoading(false);
    }
  }, []);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_API_URL?.trim()) {
      runApiCheck();
    } else {
      setApiStatus(null);
    }
  }, [runApiCheck]);

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
      const loadedProfile = await loadProfile();
      setProfile(loadedProfile);
      let plan;
      try {
        plan = await generateStudySession(durationMin, t, mode, loadedProfile.faithTradition, loadedProfile.studyDisplayMode ?? "BOTH");
      } catch (err) {
        setApiError(err instanceof Error ? err.message : String(err));
        plan = fallbackPlanV2(durationMin, t, mode, loadedProfile.faithTradition, loadedProfile.studyDisplayMode ?? "BOTH");
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
      const loadedProfile = await loadProfile();
      setProfile(loadedProfile);
      const plan = fallbackPlanV2(durationMin, topic.trim() || "Faith", mode, loadedProfile.faithTradition, loadedProfile.studyDisplayMode ?? "BOTH");
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let displayMsg = msg;
      if (msg.includes("404")) {
        displayMsg = "API returned 404. If your API is deployed with the api folder as project root, add to .env: EXPO_PUBLIC_API_PATH=root then run: npx expo start -c";
      } else if (msg.includes("EXPO_PUBLIC_API_URL")) {
        displayMsg = "API URL not set. Add EXPO_PUBLIC_API_URL to .env and run: npx expo start -c";
      } else if (msg.includes("timed out")) {
        displayMsg = "Request timed out. Check your connection and try again.";
      } else if (msg.includes("Network") || msg.includes("Failed")) {
        displayMsg = "Couldn't reach the server. Is EXPO_PUBLIC_API_URL correct in .env? For a device, use your computer's IP (not localhost).";
      } else if (msg.length > 120) {
        displayMsg = `Error: ${msg.slice(0, 120)}…`;
      } else if (!msg.startsWith("Error:")) {
        displayMsg = `Error: ${msg}`;
      }
      const errMsg: ChatMessage = { id: "msg-err-" + Date.now(), role: "assistant", text: displayMsg, createdAt: new Date().toISOString() };
      setSession((prev) => (prev ? { ...prev, chat: [...(prev.chat ?? []), errMsg] } : null));
      await appendChatMessage(session.id, errMsg);
    } finally {
      setChatSending(false);
    }
  };

  const isInSession = session?.status === "in_progress";
  const plan = session?.plan;
  const timerState = session?.timerState;
  const isLDS = profile?.faithTradition === "LDS";

  const toggleBackground = (i: number) => {
    setExpandedBackground((prev) => ({ ...prev, [i]: !prev[i] }));
  };
  const toggleCrossRef = (key: string) => {
    setExpandedCrossRef((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const toggleKeyVerses = (i: number) => {
    setExpandedKeyVerses((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  if (isInSession && plan) {
    return (
      <View style={styles.container}>
        <View style={styles.timerHeader}>
          <Text style={styles.timerText}>{formatTime(timerState?.remainingSec ?? 0)}</Text>
          <Text style={styles.stepLabel}>{plan.title || plan.topic}</Text>
          <View style={styles.timerActions}>
            <Pressable onPress={handlePauseResume} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>{timerState?.isRunning ? "Pause" : "Resume"}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
              style={styles.chatInputMultiline}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask a question…"
              editable={!chatSending}
              multiline
              scrollEnabled
            />
            <Pressable onPress={handleSendChat} style={styles.sendBtn} disabled={chatSending || !chatInput.trim()}>
              <Text style={styles.sendBtnText}>{chatSending ? "…" : "Send"}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Scriptures</Text>
          {(plan.scriptures ?? []).map((sc, i) => {
            const isNewCard = sc.source != null || (sc.why != null && sc.why.length > 0);
            const showPassage = canShowFullText(sc.source) && sc.passage;
            const readUrl = sc.officialUrl || sc.url;

            if (isNewCard) {
              return (
                <View key={i} style={styles.card}>
                  <Text style={styles.cardTitle}>{sc.title}</Text>
                  <Text style={styles.scriptureRef}>{sc.ref}</Text>
                  {sc.keyVerses && sc.keyVerses.length > 0 && (
                    <Text style={styles.cardMeta}>Key verses: {sc.keyVerses.join(", ")}</Text>
                  )}
                  {showPassage ? <Text style={styles.scripturePassage}>{sc.passage}</Text> : null}
                  {sc.why && sc.why.length > 0 && (
                    <>
                      <Text style={styles.cardLabel}>Why this applies</Text>
                      {sc.why.map((w, j) => <Text key={j} style={styles.bullet}>• {w}</Text>)}
                    </>
                  )}
                  {sc.themes && sc.themes.length > 0 && (
                    <View style={styles.themesRow}>
                      {sc.themes.map((th, j) => (
                        <View key={j} style={styles.themeChip}><Text style={styles.themeChipText}>{th}</Text></View>
                      ))}
                    </View>
                  )}
                  {(sc.keyVersesSummary ?? sc.background) && (
                    <View style={styles.backgroundSection}>
                      {sc.keyVersesSummary ? (
                        <>
                          <Pressable onPress={() => toggleKeyVerses(i)} accessibilityRole="button" accessibilityState={{ expanded: !!expandedKeyVerses[i] }}>
                            <Text style={styles.backgroundToggle}>{expandedKeyVerses[i] ? "▼" : "▶"} Key verses summary</Text>
                          </Pressable>
                          {expandedKeyVerses[i] && <Text style={styles.cardSummary}>{sc.keyVersesSummary}</Text>}
                        </>
                      ) : null}
                      {sc.background ? (
                        <>
                          <Pressable onPress={() => toggleBackground(i)} accessibilityRole="button" accessibilityState={{ expanded: !!expandedBackground[i] }}>
                            <Text style={styles.backgroundToggle}>{expandedBackground[i] ? "▼" : "▶"} Background info</Text>
                          </Pressable>
                          {expandedBackground[i] && <Text style={styles.cardSummary}>{sc.background}</Text>}
                        </>
                      ) : null}
                    </View>
                  )}
                  <Pressable onPress={() => readUrl && Linking.openURL(readUrl)} style={styles.linkBtn}>
                    <Text style={styles.linkBtnText}>Read in Gospel Library / Official site</Text>
                  </Pressable>
                </View>
              );
            }

            return (
            <View key={i} style={styles.card}>
              <Text style={styles.cardTitle}>{sc.title}</Text>
              <Text style={styles.scriptureRef}>{sc.ref}</Text>
              {showPassage && sc.passage ? <Text style={styles.scripturePassage}>{sc.passage}</Text> : (sc.keyVersesSummary ? <Text style={styles.cardSummary}>{sc.keyVersesSummary}</Text> : null)}
              {sc.background ? (
                <View style={styles.backgroundSection}>
                  <Pressable onPress={() => toggleBackground(i)} accessibilityRole="button" accessibilityState={{ expanded: !!expandedBackground[i] }}>
                    <Text style={styles.backgroundToggle}>{expandedBackground[i] ? "▼" : "▶"} Background info</Text>
                  </Pressable>
                  {expandedBackground[i] && <Text style={styles.cardSummary}>{sc.background}</Text>}
                </View>
              ) : null}
              {(sc.observationQuestions ?? []).length > 0 && <Text style={styles.cardLabel}>Observe</Text>}
              {(sc.observationQuestions ?? []).map((q, j) => <Text key={j} style={styles.bullet}>• {q}</Text>)}
              {(sc.interpretation ?? []).length > 0 && <Text style={styles.cardLabel}>Interpret</Text>}
              {(sc.interpretation ?? []).map((x, j) => <Text key={j} style={styles.bullet}>• {x}</Text>)}
              {(sc.crossReferences ?? []).length > 0 && <Text style={styles.cardLabel}>Cross-refs</Text>}
              {(sc.crossReferences ?? []).map((cr, j) => {
                const crKey = `sc${i}-cr${j}`;
                const isExpanded = !!expandedCrossRef[crKey];
                return (
                  <View key={j} style={styles.crossRefItem}>
                    <Pressable onPress={() => toggleCrossRef(crKey)} accessibilityRole="button" accessibilityState={{ expanded: isExpanded }}>
                      <Text style={styles.crossRefChip}>{cr.ref} — {cr.why}</Text>
                    </Pressable>
                    {isExpanded && (
                      <View style={styles.crossRefExpand}>
                        <Text style={styles.scriptureRef}>{cr.ref}</Text>
                        {cr.passage && canShowFullText("BIBLE") ? <Text style={styles.scripturePassage}>{cr.passage}</Text> : (
                          <Pressable onPress={() => cr.url && Linking.openURL(cr.url)}><Text style={styles.linkText}>Open in browser</Text></Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
              <Pressable onPress={() => (sc.officialUrl || sc.url) && Linking.openURL(sc.officialUrl || sc.url)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>Open</Text>
              </Pressable>
            </View>
          );
          })}

          {isLDS && (plan.talks ?? []).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Talks from General Conference</Text>
              {(plan.talks ?? []).map((t, i) => (
                <View key={i} style={styles.card}>
                  <Text style={styles.cardTitle}>{t.title}</Text>
                  {t.speaker ? <Text style={styles.cardMeta}>{t.speaker}</Text> : null}
                  {t.conference ? <Text style={styles.cardMeta}>{t.conference}</Text> : null}
                  <Text style={styles.cardSummary}>{t.summary}</Text>
                  {t.why && t.why.length > 0 && t.why.map((w, j) => <Text key={j} style={styles.bullet}>• {w}</Text>)}
                  {t.themes && t.themes.length > 0 && (
                    <View style={styles.themesRow}>
                      {t.themes.map((th, j) => (
                        <View key={j} style={styles.themeChip}><Text style={styles.themeChipText}>{th}</Text></View>
                      ))}
                    </View>
                  )}
                  {t.officialUrl ? (
                    <Pressable onPress={() => Linking.openURL(t.officialUrl!)} style={styles.linkBtn}>
                      <Text style={styles.linkBtnText}>Read Full Talk</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.linkUnavailable}>Link unavailable</Text>
                  )}
                </View>
              ))}
            </>
          )}

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
      {process.env.EXPO_PUBLIC_API_URL?.trim() && (
        <View style={styles.apiStatusBox}>
          <Text style={styles.apiStatusLabel}>API</Text>
          {apiCheckLoading ? (
            <Text style={styles.apiStatusText}>Checking…</Text>
          ) : apiStatus ? (
            <>
              <Text style={styles.apiStatusUrl} numberOfLines={2}>{apiStatus.url || "(no url)"}</Text>
              {apiStatus.ok ? (
                <Text style={[styles.apiStatusText, styles.apiStatusOk]}>Reachable</Text>
              ) : (
                <>
                  <Text style={[styles.apiStatusText, styles.apiStatusErr]}>Not reachable</Text>
                  {apiStatus.error ? <Text style={styles.apiStatusError} numberOfLines={3}>{apiStatus.error}</Text> : null}
                  <Text style={styles.apiStatusHint}>
                    If you changed Vercel's repo or Root Directory, use that project's URL. Try EXPO_PUBLIC_API_PATH=root in .env if you get 404.
                  </Text>
                </>
              )}
              <Pressable onPress={runApiCheck} style={styles.apiCheckBtn} disabled={apiCheckLoading}>
                <Text style={styles.apiCheckBtnText}>Check again</Text>
              </Pressable>
            </>
          ) : null}
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
  apiStatusBox: { backgroundColor: "#f0f4f8", padding: 12, borderRadius: 8, marginBottom: 12 },
  apiStatusLabel: { fontSize: 12, fontWeight: "700", color: "#666", marginBottom: 4 },
  apiStatusUrl: { fontSize: 11, color: "#333", marginBottom: 4 },
  apiStatusText: { fontSize: 14 },
  apiStatusOk: { color: "#2b8a3e", fontWeight: "600" },
  apiStatusErr: { color: "#c00", fontWeight: "600" },
  apiStatusError: { fontSize: 12, color: "#c00", marginTop: 4 },
  apiStatusHint: { fontSize: 11, color: "#666", marginTop: 6, fontStyle: "italic" },
  apiCheckBtn: { marginTop: 8, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#0a7ea4", borderRadius: 8 },
  apiCheckBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
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
  themesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  themeChip: { backgroundColor: "#eee", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  themeChipText: { fontSize: 12 },
  linkUnavailable: { fontSize: 14, color: "#999", fontStyle: "italic", marginTop: 6 },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 14, marginBottom: 10 },
  scriptureRef: { fontSize: 15, fontWeight: "600", color: "#0a7ea4", marginBottom: 6 },
  scripturePassage: { fontSize: 15, color: "#333", lineHeight: 22, marginBottom: 8 },
  backgroundSection: { marginTop: 4, marginBottom: 4 },
  backgroundToggle: { fontSize: 14, fontWeight: "600", color: "#666", marginBottom: 4 },
  crossRefItem: { marginBottom: 8 },
  crossRefChip: { fontSize: 14, color: "#0a7ea4", fontWeight: "600", paddingVertical: 4 },
  crossRefExpand: { marginLeft: 12, marginTop: 4, padding: 10, backgroundColor: "#f8f9fa", borderRadius: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardMeta: { fontSize: 14, color: "#666", marginBottom: 4 },
  cardSummary: { fontSize: 14, color: "#444", marginBottom: 8 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#666", marginTop: 8, marginBottom: 4 },
  bullet: { fontSize: 14, color: "#333", marginBottom: 2 },
  linkText: { fontSize: 14, color: "#0a7ea4", marginBottom: 4 },
  linkBtn: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#eee", borderRadius: 8, marginTop: 6 },
  linkBtnText: { fontSize: 14, fontWeight: "600" },
  journalLabel: { fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  journalInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, minHeight: 56, textAlignVertical: "top" },
  saveJournalBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#0a7ea4" },
  saveJournalBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  chatThread: { maxHeight: 180, marginBottom: 8 },
  chatBubble: { maxWidth: "85%", padding: 10, borderRadius: 12, marginBottom: 6 },
  chatBubbleUser: { alignSelf: "flex-end", backgroundColor: "#0a7ea4" },
  chatBubbleAssistant: { alignSelf: "flex-start", backgroundColor: "#eee" },
  chatBubbleText: { fontSize: 14 },
  chatInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  chatInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 10, fontSize: 15, textAlignVertical: "top" },
  chatInputMultiline: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 10, fontSize: 15, minHeight: 56, maxHeight: 200, textAlignVertical: "top" },
  sendBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "#0a7ea4", borderRadius: 10 },
  sendBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  finishBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#2b8a3e" },
  finishBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
