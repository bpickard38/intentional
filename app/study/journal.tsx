import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { StudyJournalEntry } from "@/src/core/types";
import { listJournals } from "@/src/study/journalStorage";

export default function MyJournalScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<StudyJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      setLoading(true);
      (async () => {
        try {
          const data = await listJournals();
          if (isMounted) setEntries(data);
        } finally {
          if (isMounted) setLoading(false);
        }
      })();
      return () => { isMounted = false; };
    }, [])
  );

  const handleOpen = (reference: string) => {
    router.push({ pathname: "/(tabs)/study", params: { journalRef: reference } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Journal</Text>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            When you write in the Journal section of a chapter, it will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.reference + item.updatedAt}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleOpen(item.reference)}
              style={styles.item}
            >
              <Text style={styles.reference}>{item.reference}</Text>
              <Text numberOfLines={2} style={styles.preview}>
                {item.text || "(No text yet)"}
              </Text>
              <Text style={styles.timestamp}>
                Last saved {new Date(item.updatedAt).toLocaleString()}
              </Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 16 },
  emptyText: { fontSize: 14, color: "#666", textAlign: "center" },
  item: {
    paddingVertical: 10,
  },
  reference: { fontSize: 16, fontWeight: "600", color: "#0a7ea4", marginBottom: 4 },
  preview: { fontSize: 14, color: "#333", marginBottom: 4 },
  timestamp: { fontSize: 12, color: "#666" },
  separator: { height: 1, backgroundColor: "#eee" },
});

