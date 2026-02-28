import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { Habit, HabitLog, HabitSchedule } from "@/src/core/types";
import { todayKey } from "@/src/core/dates";
import {
  listHabits,
  addHabit,
  toggleHabitCompleteToday,
  getTodayHabitLog,
  getTodayProgress,
  getWeeklyProgress,
  getAllLogs,
} from "@/src/habits/habitService";

export default function TodayScreen() {
  const router = useRouter();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [log, setLog] = useState<HabitLog | null>(null);
  const [allLogs, setAllLogs] = useState<HabitLog[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [scheduleType, setScheduleType] = useState<"daily" | "weekly">("daily");
  const [targetPerWeek, setTargetPerWeek] = useState("3");

  const load = useCallback(async () => {
    const [h, l, logs] = await Promise.all([
      listHabits(),
      getTodayHabitLog(),
      getAllLogs(),
    ]);
    setHabits(h);
    setLog(l);
    setAllLogs(logs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const progress = log ? getTodayProgress(habits, log) : { done: 0, total: 0, percent: 0 };
  const weekly = getWeeklyProgress(habits, allLogs);

  async function toggle(habitId: string) {
    const updated = await toggleHabitCompleteToday(habitId);
    setLog(updated);
    const logs = await getAllLogs();
    setAllLogs(logs);
  }

  async function handleAddHabit() {
    const name = newName.trim();
    if (!name) return;
    const schedule: HabitSchedule =
      scheduleType === "daily"
        ? { type: "daily" }
        : { type: "weekly", targetPerWeek: Math.max(1, parseInt(targetPerWeek, 10) || 3) };
    await addHabit(name, schedule);
    setNewName("");
    setScheduleType("daily");
    setTargetPerWeek("3");
    setModalVisible(false);
    load();
  }

  const dailyHabits = habits.filter((h) => h.schedule.type === "daily");
  const weeklyHabits = habits.filter((h) => h.schedule.type === "weekly");

  function getWeeklyCountForHabit(habitId: string): number {
    const key = todayKey();
    return allLogs.filter((l) => {
      const a = new Date(l.date);
      const b = new Date(key);
      const startA = new Date(a);
      startA.setDate(a.getDate() - a.getDay());
      const startB = new Date(b);
      startB.setDate(b.getDate() - b.getDay());
      return startA.getTime() === startB.getTime() && l.completedHabitIds.includes(habitId);
    }).length;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today</Text>

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {progress.done}/{progress.total} done
          {progress.total > 0 ? ` • ${progress.percent}%` : ""}
        </Text>
      </View>

      {weekly.targetThisWeek > 0 && (
        <Text style={styles.weeklyText}>
          Weekly: {weekly.doneThisWeek}/{weekly.targetThisWeek}
        </Text>
      )}

      <FlatList
        data={[...dailyHabits, ...weeklyHabits]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isDaily = item.schedule.type === "daily";
          const isDone = log?.completedHabitIds.includes(item.id) ?? false;
          const weeklyCount = !isDaily && item.schedule.type === "weekly"
            ? getWeeklyCountForHabit(item.id)
            : 0;
          const weeklyTarget = !isDaily && item.schedule.type === "weekly"
            ? item.schedule.targetPerWeek
            : 0;
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              style={[styles.card, isDone && styles.cardDone]}
            >
              <View style={[styles.checkbox, isDone && styles.checkboxDone]}>
                {isDone ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <View style={styles.habitLabelRow}>
                <Text style={[styles.itemText, isDone && styles.itemTextDone]}>
                  {item.name}
                </Text>
                {!isDaily && weeklyTarget > 0 ? (
                  <Text style={styles.weeklyBadge}>
                    {weeklyCount}/{weeklyTarget} this week
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable onPress={() => setModalVisible(true)} style={styles.addBtn}>
        <Text style={styles.addBtnText}>Add habit</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/study")}
        style={styles.studyBtn}
      >
        <Text style={styles.studyBtnText}>Start Study Session</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>New habit</Text>
            <TextInput
              style={styles.input}
              placeholder="Habit name"
              value={newName}
              onChangeText={setNewName}
              autoCapitalize="words"
            />
            <View style={styles.scheduleRow}>
              <Pressable
                onPress={() => setScheduleType("daily")}
                style={[styles.scheduleBtn, scheduleType === "daily" && styles.scheduleBtnActive]}
              >
                <Text style={scheduleType === "daily" ? styles.scheduleBtnTextActive : undefined}>
                  Daily
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setScheduleType("weekly")}
                style={[styles.scheduleBtn, scheduleType === "weekly" && styles.scheduleBtnActive]}
              >
                <Text style={scheduleType === "weekly" ? styles.scheduleBtnTextActive : undefined}>
                  Weekly
                </Text>
              </Pressable>
            </View>
            {scheduleType === "weekly" && (
              <TextInput
                style={styles.input}
                placeholder="Target per week (e.g. 3)"
                value={targetPerWeek}
                onChangeText={setTargetPerWeek}
                keyboardType="number-pad"
              />
            )}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleAddHabit} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save</Text>
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
  title: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  progressRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  progressText: { fontSize: 16, fontWeight: "600" },
  weeklyText: { fontSize: 14, color: "#666", marginBottom: 12 },
  listContent: { paddingBottom: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 10,
  },
  cardDone: { borderColor: "#cfc" },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#bbb",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { borderColor: "#2b8a3e" },
  check: { fontSize: 16, fontWeight: "900" },
  itemText: { fontSize: 16, fontWeight: "600" },
  itemTextDone: { textDecorationLine: "line-through", opacity: 0.6 },
  habitLabelRow: { flex: 1 },
  weeklyBadge: { fontSize: 12, color: "#666", marginTop: 2 },
  addBtn: {
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  addBtnText: { fontSize: 15, fontWeight: "600" },
  studyBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
  },
  studyBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
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
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: "#0a7ea4", borderRadius: 10 },
  saveBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
