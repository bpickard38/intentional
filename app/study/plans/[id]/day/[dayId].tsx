import React, { useCallback, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { StudyPlanDoc, StudyPlanDay } from "@/src/core/types";
import { getPlan, toggleDayComplete } from "@/src/study/planStorage";

export default function DayDetailScreen() {
  const router = useRouter();
  const { id, dayId } = useLocalSearchParams<{ id: string; dayId: string }>();
  const [plan, setPlan] = useState<StudyPlanDoc | null>(null);
  const [day, setDay] = useState<StudyPlanDay | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const p = await getPlan(id);
      setPlan(p);
      const d = p?.days?.find((x) => x.id === dayId) ?? null;
      setDay(d);
    } finally {
      setLoading(false);
    }
  }, [id, dayId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCompleted = plan?.progress?.completedDayIds?.includes(dayId ?? "") ?? false;

  const handleToggleComplete = useCallback(async () => {
    if (!id || !dayId) return;
    await toggleDayComplete(id, dayId);
    await load();
  }, [id, dayId, load]);

  const handleStudyHelps = useCallback(() => {
    if (!day?.references?.length) return;
    router.push({
      pathname: "/(tabs)/study",
      params: { planRefs: day.references.join(",") },
    });
  }, [day, router]);

  if (!id || !dayId || loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{loading ? "Loading…" : "Day not found."}</Text>
      </View>
    );
  }

  if (!plan || !day) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Day not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>

      <Text style={styles.kicker}>Day {day.dayNumber}</Text>
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

      <Pressable onPress={handleToggleComplete} style={styles.completeBtn}>
        <Text style={styles.completeBtnText}>
          {isCompleted ? "Mark Incomplete" : "Mark Complete"}
        </Text>
      </Pressable>

      <Pressable onPress={handleStudyHelps} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>
          Generate study helps for today’s chapter(s)
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  backBtn: { alignSelf: "flex-start", marginBottom: 12 },
  backBtnText: { fontSize: 16, color: "#0a7ea4", fontWeight: "600" },
  kicker: { fontSize: 13, color: "#0a7ea4", textTransform: "uppercase", marginBottom: 4 },
  focus: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  whyNextBox: {
    padding: 12,
    backgroundColor: "#f0f4f8",
    borderRadius: 10,
    marginBottom: 16,
  },
  whyNextLabel: { fontSize: 12, fontWeight: "700", color: "#555", marginBottom: 4 },
  whyNextText: { fontSize: 14, color: "#333" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  refRow: { marginBottom: 8 },
  refText: { fontSize: 15, fontWeight: "600", color: "#0a7ea4" },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  linkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#e8f4f8",
  },
  linkBtnText: { fontSize: 14, fontWeight: "600", color: "#0a7ea4" },
  bodyText: { fontSize: 15, color: "#333", marginBottom: 8 },
  bullet: { fontSize: 15, color: "#333", marginBottom: 4 },
  completeBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#2b8a3e",
  },
  completeBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#0a7ea4",
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", color: "#0a7ea4" },
  loadingText: { fontSize: 16, color: "#555" },
  errorText: { fontSize: 16, color: "#b02a37" },
});
