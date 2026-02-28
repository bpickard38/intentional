import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { StudySession } from "@/src/core/types";
import { listSessions } from "@/src/study/sessionService";

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await listSessions();
    setSessions(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>History</Text>
      {sessions.length === 0 ? (
        <Text style={styles.empty}>No study sessions yet.</Text>
      ) : (
        sessions.map((s) => {
          const isExpanded = expandedId === s.id;
          return (
            <View key={s.id} style={styles.row}>
              <Pressable
                onPress={() => toggleExpand(s.id)}
                style={styles.rowHeader}
              >
                <View>
                  <Text style={styles.rowDate}>{s.date}</Text>
                  <Text style={styles.rowMeta}>
                    {s.durationMin} min • {s.topic}
                  </Text>
                </View>
                <Text style={styles.chevron}>{isExpanded ? "▼" : "▶"}</Text>
              </Pressable>
              {isExpanded ? (
                <View style={styles.expanded}>
                  <Text style={styles.expTitle}>Scriptures</Text>
                  {s.plan.scriptures.map((sc, i) => (
                    <Text key={i} style={styles.expItem}>
                      {sc.title} — {sc.ref}: {sc.summary}
                    </Text>
                  ))}
                  <Text style={styles.expTitle}>Talks</Text>
                  {s.plan.talks.map((t, i) => (
                    <Text key={i} style={styles.expItem}>{t.title}: {t.summary}</Text>
                  ))}
                  <Text style={styles.expTitle}>Reflection</Text>
                  {s.plan.reflectionPrompts.map((p, i) => (
                    <Text key={i} style={styles.expItem}>• {p}</Text>
                  ))}
                  <Text style={styles.expTitle}>Action</Text>
                  <Text style={styles.expItem}>{s.plan.actionStep}</Text>
                  {s.journal ? (
                    <>
                      <Text style={styles.expTitle}>Journal</Text>
                      {s.journal.learned ? <Text style={styles.expItem}>Learned: {s.journal.learned}</Text> : null}
                      {s.journal.felt ? <Text style={styles.expItem}>Felt: {s.journal.felt}</Text> : null}
                      {s.journal.action ? <Text style={styles.expItem}>Action: {s.journal.action}</Text> : null}
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  empty: { fontSize: 16, color: "#666" },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, marginBottom: 10, overflow: "hidden" },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  rowDate: { fontSize: 16, fontWeight: "700" },
  rowMeta: { fontSize: 14, color: "#666", marginTop: 2 },
  chevron: { fontSize: 12, color: "#666" },
  expanded: { padding: 14, paddingTop: 0, borderTopWidth: 1, borderTopColor: "#eee" },
  expTitle: { fontSize: 14, fontWeight: "700", marginTop: 10, marginBottom: 4 },
  expItem: { fontSize: 14, color: "#444", marginBottom: 4 },
});
