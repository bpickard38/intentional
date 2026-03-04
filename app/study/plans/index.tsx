import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { StudyPlanDoc } from "@/src/core/types";
import { listPlans } from "@/src/study/planStorage";

export default function StudyPlansHomeScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<StudyPlanDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPlans();
      setPlans(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Study Plans</Text>

      <Pressable
        onPress={() => router.push("/study/plans/create" as never)}
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryBtnText}>Create Plan</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>My Plans</Text>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : plans.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            No plans yet. Tap &quot;Create Plan&quot; to generate a guided study plan by topic and length.
          </Text>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const completed = item.progress?.completedDayIds?.length ?? 0;
            const total = item.days?.length ?? 0;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <Pressable
                onPress={() => router.push(`/study/plans/${item.id}` as never)}
                style={styles.planCard}
              >
                <Text style={styles.planTitle}>{item.title}</Text>
                <Text style={styles.planMeta}>
                  {item.length} days • {item.minutesPerDay} min/day
                </Text>
                <Text style={styles.planProgress}>
                  {pct}% complete ({completed}/{total} days)
                </Text>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: "#fff" },
  backBtn: { alignSelf: "flex-start", marginBottom: 12 },
  backBtnText: { fontSize: 16, color: "#0a7ea4", fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 20 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
    marginBottom: 24,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  centered: { paddingVertical: 24, alignItems: "center" },
  emptyBox: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
  },
  emptyText: { fontSize: 14, color: "#555", textAlign: "center" },
  planCard: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  planTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  planMeta: { fontSize: 13, color: "#555", marginBottom: 2 },
  planProgress: { fontSize: 12, color: "#0a7ea4", fontWeight: "600" },
  separator: { height: 10 },
});
