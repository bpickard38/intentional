import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { StudyPlanDoc } from "@/src/core/types";
import { getPlan } from "@/src/study/planStorage";

export default function PlanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan, setPlan] = useState<StudyPlanDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const p = await getPlan(id);
      setPlan(p);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const { percent, firstIncompleteDay } = useMemo(() => {
    if (!plan?.days?.length) return { percent: 0, firstIncompleteDay: null };
    const completed = plan.progress?.completedDayIds ?? [];
    const total = plan.days.length;
    const count = plan.days.filter((d) => completed.includes(d.id)).length;
    const first = plan.days.find((d) => !completed.includes(d.id)) ?? null;
    return {
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
      firstIncompleteDay: first,
    };
  }, [plan]);

  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Plan not found.</Text>
      </View>
    );
  }

  if (loading || !plan) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{loading ? "Loading…" : "Plan not found."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>{plan.title}</Text>
      {plan.description ? (
        <Text style={styles.description}>{plan.description}</Text>
      ) : null}
      <Text style={styles.meta}>
        {plan.length} days • {plan.minutesPerDay} min/day • {percent}% complete
      </Text>

      <Pressable
        onPress={() => {
          const target = firstIncompleteDay ?? plan.days[0];
          if (target) router.push(`/study/plans/${id}/day/${target.id}` as never);
        }}
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryBtnText}>
          {firstIncompleteDay ? "Resume" : "Start"} — Day {firstIncompleteDay?.dayNumber ?? 1}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Days</Text>
      <FlatList
        data={plan.days}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const done = (plan.progress?.completedDayIds ?? []).includes(item.id);
          return (
            <Pressable
              onPress={() => router.push(`/study/plans/${id}/day/${item.id}` as never)}
              style={styles.dayRow}
            >
              <Text style={styles.dayStatus}>{done ? "✅" : "⬜"}</Text>
              <Text style={styles.dayNumber}>Day {item.dayNumber}</Text>
              <Text style={styles.dayFocus} numberOfLines={1}>{item.focus}</Text>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: "#060f20" },
  backBtn: { alignSelf: "flex-start", marginBottom: 12 },
  backBtnText: { fontSize: 16, color: "#f5a623", fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 8, color: "rgba(255,255,255,0.95)" },
  description: { fontSize: 14, color: "rgba(255,255,255,0.60)", marginBottom: 8 },
  meta: { fontSize: 13, color: "rgba(255,255,255,0.50)", marginBottom: 16 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#f5a623",
    marginBottom: 24,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#060f20" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12, color: "rgba(255,255,255,0.90)" },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#142030",
    borderRadius: 10,
    backgroundColor: "#091828",
  },
  dayStatus: { fontSize: 18, marginRight: 10 },
  dayNumber: { fontSize: 14, fontWeight: "700", width: 52, color: "rgba(255,255,255,0.90)" },
  dayFocus: { flex: 1, fontSize: 14, color: "rgba(255,255,255,0.70)" },
  separator: { height: 8 },
  errorText: { fontSize: 16, color: "#e74c3c" },
  loadingText: { fontSize: 16, color: "rgba(255,255,255,0.55)" },
});
