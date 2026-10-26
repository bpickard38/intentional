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
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StudyProgressBar } from "@/components/StudyProgressBar";
import * as Haptics from "expo-haptics";
import type { ScrollView as RNScrollView } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { StudySession, StudyMode, ChatMessage, UserProfile, StudyDepth, ChapterStudyResponse, StudyPlanDoc, StudyPlanDay } from "@/src/core/types";
import { todayKey } from "@/src/core/dates";
import { getJson } from "@/src/core/storage";
import { generateStudySession, studyChat, generateChapterStudy } from "@/src/ai/apiClient";
import { listPlans } from "@/src/study/planStorage";
import { fallbackPlanV2, TOPIC_SUGGESTIONS } from "@/src/study/topics";
import { ChapterPicker } from "@/src/features/study/ChapterPicker";
import { listJournals, setJournal, listPins, setPinnedLookFor } from "@/src/study/journalStorage";
import {
  addSession,
  updateSessionJournal,
  appendChatMessage,
  setSessionTimerState,
  setSessionStatus,
  getSessionById,
} from "@/src/study/sessionService";

const PROFILE_KEY = "profile:v1";
const DEFAULT_PROFILE: UserProfile = {
  id: "default",
  faithTradition: "Christian",
  studyDisplayMode: "BOTH",
  studyDepth: "GUIDED",
  createdAt: new Date().toISOString(),
};
const TIMER_PERSIST_INTERVAL_MS = 10000;

/** Copyright helper: @/src/core/copyright */

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function formatSavedAt(isoString: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const DEPTH_OPTIONS: { value: StudyDepth; label: string; mode: StudyMode }[] = [
  { value: "QUICK", label: "Quick", mode: "devotional" },
  { value: "GUIDED", label: "Guided", mode: "deep" },
  { value: "DEEP_DIVE", label: "Deep Dive", mode: "challenge" },
];

function modeFromDepth(depth: StudyDepth): StudyMode {
  const found = DEPTH_OPTIONS.find((o) => o.value === depth);
  return found ? found.mode : "deep";
}

function depthFromMode(mode: StudyMode): StudyDepth {
  const found = DEPTH_OPTIONS.find((o) => o.mode === mode);
  return found ? found.value : "GUIDED";
}

export default function StudyScreen() {
  const { sessionId, journalRef, planRefs } = useLocalSearchParams<{ sessionId?: string; journalRef?: string; planRefs?: string }>();
  const router = useRouter();
  const [session, setSession] = useState<StudySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [durationMin, setDurationMin] = useState<15 | 30 | 60>(30);
  const [mode, setMode] = useState<StudyMode>("devotional");
  const [studyDepth, setStudyDepth] = useState<StudyDepth>("GUIDED");
  const [topic, setTopic] = useState("");
  const [entryMode, setEntryMode] = useState<"topic" | "chapters">("topic");
  const [chapterRefs, setChapterRefs] = useState<string[]>([]);

  const [journalLearned, setJournalLearned] = useState("");
  const [journalFelt, setJournalFelt] = useState("");
  const [journalAction, setJournalAction] = useState("");
  const [savingJournal, setSavingJournal] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [expandedReadingCards, setExpandedReadingCards] = useState<Record<number, boolean>>({});
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [chapterStudy, setChapterStudy] = useState<ChapterStudyResponse | null>(null);
  const [chapterFromCache, setChapterFromCache] = useState(false);
  const [activePlan, setActivePlan] = useState<StudyPlanDoc | null>(null);
  const [activePlanDay, setActivePlanDay] = useState<StudyPlanDay | null>(null);

  const timerPersistRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<StudySession | null>(session);
  sessionRef.current = session;

  const [chapterJournalDrafts, setChapterJournalDrafts] = useState<Record<string, string>>({});
  const [chapterJournalSavedAt, setChapterJournalSavedAt] = useState<Record<string, string>>({});
  const [chapterJournalSaving, setChapterJournalSaving] = useState<Record<string, boolean>>({});
  const journalSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [pinnedLookForMap, setPinnedLookForMap] = useState<Record<string, string[]>>({});
  const scrollRef = useRef<RNScrollView | null>(null);
  const chapterCardOffsetsRef = useRef<Record<string, number>>({});
  const [initialJournalRef, setInitialJournalRef] = useState<string | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);

  const loadProfile = useCallback(async (): Promise<UserProfile> => {
    const p = await getJson<UserProfile>(PROFILE_KEY);
    return p ?? DEFAULT_PROFILE;
  }, []);

  // Seed chapter journal drafts and pinned prompts when chapter results load.
  useEffect(() => {
    if (!chapterStudy || !chapterStudy.chapters.length) return;
    (async () => {
      try {
        const [journals, pins] = await Promise.all([listJournals(), listPins()]);
        const drafts: Record<string, string> = {};
        const savedAt: Record<string, string> = {};
        journals.forEach((entry) => {
          drafts[entry.reference] = entry.text ?? "";
          savedAt[entry.reference] = entry.updatedAt ?? "";
        });
        setChapterJournalDrafts(drafts);
        setChapterJournalSavedAt(savedAt);
        setPinnedLookForMap(pins);
      } catch {
        // Journaling must never block the main Study UI.
      }
    })();
  }, [chapterStudy, chapterStudy?.cacheKey, chapterStudy?.generatedAt]);

  const scheduleJournalSave = useCallback((reference: string, text: string) => {
    const refKey = reference.trim();
    if (!refKey) return;
    setChapterJournalDrafts((prev) => ({ ...prev, [refKey]: text }));
    setChapterJournalSaving((prev) => ({ ...prev, [refKey]: true }));
    const timers = journalSaveTimersRef.current;
    if (timers[refKey]) {
      clearTimeout(timers[refKey]);
    }
    timers[refKey] = setTimeout(async () => {
      try {
        await setJournal(refKey, text);
        const now = new Date().toISOString();
        setChapterJournalSavedAt((prev) => ({ ...prev, [refKey]: now }));
      } finally {
        setChapterJournalSaving((prev) => ({ ...prev, [refKey]: false }));
      }
    }, 800);
  }, []);

  const flushJournalSave = useCallback(
    async (reference: string) => {
      const refKey = reference.trim();
      if (!refKey) return;
      const timers = journalSaveTimersRef.current;
      if (timers[refKey]) {
        clearTimeout(timers[refKey]);
        delete timers[refKey];
      }
      const text = chapterJournalDrafts[refKey] ?? "";
      if (!text && !chapterJournalSavedAt[refKey]) {
        return;
      }
      setChapterJournalSaving((prev) => ({ ...prev, [refKey]: true }));
      try {
        await setJournal(refKey, text);
        const now = new Date().toISOString();
        setChapterJournalSavedAt((prev) => ({ ...prev, [refKey]: now }));
      } finally {
        setChapterJournalSaving((prev) => ({ ...prev, [refKey]: false }));
      }
    },
    [chapterJournalDrafts, chapterJournalSavedAt]
  );

  // Flush any in-flight journal saves when leaving the Study screen.
  useEffect(
    () => () => {
      const refs = Object.keys(journalSaveTimersRef.current);
      refs.forEach((ref) => {
        void flushJournalSave(ref);
      });
    },
    [flushJournalSave]
  );

  // Cancel in-flight chapter study request when leaving the screen.
  useEffect(
    () => () => {
      if (generateAbortRef.current) {
        generateAbortRef.current.abort();
        generateAbortRef.current = null;
      }
    },
    []
  );

  const togglePin = useCallback(
    (reference: string, prompt: string) => {
      const refKey = reference.trim();
      const promptText = prompt.trim();
      if (!refKey || !promptText) return;
      setPinnedLookForMap((prev) => {
        const existing = prev[refKey] ?? [];
        const isPinned = existing.includes(promptText);
        let nextForRef: string[];
        if (isPinned) {
          nextForRef = existing.filter((p) => p !== promptText);
        } else {
          if (existing.length >= 3) {
            nextForRef = existing;
          } else {
            nextForRef = [...existing, promptText];
          }
        }
        const { [refKey]: _ignored, ...rest } = prev;
        const nextMap =
          nextForRef.length === 0 ? rest : { ...rest, [refKey]: nextForRef };
        // Persist pins asynchronously; ignore errors so UI stays responsive.
        void setPinnedLookFor(refKey, nextForRef);
        return nextMap;
      });
    },
    []
  );

  // Seed defaults from profile when not already in a running session.
  useEffect(() => {
    if (session) return;
    loadProfile().then((p) => {
      const depth = p.studyDepth ?? "GUIDED";
      setProfile({ ...p, studyDepth: depth });
      setStudyDepth(depth);
      setMode(modeFromDepth(depth));
    });
  }, [loadProfile, session]);

  // Load active plan whenever the tab is focused.
  useFocusEffect(
    useCallback(() => {
      if (session) return;
      listPlans().then((plans) => {
        const inProgress = plans.find((p) => {
          const completed = p.progress?.completedDayIds ?? [];
          return completed.length < p.days.length;
        });
        if (inProgress) {
          const created = new Date(inProgress.createdAt);
          const now = new Date();
          const dayOffset = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          const dayNumber = dayOffset + 1;
          const day = inProgress.days.find((d) => d.dayNumber === dayNumber) ?? null;
          setActivePlan(inProgress);
          setActivePlanDay(day);
        } else {
          setActivePlan(null);
          setActivePlanDay(null);
        }
      }).catch(() => {});
    }, [session])
  );

  const loadResumedSession = useCallback(async () => {
    if (!sessionId) return;
    const s = await getSessionById(sessionId);
    if (s && s.status === "in_progress") {
      setSession(s);
      setDurationMin(s.durationMin);
      setMode(s.plan.mode);
      setStudyDepth(s.plan.studyDepth ?? depthFromMode(s.plan.mode));
      setTopic(s.plan.topic);
      setJournalLearned(s.journal?.learned ?? "");
      setJournalFelt(s.journal?.felt ?? "");
      setJournalAction(s.journal?.action ?? "");
    }
  }, [sessionId]);

  useEffect(() => {
    loadResumedSession();
  }, [loadResumedSession]);

  // If a journalRef is provided (from the My Journal screen), focus chapter study on that reference
  // and ensure we generate or load study helps for it.
  useEffect(() => {
    if (journalRef) {
      setEntryMode("chapters");
      setChapterRefs((prev) => (prev.includes(journalRef) ? prev : [journalRef, ...prev]));
      setInitialJournalRef(journalRef);
      return;
    }
    if (planRefs && typeof planRefs === "string") {
      const refs = planRefs.split(",").map((r) => r.trim()).filter(Boolean);
      if (refs.length > 0) {
        setEntryMode("chapters");
        setChapterRefs(refs);
        setInitialJournalRef(refs[0]);
      }
    }
  }, [journalRef, planRefs]);

  useEffect(() => {
    if (session?.status === "in_progress") {
      loadProfile().then(setProfile);
    }
  }, [session?.status, loadProfile]);

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
        plan = await generateStudySession(
          durationMin,
          t,
          mode,
          loadedProfile.faithTradition,
          loadedProfile.studyDisplayMode ?? "BOTH",
          studyDepth
        );
      } catch (err) {
        setApiError(err instanceof Error ? err.message : String(err));
        plan = fallbackPlanV2(
          durationMin,
          t,
          mode,
          loadedProfile.faithTradition,
          loadedProfile.studyDisplayMode ?? "BOTH",
          studyDepth
        );
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
    } catch {
      setApiError("Something went wrong");
      const loadedProfile = await loadProfile();
      setProfile(loadedProfile);
      const plan = fallbackPlanV2(
        durationMin,
        topic.trim() || "Faith",
        mode,
        loadedProfile.faithTradition,
        loadedProfile.studyDisplayMode ?? "BOTH",
        studyDepth
      );
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

  const handleGenerateChapterStudy = useCallback(
    async (opts?: { forceRefresh?: boolean }) => {
      if (chapterRefs.length === 0 || loading) return;
      const controller = new AbortController();
      generateAbortRef.current = controller;
      setLoading(true);
      setApiError(null);
      try {
        const { result, fromCache } = await generateChapterStudy(chapterRefs, {
          ...opts,
          studyDepth,
          signal: controller.signal,
        });
        if (generateAbortRef.current === controller) {
          generateAbortRef.current = null;
        }
        setChapterStudy(result);
        setChapterFromCache(fromCache);
      } catch (err) {
        if (generateAbortRef.current === controller) {
          generateAbortRef.current = null;
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("abort") || msg.includes("Aborted")) {
          return;
        }
        setApiError(msg);
      } finally {
        setLoading(false);
      }
    },
    [chapterRefs, loading, studyDepth]
  );

  useEffect(() => {
    if (!initialJournalRef) return;
    if (!chapterStudy || !chapterStudy.chapters.length) {
      if (chapterRefs.length > 0) {
        void handleGenerateChapterStudy();
      }
      return;
    }
    const offset = chapterCardOffsetsRef.current[initialJournalRef];
    if (offset != null && scrollRef.current) {
      scrollRef.current.scrollTo({ y: offset, animated: true });
    }
  }, [initialJournalRef, chapterRefs, chapterStudy, handleGenerateChapterStudy]);

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
    // Also persist to shared journal storage so it appears in My Journal tab.
    if (journalLearned.trim()) {
      const refKey = `${session.topic} (${session.date})`;
      const chapters = (plan?.readingCards ?? []).map((c) => c.reference).filter(Boolean);
      await setJournal(refKey, journalLearned.trim(), chapters.length ? chapters : undefined).catch(() => {});
    }
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
  const effectiveDepth: StudyDepth =
    (plan?.studyDepth as StudyDepth) ?? studyDepth ?? "GUIDED";
  const maxReadingCards = effectiveDepth === "QUICK" ? 1 : 3;
  const maxKeyMoments = effectiveDepth === "QUICK" ? 3 : 6;
  const showDeepDive = effectiveDepth !== "QUICK";

  useEffect(() => {
    setDeepDiveOpen(effectiveDepth === "DEEP_DIVE");
  }, [effectiveDepth]);

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
          {/* 1) Ask during study — at the very top */}
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
              maxLength={2000}
            />
            <Pressable onPress={handleSendChat} style={styles.sendBtn} disabled={chatSending || !chatInput.trim()}>
              <Text style={styles.sendBtnText}>{chatSending ? "…" : "Send"}</Text>
            </Pressable>
          </View>

          {/* 2) Look for — one short focus lens */}
          <View style={styles.lookForCard}>
            <Text style={styles.lookForLabel}>Look for</Text>
            <Text style={styles.lookForText}>
              {plan.studyPlan?.lookFor || "Notice what God highlights for you."}
            </Text>
          </View>

          {/* 3) Recommended reading — scripture cards with per-card Big Idea */}
          <Text style={styles.sectionTitle}>Recommended reading</Text>
          {(plan.readingCards ?? []).slice(0, maxReadingCards).map((card, index) => {
            const isExpanded = !!expandedReadingCards[index];
            const keyMoments = (card.keyMoments ?? []).slice(0, maxKeyMoments);
            const keyVerses = card.keyVerses ?? [];
            const crossRefs = card.crossRefs ?? [];
            const bigIdea = card.bigIdea || card.whyOneLine;
            const showWhySeparately = card.bigIdea && card.whyOneLine && card.whyOneLine !== card.bigIdea;
            return (
              <View key={`${card.reference}-${index}`} style={styles.card}>
                <Text style={styles.scriptureRef}>{card.reference}</Text>
                <Text style={styles.cardBigIdea}>{bigIdea}</Text>
                {showWhySeparately ? <Text style={styles.cardSummary}>{card.whyOneLine}</Text> : null}
                <View style={styles.readingActionsRow}>
                  <Pressable
                    onPress={() => card.url && Linking.openURL(card.url)}
                    style={styles.linkBtn}
                    disabled={!card.url}
                  >
                    <Text style={styles.linkBtnText}>{card.url ? "Open chapter" : "Link unavailable"}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setExpandedReadingCards((prev) => ({ ...prev, [index]: !prev[index] }))
                    }
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                    style={styles.toggleBtn}
                  >
                    <Text style={styles.toggleBtnText}>
                      {isExpanded ? "Hide key moments" : "Show key moments"}
                    </Text>
                  </Pressable>
                </View>
                {isExpanded && (
                  <View style={styles.keyMomentsSection}>
                    {keyMoments.map((km, i) => (
                      <Text key={i} style={styles.bullet}>
                        • {km}
                      </Text>
                    ))}
                    {keyVerses.length > 0 && (
                      <View style={styles.keyVersesRow}>
                        {keyVerses.map((kv) => (
                          <View key={kv} style={styles.themeChip}>
                            <Text style={styles.themeChipText}>{kv}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {crossRefs.length > 0 && (
                      <View style={styles.crossRefChipRow}>
                        {crossRefs.map((cr) => (
                          <Pressable
                            key={cr.label + cr.url}
                            onPress={() => cr.url && Linking.openURL(cr.url)}
                            style={styles.crossRefPill}
                          >
                            <Text style={styles.crossRefPillText}>{cr.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {/* SECTION 4 — OPTIONAL DEEP DIVE */}
          {showDeepDive && plan.deepDive && (plan.deepDive.backgroundBullets || plan.deepDive.crossRefs || (isLDS && plan.deepDive.talk)) ? (
            <View style={styles.deepDiveContainer}>
              <Pressable
                onPress={() => setDeepDiveOpen((prev) => !prev)}
                accessibilityRole="button"
                accessibilityState={{ expanded: deepDiveOpen }}
                style={styles.deepDiveHeader}
              >
                <Text style={styles.deepDiveHeaderText}>
                  {deepDiveOpen ? "▼" : "▶"} Want more context?
                </Text>
              </Pressable>
              {deepDiveOpen && (
                <View style={styles.deepDiveBody}>
                  {(plan.deepDive.backgroundBullets ?? []).slice(0, 4).map((b, i) => (
                    <Text key={i} style={styles.bullet}>
                      • {b}
                    </Text>
                  ))}
                  {(plan.deepDive?.crossRefs ?? []).length > 0 && (
                    <View style={styles.crossRefChipRow}>
                      {(plan.deepDive?.crossRefs ?? []).map((cr) => (
                        <Pressable
                          key={cr.label + cr.url}
                          onPress={() => cr.url && Linking.openURL(cr.url)}
                          style={styles.crossRefPill}
                        >
                          <Text style={styles.crossRefPillText}>{cr.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {isLDS && plan.deepDive?.talk && (() => {
                    const talk = plan.deepDive?.talk;
                    if (!talk) return null;
                    return (
                      <View style={styles.talkCard}>
                        <Text style={styles.cardTitle}>{talk.title}</Text>
                        <Text style={styles.cardMeta}>{talk.speaker}</Text>
                        <Text style={styles.cardSummary}>{talk.whyOneLine}</Text>
                        {talk.officialUrl ? (
                          <Pressable
                            onPress={() => Linking.openURL(talk.officialUrl)}
                            style={styles.linkBtn}
                          >
                            <Text style={styles.linkBtnText}>Read full talk</Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.linkUnavailable}>Link unavailable</Text>
                        )}
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>
          ) : null}

          {/* 5) Ponder / Journal — at the end, journal always visible */}
          <Text style={styles.sectionTitle}>Ponder</Text>
          <Text style={styles.ponderQuestion}>
            {plan.studyPlan?.ponder || (plan.reflectionPrompts && plan.reflectionPrompts[0]) || "What do you feel invited to do?"}
          </Text>
          <Text style={styles.journalLabel}>Journal</Text>
          <TextInput
            style={styles.journalInput}
            value={journalLearned}
            onChangeText={setJournalLearned}
            multiline
            placeholder="Jot down your thoughts…"
          />
          <Pressable onPress={handleSaveJournal} style={styles.saveJournalBtn} disabled={savingJournal}>
            <Text style={styles.saveJournalBtnText}>{savingJournal ? "Saving…" : "Save"}</Text>
          </Pressable>

          <Pressable onPress={handleFinishSession} style={styles.finishBtn}>
            <Text style={styles.finishBtnText}>Finish session</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.setupContent}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Study</Text>
        <View style={styles.titleActionsRow}>
          <Pressable onPress={() => router.push("/study/plans" as never)} style={styles.myJournalBtn}>
            <Text style={styles.myJournalBtnText}>Plans</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/study/journal")} style={styles.myJournalBtn}>
            <Text style={styles.myJournalBtnText}>Journal</Text>
          </Pressable>
        </View>
      </View>

      {activePlan && activePlanDay && (
        <View style={styles.activePlanCard}>
          <Text style={styles.activePlanLabel}>Continue your plan</Text>
          <Text style={styles.activePlanTitle} numberOfLines={1}>{activePlan.title}</Text>
          <Text style={styles.activePlanFocus}>Day {activePlanDay.dayNumber}: {activePlanDay.focus}</Text>
          {activePlanDay.references.length > 0 && (
            <Text style={styles.activePlanRefs}>{activePlanDay.references.join(" • ")}</Text>
          )}
          <Pressable
            onPress={() =>
              router.push(`/study/plans/${activePlan.id}/day/${activePlanDay.id}` as never)
            }
            style={styles.activePlanBtn}
          >
            <Text style={styles.activePlanBtnText}>Start Plan Study →</Text>
          </Pressable>
        </View>
      )}

      {activePlan && (
        <Text style={styles.orLabel}>— or start a different study —</Text>
      )}

      <Text style={styles.label}>Study type</Text>
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => setEntryMode("topic")}
          style={[styles.modeBtn, entryMode === "topic" && styles.modeBtnActive]}
        >
          <Text
            style={[
              styles.modeBtnText,
              entryMode === "topic" && styles.modeBtnTextActive,
            ]}
          >
            Topic session
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setEntryMode("chapters")}
          style={[
            styles.modeBtn,
            entryMode === "chapters" && styles.modeBtnActive,
          ]}
        >
          <Text
            style={[
              styles.modeBtnText,
              entryMode === "chapters" && styles.modeBtnTextActive,
            ]}
          >
            Chapter study
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Duration</Text>
      <View style={styles.durationRow}>
        {([15, 30, 60] as const).map((d) => (
          <Pressable key={d} onPress={() => setDurationMin(d)} style={[styles.durBtn, durationMin === d && styles.durBtnActive]}>
            <Text style={[styles.durBtnText, durationMin === d && styles.durBtnTextActive]}>{d} min</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Study depth</Text>
      <View style={styles.modeRow}>
        {DEPTH_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => {
              setStudyDepth(opt.value);
              setMode(opt.mode);
            }}
            style={[styles.modeBtn, studyDepth === opt.value && styles.modeBtnActive]}
          >
            <Text
              style={[
                styles.modeBtnText,
                studyDepth === opt.value && styles.modeBtnTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {entryMode === "topic" ? (
        <>
          <Text style={styles.label}>Topic</Text>
          <View style={styles.topicChips}>
            {TOPIC_SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setTopic(s)}
                style={[styles.chip, topic === s && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    topic === s && styles.chipTextActive,
                  ]}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Or type custom topic"
            value={topic}
            onChangeText={setTopic}
          />
        </>
      ) : (
        <>
          <ChapterPicker
            selected={chapterRefs}
            onChangeSelected={setChapterRefs}
            onGenerate={() => handleGenerateChapterStudy()}
            generating={loading}
          />
          {loading && chapterRefs.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Study helps</Text>
              <StudyProgressBar loading={loading} label="Building study helps…" />
            </>
          )}
          {!loading && chapterStudy && (
            <>
              <Text style={styles.sectionTitle}>Study helps</Text>
              {chapterFromCache && (
                <Text style={styles.helperText}>
                  Showing your last result for this chapter set. Tap Regenerate for a fresh set of prompts.
                </Text>
              )}
              {chapterStudy.chapters.map((ch) => {
                const pinsForChapter = pinnedLookForMap[ch.reference] ?? [];
                const lookForItems = (ch.lookFor ?? []).filter(Boolean).slice(0, 5);
                return (
                  <View
                    key={ch.reference}
                    style={styles.card}
                    onLayout={(e) => {
                      const y = e.nativeEvent.layout.y;
                      chapterCardOffsetsRef.current[ch.reference] = y;
                      if (initialJournalRef === ch.reference && scrollRef.current) {
                        scrollRef.current.scrollTo({ y, animated: true });
                      }
                    }}
                  >
                    <Text style={styles.scriptureRef}>{ch.reference}</Text>
                    <Text style={styles.cardBigIdea}>{ch.bigIdea}</Text>

                    {pinsForChapter.length > 0 && (
                      <View style={styles.pinnedFocusCard}>
                        <Text style={styles.cardLabel}>Pinned focus</Text>
                        {pinsForChapter.map((p) => (
                          <Text key={p} style={styles.bullet}>
                            • {p}
                          </Text>
                        ))}
                      </View>
                    )}

                    {ch.context ? (
                      <Text style={styles.cardSummary}>{ch.context}</Text>
                    ) : null}

                    {ch.themes && ch.themes.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.cardLabel}>Themes</Text>
                        <View style={styles.themesRow}>
                          {ch.themes.map((theme) => (
                            <Pressable
                              key={theme.id || theme.title}
                              onPress={() =>
                                router.push({
                                  pathname: "/study/theme",
                                  params: {
                                    data: JSON.stringify({
                                      reference: ch.reference,
                                      theme,
                                      crossReferences: (ch.crossReferences ?? []).filter(
                                        (cr) =>
                                          (cr.themeId && theme.id && cr.themeId === theme.id) ||
                                          (!cr.themeId && cr.label && cr.label === theme.title)
                                      ),
                                      relatedChapters:
                                        ch.relatedChaptersByTheme?.[theme.id] ?? [],
                                    }),
                                  },
                                })
                              }
                              style={styles.themeChip}
                            >
                              <Text style={styles.themeChipText}>{theme.title}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}

                    {lookForItems.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.cardLabel}>Look for while reading</Text>
                        {lookForItems.map((lf) => {
                          const isPinned = pinsForChapter.includes(lf);
                          return (
                            <View key={lf} style={styles.lookForRow}>
                              <Text style={styles.bullet}>• {lf}</Text>
                              <Pressable
                                onPress={() => togglePin(ch.reference, lf)}
                                style={styles.pinBtn}
                              >
                                <Text
                                  style={[
                                    styles.pinText,
                                    isPinned && styles.pinTextActive,
                                  ]}
                                >
                                  {isPinned ? "Pinned" : "Pin"}
                                </Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {ch.discussionQuestions && ch.discussionQuestions.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.cardLabel}>Discuss</Text>
                        {ch.discussionQuestions.map((q, idx) => (
                          <Text key={idx} style={styles.bullet}>
                            • {q}
                          </Text>
                        ))}
                      </View>
                    )}

                    {ch.crossReferences && ch.crossReferences.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.cardLabel}>Cross references</Text>
                        <View style={styles.crossRefChipRow}>
                          {ch.crossReferences.flatMap((group, groupIndex) =>
                            group.refs.map((ref) => {
                              const label = group.label ?? "";
                              const key = `${groupIndex}:${label || group.themeId || "group"}:${ref}`;
                              return (
                                <View key={key} style={styles.themeChip}>
                                  <Text style={styles.themeChipText}>
                                    {label ? `${label}: ${ref}` : ref}
                                  </Text>
                                </View>
                              );
                            })
                          )}
                        </View>
                      </View>
                    )}

                    {ch.links && ch.links.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.cardLabel}>Open</Text>
                        <View style={styles.readingActionsRow}>
                          {ch.links.map((ln) => (
                            <Pressable
                              key={ln.label + ln.url}
                              onPress={() => ln.url && Linking.openURL(ln.url)}
                              style={styles.linkBtn}
                            >
                              <Text style={styles.linkBtnText}>{ln.label || "Open"}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}

                    {ch.studyPlanSuggestion ? (
                      <Text style={[styles.cardSummary, { marginTop: 8 }]}>
                        {ch.studyPlanSuggestion}
                      </Text>
                    ) : null}

                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.cardLabel}>Journal / Personal Revelation</Text>
                      <TextInput
                        style={styles.journalInput}
                        value={chapterJournalDrafts[ch.reference] ?? ""}
                        onChangeText={(text) => scheduleJournalSave(ch.reference, text)}
                        onBlur={() => {
                          void flushJournalSave(ch.reference);
                        }}
                        multiline
                        placeholder="What stood out to you? Any impressions, questions, or actions?"
                      />
                      <Text style={styles.journalStatus}>
                        {chapterJournalSaving[ch.reference]
                          ? "Saving…"
                          : chapterJournalSavedAt[ch.reference]
                          ? `Saved at ${formatSavedAt(chapterJournalSavedAt[ch.reference])}`
                          : "Not yet saved"}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {chapterStudy.chapters.length > 0 && (
                loading
                  ? <StudyProgressBar loading={loading} label="Regenerating study helps…" />
                  : <Pressable
                      onPress={() => handleGenerateChapterStudy({ forceRefresh: true })}
                      style={[styles.genBtn, { marginTop: 8 }]}
                    >
                      <Text style={styles.genBtnText}>Regenerate</Text>
                    </Pressable>
              )}
            </>
          )}
        </>
      )}

      {apiError ? <Text style={styles.errorText}>{apiError}</Text> : null}

      {entryMode === "topic" && (
        loading
          ? <StudyProgressBar loading={loading} label="Generating your study…" />
          : <Pressable onPress={handleStartSession} style={styles.genBtn}>
              <Text style={styles.genBtnText}>Start session</Text>
            </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060f20" },
  setupContent: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: "800", color: "rgba(255,255,255,0.95)" },
  activePlanCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.28)",
    backgroundColor: "#091828",
    padding: 14,
    marginBottom: 14,
  },
  activePlanLabel: { fontSize: 11, fontWeight: "700", color: "#f5a623", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  activePlanTitle: { fontSize: 12, color: "rgba(255,255,255,0.50)", marginBottom: 6 },
  activePlanFocus: { fontSize: 15, fontWeight: "700", color: "rgba(255,255,255,0.95)", marginBottom: 4 },
  activePlanRefs: { fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 10 },
  activePlanBtn: {
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f5a623",
    alignItems: "center",
  },
  activePlanBtnText: { fontSize: 14, fontWeight: "700", color: "#060f20" },
  orLabel: { textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 16 },
  titleActionsRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  myJournalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f5a623",
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  myJournalBtnText: { fontSize: 13, fontWeight: "600", color: "#f5a623" },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8, color: "rgba(255,255,255,0.90)" },
  durationRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  durBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#142030" },
  durBtnActive: { borderColor: "#f5a623", backgroundColor: "rgba(245,166,35,0.12)" },
  durBtnText: { fontSize: 15, fontWeight: "600", color: "rgba(255,255,255,0.65)" },
  durBtnTextActive: { color: "#f5a623", fontWeight: "700" },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#142030" },
  modeBtnActive: { borderColor: "#f5a623", backgroundColor: "rgba(245,166,35,0.12)" },
  modeBtnText: { fontSize: 14, color: "rgba(255,255,255,0.65)" },
  modeBtnTextActive: { fontWeight: "700", color: "#f5a623" },
  topicChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#142030" },
  chipActive: { borderColor: "#f5a623", backgroundColor: "rgba(245,166,35,0.12)" },
  chipText: { fontSize: 14, color: "rgba(255,255,255,0.65)" },
  chipTextActive: { fontWeight: "600", color: "#f5a623" },
  input: { borderWidth: 1, borderColor: "#142030", borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 16, color: "#fff", backgroundColor: "#091828" },
  envBanner: { backgroundColor: "rgba(245,166,35,0.15)", padding: 10, borderRadius: 8, marginBottom: 12 },
  envBannerText: { fontSize: 12, color: "#f5a623" },
  apiStatusBox: { backgroundColor: "#091828", padding: 12, borderRadius: 8, marginBottom: 12 },
  apiStatusLabel: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.45)", marginBottom: 4 },
  apiStatusUrl: { fontSize: 11, color: "rgba(255,255,255,0.60)", marginBottom: 4 },
  apiStatusText: { fontSize: 14, color: "rgba(255,255,255,0.80)" },
  apiStatusOk: { color: "#2ecc71", fontWeight: "600" },
  apiStatusErr: { color: "#e74c3c", fontWeight: "600" },
  apiStatusError: { fontSize: 12, color: "#e74c3c", marginTop: 4 },
  apiStatusHint: { fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 6, fontStyle: "italic" },
  apiCheckBtn: { marginTop: 8, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#f5a623", borderRadius: 8 },
  apiCheckBtnText: { fontSize: 13, fontWeight: "600", color: "#060f20" },
  errorText: { fontSize: 12, color: "#e74c3c", marginBottom: 8 },
  genBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#f5a623" },
  genBtnText: { fontSize: 16, fontWeight: "800", color: "#060f20" },
  helperText: { fontSize: 12, color: "rgba(255,255,255,0.50)", marginBottom: 8 },

  timerHeader: { padding: 12, backgroundColor: "#091828", borderBottomWidth: 1, borderBottomColor: "#142030" },
  timerText: { fontSize: 28, fontWeight: "800", color: "rgba(255,255,255,0.95)" },
  stepLabel: { fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 4 },
  timerActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#f5a623", borderRadius: 8 },
  smallBtnText: { fontSize: 14, fontWeight: "600", color: "#060f20" },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8, color: "rgba(255,255,255,0.90)" },
  themesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  themeChip: { backgroundColor: "#142030", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  themeChipText: { fontSize: 12, color: "rgba(255,255,255,0.70)" },
  linkUnavailable: { fontSize: 14, color: "rgba(255,255,255,0.35)", fontStyle: "italic", marginTop: 6 },
  card: { borderWidth: 1, borderColor: "#142030", borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: "#091828" },
  scriptureRef: { fontSize: 15, fontWeight: "600", color: "#f5a623", marginBottom: 6 },
  cardBigIdea: { fontSize: 15, fontWeight: "600", color: "rgba(255,255,255,0.90)", marginBottom: 6 },
  readingActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  toggleBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#142030" },
  toggleBtnText: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.65)" },
  keyMomentsSection: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#142030" },
  keyVersesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  crossRefChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  crossRefPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "rgba(245,166,35,0.12)" },
  crossRefPillText: { fontSize: 13, color: "#f5a623", fontWeight: "600" },
  lookForCard: { backgroundColor: "#091828", borderRadius: 10, padding: 12, marginTop: 16, marginBottom: 8 },
  pinnedFocusCard: {
    backgroundColor: "rgba(245,166,35,0.10)",
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  lookForLabel: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.45)", marginBottom: 4 },
  lookForText: { fontSize: 15, color: "rgba(255,255,255,0.80)" },
  lookForRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  ponderQuestion: { fontSize: 15, color: "rgba(255,255,255,0.75)", fontStyle: "italic", marginBottom: 12 },
  scripturePassage: { fontSize: 15, color: "rgba(255,255,255,0.80)", lineHeight: 22, marginBottom: 8 },
  backgroundSection: { marginTop: 4, marginBottom: 4 },
  backgroundToggle: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.55)", marginBottom: 4 },
  crossRefItem: { marginBottom: 8 },
  crossRefChip: { fontSize: 14, color: "#f5a623", fontWeight: "600", paddingVertical: 4 },
  crossRefExpand: { marginLeft: 12, marginTop: 4, padding: 10, backgroundColor: "#091828", borderRadius: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4, color: "rgba(255,255,255,0.90)" },
  cardMeta: { fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 4 },
  cardSummary: { fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 8 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.45)", marginTop: 8, marginBottom: 4 },
  bullet: { fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 2 },
  linkText: { fontSize: 14, color: "#f5a623", marginBottom: 4 },
  linkBtn: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#142030", borderRadius: 8, marginTop: 6 },
  linkBtnText: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.80)" },
  journalLabel: { fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 4, color: "rgba(255,255,255,0.80)" },
  journalInput: { borderWidth: 1, borderColor: "#142030", borderRadius: 10, padding: 12, fontSize: 15, minHeight: 56, textAlignVertical: "top", color: "#fff", backgroundColor: "#060f20" },
  saveJournalBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#f5a623" },
  saveJournalBtnText: { fontSize: 16, fontWeight: "700", color: "#060f20" },
  journalStatus: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 },
  pinBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#142030",
  },
  pinText: { fontSize: 11, color: "rgba(255,255,255,0.45)" },
  pinTextActive: { color: "#f5a623", fontWeight: "700" },

  chatThread: { maxHeight: 180, marginBottom: 8 },
  chatBubble: { maxWidth: "85%", padding: 10, borderRadius: 12, marginBottom: 6 },
  chatBubbleUser: { alignSelf: "flex-end", backgroundColor: "#f5a623" },
  chatBubbleAssistant: { alignSelf: "flex-start", backgroundColor: "#142030" },
  chatBubbleText: { fontSize: 14, color: "rgba(255,255,255,0.90)" },
  chatInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  chatInput: { flex: 1, borderWidth: 1, borderColor: "#142030", borderRadius: 10, padding: 10, fontSize: 15, textAlignVertical: "top", color: "#fff", backgroundColor: "#060f20" },
  chatInputMultiline: { flex: 1, borderWidth: 1, borderColor: "#142030", borderRadius: 10, padding: 10, fontSize: 15, minHeight: 56, maxHeight: 200, textAlignVertical: "top", color: "#fff", backgroundColor: "#060f20" },
  sendBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "#f5a623", borderRadius: 10 },
  sendBtnText: { fontSize: 15, fontWeight: "700", color: "#060f20" },

  finishBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#f5a623" },
  finishBtnText: { fontSize: 16, fontWeight: "800", color: "#060f20" },

  deepDiveContainer: { marginTop: 16, borderWidth: 1, borderColor: "#142030", borderRadius: 12, overflow: "hidden" },
  deepDiveHeader: { padding: 14, backgroundColor: "#091828" },
  deepDiveHeaderText: { fontSize: 15, fontWeight: "700", color: "rgba(255,255,255,0.90)" },
  deepDiveBody: { padding: 14, paddingTop: 0 },
  talkCard: { marginTop: 12, padding: 12, backgroundColor: "#091828", borderRadius: 10 },
});
