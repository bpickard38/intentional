import React, { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

type ThemeDetailParams = {
  data?: string;
};

type ThemePayload = {
  reference: string;
  theme: { id: string; title: string; summary?: string };
  crossReferences?: { label?: string; refs: string[] }[];
  relatedChapters?: string[];
};

function parsePayload(raw: string | undefined): ThemePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ThemePayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildScriptureSearchUrl(reference: string): string {
  const q = encodeURIComponent(reference);
  return `https://www.churchofjesuschrist.org/study/scriptures/search?query=${q}`;
}

export default function ThemeDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ThemeDetailParams>();
  const payload = useMemo(() => parsePayload(params.data), [params.data]);

  if (!payload) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Theme</Text>
        <Text style={styles.errorText}>Theme details were not found.</Text>
      </View>
    );
  }

  const { reference, theme, crossReferences = [], relatedChapters = [] } = payload;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>

      <Text style={styles.kicker}>{reference}</Text>
      <Text style={styles.title}>{theme.title}</Text>
      {theme.summary ? <Text style={styles.summary}>{theme.summary}</Text> : null}

      {crossReferences.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cross references</Text>
          {crossReferences.map((group, idx) => (
            <View key={idx} style={styles.group}>
              {group.label ? (
                <Text style={styles.groupLabel}>{group.label}</Text>
              ) : null}
              {group.refs.map((ref) => (
                <Text key={ref} style={styles.bullet}>
                  • {ref}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {relatedChapters.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Related chapters</Text>
          {relatedChapters.map((ref) => (
            <View key={ref} style={styles.relatedRow}>
              <Text style={styles.relatedRef}>{ref}</Text>
              <Pressable
                onPress={() => Linking.openURL(buildScriptureSearchUrl(ref))}
                style={styles.openBtn}
              >
                <Text style={styles.openBtnText}>Open</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  backBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
  },
  backBtnText: { fontSize: 13, color: "#555" },
  kicker: { fontSize: 13, color: "#0a7ea4", textTransform: "uppercase", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 8 },
  summary: { fontSize: 14, color: "#333", marginBottom: 16 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  group: { marginBottom: 8 },
  groupLabel: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  bullet: { fontSize: 14, color: "#333" },
  relatedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  relatedRef: { fontSize: 14, color: "#0a7ea4", fontWeight: "600" },
  openBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e8f4f8",
  },
  openBtnText: { fontSize: 13, fontWeight: "600", color: "#0a7ea4" },
  errorText: { fontSize: 14, color: "#c00" },
});

