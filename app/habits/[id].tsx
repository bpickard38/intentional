import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import type { Habit, HabitLog, HabitSchedule } from "@/src/core/types";
import { todayKey } from "@/src/core/dates";
import { getAllLogs, listHabits, updateHabit, deleteHabit } from "@/src/habits/habitService";
import { computeStreak, isCompleted } from "@/src/habits/streakUtils";

export default function HabitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const habitId = params.id as string | undefined;

  const [habit, setHabit] = useState<Habit | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editScheduleType, setEditScheduleType] = useState<"daily" | "weekly">("daily");
  const [editTargetPerWeek, setEditTargetPerWeek] = useState("3");

  const load = useCallback(async () => {
    if (!habitId) return;
    setLoading(true);
    try {
      const [habits, allLogs] = await Promise.all([listHabits(), getAllLogs()]);
      const h = habits.find((x) => x.id === habitId) ?? null;
      setHabit(h);
      setLogs(allLogs);
      if (h) {
        setEditTitle(h.title ?? h.name);
        if (h.schedule.type === "weekly") {
          setEditScheduleType("weekly");
          setEditTargetPerWeek(String(h.schedule.targetPerWeek ?? 3));
        } else {
          setEditScheduleType("daily");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [habitId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const today = todayKey();

  const streak = useMemo(() => {
    if (!habit) return { current: 0, best: 0, lastCompletedKey: undefined as string | undefined };
    return computeStreak(habit, today, logs);
  }, [habit, logs, today]);

  const last30Days = useMemo(() => {
    const days: { key: string; completed: boolean; scheduled: boolean }[] = [];
    const base = new Date(today);
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      let scheduled = false;
      if (habit) {
        if (habit.schedule.type === "daily") {
          scheduled = true;
        } else {
          const day = d.getDay();
          const daysOfWeek = habit.schedule.daysOfWeek;
          scheduled = !daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(day);
        }
      }
      const completed = habit ? isCompleted(habit, key, logs) : false;
      days.push({ key, completed, scheduled });
    }
    return days;
  }, [habit, logs, today]);

  if (!habitId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Habit not found.</Text>
      </View>
    );
  }

  if (!habit && !loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>This habit no longer exists.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{habit?.title ?? habit?.name ?? "Habit"}</Text>

      {habit && (
        <>
          <Text style={styles.subtitle}>
            {habit.schedule.type === "daily"
              ? "Daily habit"
              : `Weekly habit • target ${habit.schedule.targetPerWeek ?? 0} times`}
          </Text>

          <View style={styles.streakRow}>
            <View style={styles.streakCard}>
              <Text style={styles.streakLabel}>Current streak</Text>
              <Text style={styles.streakValue}>🔥 {streak.current}</Text>
            </View>
            <View style={styles.streakCard}>
              <Text style={styles.streakLabel}>Best streak</Text>
              <Text style={styles.streakValue}>🏆 {streak.best}</Text>
            </View>
          </View>

          {streak.lastCompletedKey && (
            <Text style={styles.lastCompletedText}>
              Last completed on{" "}
              {new Date(streak.lastCompletedKey).toLocaleDateString()}
            </Text>
          )}

          <Text style={styles.sectionTitle}>Last 30 days</Text>
          <FlatList
            data={last30Days}
            numColumns={10}
            keyExtractor={(item) => item.key}
            scrollEnabled={false}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => {
              const bg = !item.scheduled
                ? "#f1f3f5"
                : item.completed
                ? "#2b8a3e"
                : "#fff";
              const border = !item.scheduled
                ? "#dde2e6"
                : item.completed
                ? "#2b8a3e"
                : "#ced4da";
              return (
                <View style={[styles.dayCell, { backgroundColor: bg, borderColor: border }]}>
                  {/* Empty square, color indicates state */}
                </View>
              );
            }}
          />

          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#2b8a3e" }]} />
            <Text style={styles.legendLabel}>Completed</Text>
            <View style={[styles.legendDot, { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ced4da" }]} />
            <Text style={styles.legendLabel}>Scheduled, not completed</Text>
            <View style={[styles.legendDot, { backgroundColor: "#f1f3f5" }]} />
            <Text style={styles.legendLabel}>Not scheduled</Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => setEditVisible(true)}
            >
              <Text style={styles.secondaryBtnText}>Edit habit</Text>
            </Pressable>
            <Pressable
              style={styles.destructiveBtn}
              onPress={() => setDeleteVisible(true)}
            >
              <Text style={styles.destructiveBtnText}>Delete habit</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Edit modal */}
      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit habit</Text>
            <TextInput
              style={styles.input}
              placeholder="Habit title"
              value={editTitle}
              onChangeText={setEditTitle}
            />
            <View style={styles.scheduleRow}>
              <Pressable
                onPress={() => setEditScheduleType("daily")}
                style={[
                  styles.scheduleBtn,
                  editScheduleType === "daily" && styles.scheduleBtnActive,
                ]}
              >
                <Text
                  style={
                    editScheduleType === "daily"
                      ? styles.scheduleBtnTextActive
                      : undefined
                  }
                >
                  Daily
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setEditScheduleType("weekly")}
                style={[
                  styles.scheduleBtn,
                  editScheduleType === "weekly" && styles.scheduleBtnActive,
                ]}
              >
                <Text
                  style={
                    editScheduleType === "weekly"
                      ? styles.scheduleBtnTextActive
                      : undefined
                  }
                >
                  Weekly
                </Text>
              </Pressable>
            </View>
            {editScheduleType === "weekly" && (
              <TextInput
                style={styles.input}
                placeholder="Target per week (e.g. 3)"
                value={editTargetPerWeek}
                onChangeText={setEditTargetPerWeek}
                keyboardType="number-pad"
              />
            )}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEditVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!habit) return;
                  const trimmed = editTitle.trim();
                  if (!trimmed) return;
                  const schedule: HabitSchedule =
                    editScheduleType === "daily"
                      ? { type: "daily" }
                      : {
                          type: "weekly",
                          targetPerWeek:
                            Math.max(
                              1,
                              parseInt(editTargetPerWeek || "3", 10) || 3
                            ),
                        };
                  const updated: Habit = {
                    ...habit,
                    title: trimmed,
                    name: habit.name || trimmed,
                    schedule,
                  };
                  await updateHabit(updated);
                  setEditVisible(false);
                  await load();
                }}
                style={styles.saveBtn}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete modal */}
      <Modal
        visible={deleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDeleteVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Delete habit?</Text>
            <Text style={styles.deleteWarningText}>
              This will remove its streak history for all days.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setDeleteVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!habit) return;
                  await deleteHabit(habit.id);
                  setDeleteVisible(false);
                  router.back();
                }}
                style={styles.deleteConfirmBtn}
              >
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#555", marginBottom: 12 },
  errorText: { fontSize: 16, color: "#b02a37" },
  streakRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  streakCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#f8f9fa",
  },
  streakLabel: { fontSize: 12, color: "#555", marginBottom: 4 },
  streakValue: { fontSize: 18, fontWeight: "700" },
  lastCompletedText: { fontSize: 13, color: "#555", marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  gridRow: {
    justifyContent: "flex-start",
    gap: 4,
    marginBottom: 4,
  },
  dayCell: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 24,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  legendLabel: { fontSize: 12, color: "#555" },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600" },
  destructiveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#b02a37",
    alignItems: "center",
  },
  destructiveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  scheduleRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  scheduleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  scheduleBtnActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  scheduleBtnTextActive: { fontWeight: "700", color: "#0a7ea4" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 16, fontWeight: "600" },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
  },
  saveBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  deleteWarningText: { fontSize: 14, color: "#444", marginBottom: 16 },
  deleteConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#b02a37",
    borderRadius: 10,
  },
  deleteConfirmText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

