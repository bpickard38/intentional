import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { StudyPlanSources } from "@/src/core/types";
import { generateStudyPlanDoc } from "@/src/ai/apiClient";
import { savePlan } from "@/src/study/planStorage";

const TOPIC_CHIPS = [
  "Faith",
  "Prayer",
  "Atonement",
  "Charity",
  "Repentance",
  "Temples",
  "Forgiveness",
  "Trusting God in hard times",
];

const LENGTH_OPTIONS = [3, 7, 14, 30];
const MINUTES_OPTIONS = [5, 10, 15, 20];

const DEFAULT_SOURCES: StudyPlanSources = {
  bible: true,
  bom: true,
  dc: true,
  pgp: true,
};

export default function CreatePlanScreen() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [length, setLength] = useState(7);
  const [minutesPerDay, setMinutesPerDay] = useState(10);
  const [sources, setSources] = useState<StudyPlanSources>({ ...DEFAULT_SOURCES });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const effectiveTopic = (topic || customTopic.trim()).trim() || "Faith";

  const handleGenerate = useCallback(async () => {
    if (loading) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const { plan } = await generateStudyPlanDoc(
        {
          topic: effectiveTopic,
          length,
          minutesPerDay,
          sources,
        },
        { signal: controller.signal }
      );
      if (abortRef.current !== controller) return;
      await savePlan(plan);
      router.replace(`/study/plans/${plan.id}` as never);
    } catch (err) {
      if (abortRef.current !== controller) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort")) return;
      setError(msg.includes("Network") || msg.includes("Failed") ? "Couldn’t reach the server. Check your connection." : msg);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [effectiveTopic, length, minutesPerDay, sources, loading, router]);

  useEffect(
    () => () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    },
    []
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Create Study Plan</Text>

      <Text style={styles.label}>Topic</Text>
      <View style={styles.chipRow}>
        {TOPIC_CHIPS.map((t) => (
          <Pressable
            key={t}
            onPress={() => { setTopic(t); setCustomTopic(""); }}
            style={[styles.chip, topic === t && styles.chipActive]}
          >
            <Text style={[styles.chipText, topic === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Or type custom topic"
        value={customTopic}
        onChangeText={(text) => { setCustomTopic(text); if (text.trim()) setTopic(""); }}
      />

      <Text style={styles.label}>Plan length (days)</Text>
      <View style={styles.optionsRow}>
        {LENGTH_OPTIONS.map((n) => (
          <Pressable
            key={n}
            onPress={() => setLength(n)}
            style={[styles.optionBtn, length === n && styles.optionBtnActive]}
          >
            <Text style={[styles.optionBtnText, length === n && styles.optionBtnTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Daily time (minutes)</Text>
      <View style={styles.optionsRow}>
        {MINUTES_OPTIONS.map((m) => (
          <Pressable
            key={m}
            onPress={() => setMinutesPerDay(m)}
            style={[styles.optionBtn, minutesPerDay === m && styles.optionBtnActive]}
          >
            <Text style={[styles.optionBtnText, minutesPerDay === m && styles.optionBtnTextActive]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Include sources</Text>
      <View style={styles.toggleRow}>
        {(["bible", "bom", "dc", "pgp"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setSources((s) => ({ ...s, [key]: !s[key] }))}
            style={[styles.toggle, sources[key] && styles.toggleActive]}
          >
            <Text style={[styles.toggleText, sources[key] && styles.toggleTextActive]}>
              {key === "bible" ? "Bible" : key === "bom" ? "BOM" : key === "dc" ? "D&C" : "PGP"}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        onPress={handleGenerate}
        disabled={loading}
        style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Generate Plan</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  backBtn: { alignSelf: "flex-start", marginBottom: 12 },
  backBtnText: { fontSize: 16, color: "#0a7ea4", fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 20 },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  chipActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  chipText: { fontSize: 14 },
  chipTextActive: { fontWeight: "700", color: "#0a7ea4" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  optionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  optionBtnActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  optionBtnText: { fontSize: 15, fontWeight: "600" },
  optionBtnTextActive: { color: "#0a7ea4", fontWeight: "700" },
  toggleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  toggleActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  toggleText: { fontSize: 14 },
  toggleTextActive: { fontWeight: "700", color: "#0a7ea4" },
  errorText: { fontSize: 14, color: "#b02a37", marginBottom: 12 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
  },
  primaryBtnDisabled: { backgroundColor: "#9ac7da" },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
