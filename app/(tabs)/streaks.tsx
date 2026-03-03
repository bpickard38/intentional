import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import type { Habit, HabitLog } from "@/src/core/types";
import { todayKey } from "@/src/core/dates";
import { listHabits, getAllLogs } from "@/src/habits/habitService";
import {
  computeAllStreaks,
  type HabitStreak,
} from "@/src/habits/streakUtils";

type Filter = "all" | "active" | "zero";

export default function StreaksScreen() {
  const router = useRouter();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, l] = await Promise.all([listHabits(), getAllLogs()]);
      setHabits(h);
      setLogs(l);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const activeHabits = habits.filter((h) => !h.archived);
  const key = todayKey();
  const streaks: HabitStreak[] = computeAllStreaks(activeHabits, logs, key);

  const filteredStreaks = streaks.filter((s) => {
    if (filter === "active") return s.current > 0;
    if (filter === "zero") return s.current === 0;
    return true;
  });

  const totalHabits = activeHabits.length;
  const inStreak = streaks.filter((s) => s.current > 0).length;
  const longest = streaks[0];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Streaks</Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total habits</Text>
          <Text style={styles.summaryValue}>{totalHabits}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>In a streak</Text>
          <Text style={styles.summaryValue}>{inStreak}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Longest current</Text>
          <Text style={styles.summaryValue}>
            {longest && longest.current > 0
              ? `${longest.current} • ${longest.habit.title ?? longest.habit.name}`
              : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label="All"
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <FilterChip
          label="Active streaks"
          active={filter === "active"}
          onPress={() => setFilter("active")}
        />
        <FilterChip
          label="Zero streaks"
          active={filter === "zero"}
          onPress={() => setFilter("zero")}
        />
      </View>

      {loading ? (
        <Text style={styles.helperText}>Loading streaks…</Text>
      ) : filteredStreaks.length === 0 ? (
        <Text style={styles.helperText}>
          {totalHabits === 0
            ? "No habits yet. Create one on the Today tab to start a streak."
            : "No habits match this filter yet. Keep going—you’ll build streaks over time."}
        </Text>
      ) : (
        <FlatList
          data={filteredStreaks}
          keyExtractor={(item) => item.habit.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push({ pathname: "/habits/[id]", params: { id: item.habit.id } })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {item.habit.title ?? item.habit.name}
                </Text>
                {item.current > 0 && <Text style={styles.streakDot}>🔥</Text>}
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardMetric}>🔥 {item.current}</Text>
                <Text style={styles.cardMetric}>🏆 {item.best}</Text>
                {item.lastCompletedKey && (
                  <Text style={styles.cardMetric}>
                    Last:{" "}
                    {new Date(item.lastCompletedKey).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={active ? styles.filterChipTextActive : styles.filterChipText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#f8f9fa",
  },
  summaryLabel: { fontSize: 12, color: "#555", marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: "700" },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  filterChipActive: {
    borderColor: "#0a7ea4",
    backgroundColor: "#e8f4f8",
  },
  filterChipText: { fontSize: 13, color: "#444" },
  filterChipTextActive: { fontSize: 13, fontWeight: "700", color: "#0a7ea4" },
  helperText: {
    marginTop: 16,
    fontSize: 14,
    color: "#555",
  },
  listContent: { paddingTop: 8, paddingBottom: 24 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  streakDot: { fontSize: 18 },
  cardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cardMetric: {
    fontSize: 13,
    color: "#555",
  },
});

