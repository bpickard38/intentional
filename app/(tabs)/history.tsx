import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { StudySession } from "@/src/core/types";
import { listSessions } from "@/src/study/sessionService";

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await listSessions();
    setSessions(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selected = detailId ? sessions.find((s) => s.id === detailId) : null;

  function openDetail(id: string) {
    setDetailId((prev) => (prev === id ? null : id));
  }

  function handleResume(sessionId: string) {
    setDetailId(null);
    router.push({ pathname: "/study", params: { sessionId } });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>History</Text>
      {sessions.length === 0 ? (
        <Text style={styles.empty}>No study sessions yet.</Text>
      ) : (
        <>
          {sessions.map((s) => {
            const isDetail = detailId === s.id;
            return (
              <View key={s.id} style={styles.row}>
                <Pressable onPress={() => openDetail(s.id)} style={styles.rowHeader}>
                  <View>
                    <Text style={styles.rowDate}>{s.date}</Text>
                    <Text style={styles.rowMeta}>
                      {s.durationMin} min • {s.plan?.topic ?? s.topic}
                    </Text>
                    <View style={styles.badges}>
                      <View style={[styles.badge, styles.badgeMode]}>
                        <Text style={styles.badgeText}>{s.plan?.mode === "deep" ? "Deep" : s.plan?.mode === "challenge" ? "Challenge" : "Devotional"}</Text>
                      </View>
                      <View style={[styles.badge, s.status === "completed" ? styles.badgeDone : styles.badgeProgress]}>
                        <Text style={styles.badgeText}>{s.status === "in_progress" ? "In progress" : s.status === "draft" ? "Draft" : "Done"}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.chevron}>{isDetail ? "▼" : "▶"}</Text>
                </Pressable>
                {s.status === "in_progress" && (
                  <Pressable onPress={() => handleResume(s.id)} style={styles.resumeBtn}>
                    <Text style={styles.resumeBtnText}>Resume</Text>
                  </Pressable>
                )}
                {isDetail && selected ? (
                  <View style={styles.expanded}>
                    <Text style={styles.expTitle}>Plan steps</Text>
                    {(selected.plan?.planSteps ?? []).map((step, i) => (
                      <Text key={i} style={styles.expItem}>• {step.label} ({step.minutes} min): {step.instruction}</Text>
                    ))}
                    <Text style={styles.expTitle}>Scriptures</Text>
                    {(selected.plan?.scriptures ?? []).map((sc, i) => (
                      <View key={i} style={styles.expBlock}>
                        <Text style={styles.expItem}>{sc.title}</Text>
                        <Text style={styles.expRef}>{sc.ref}</Text>
                        {sc.passage ? <Text style={styles.expSub}>{sc.passage}</Text> : null}
                        {sc.background ? <Text style={styles.expSub}>Background: {sc.background}</Text> : null}
                        {(sc.observationQuestions ?? []).length > 0 && sc.observationQuestions.map((q, j) => <Text key={j} style={styles.expSub}>• {q}</Text>)}
                        {(sc.interpretation ?? []).length > 0 && sc.interpretation.map((x, j) => <Text key={j} style={styles.expSub}>{x}</Text>)}
                        <Pressable onPress={() => sc.url && Linking.openURL(sc.url)}><Text style={styles.link}>Open</Text></Pressable>
                      </View>
                    ))}
                    <Text style={styles.expTitle}>Talks</Text>
                    {(selected.plan?.talks ?? []).map((t, i) => (
                      <Text key={i} style={styles.expItem}>{t.title}: {t.summary}</Text>
                    ))}
                    <Text style={styles.expTitle}>Reflection</Text>
                    {(selected.plan?.reflectionPrompts ?? []).map((p, i) => (
                      <Text key={i} style={styles.expItem}>• {p}</Text>
                    ))}
                    <Text style={styles.expTitle}>Action</Text>
                    <Text style={styles.expItem}>{selected.plan?.actionStep ?? ""}</Text>
                    {selected.journal ? (
                      <>
                        <Text style={styles.expTitle}>Journal</Text>
                        {selected.journal.learned ? <Text style={styles.expItem}>Learned: {selected.journal.learned}</Text> : null}
                        {selected.journal.felt ? <Text style={styles.expItem}>Felt: {selected.journal.felt}</Text> : null}
                        {selected.journal.action ? <Text style={styles.expItem}>Action: {selected.journal.action}</Text> : null}
                      </>
                    ) : null}
                    {selected.chat && selected.chat.length > 0 ? (
                      <>
                        <Text style={styles.expTitle}>Chat transcript</Text>
                        {selected.chat.map((m) => (
                          <View key={m.id} style={m.role === "user" ? styles.chatUser : styles.chatAssistant}>
                            <Text style={styles.chatRole}>{m.role === "user" ? "You" : "Mentor"}</Text>
                            <Text style={styles.chatText}>{m.text}</Text>
                          </View>
                        ))}
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
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
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  rowDate: { fontSize: 16, fontWeight: "700" },
  rowMeta: { fontSize: 14, color: "#666", marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeMode: { backgroundColor: "#e8f4f8" },
  badgeDone: { backgroundColor: "#d4edda" },
  badgeProgress: { backgroundColor: "#fff3cd" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  chevron: { fontSize: 12, color: "#666" },
  resumeBtn: { marginHorizontal: 14, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#0a7ea4", borderRadius: 8, alignSelf: "flex-start" },
  resumeBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  expanded: { padding: 14, paddingTop: 0, borderTopWidth: 1, borderTopColor: "#eee" },
  expTitle: { fontSize: 14, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  expItem: { fontSize: 14, color: "#444", marginBottom: 4 },
  expSub: { fontSize: 13, color: "#666", marginBottom: 2, marginLeft: 8 },
  expBlock: { marginBottom: 8 },
  expRef: { fontSize: 14, fontWeight: "600", color: "#0a7ea4", marginBottom: 2 },
  link: { fontSize: 14, color: "#0a7ea4", marginTop: 4 },
  chatUser: { marginBottom: 8, alignSelf: "flex-end", maxWidth: "85%", backgroundColor: "#e8f4f8", padding: 8, borderRadius: 8 },
  chatAssistant: { marginBottom: 8, alignSelf: "flex-start", maxWidth: "85%", backgroundColor: "#eee", padding: 8, borderRadius: 8 },
  chatRole: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  chatText: { fontSize: 14 },
});
