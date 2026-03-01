import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { FaithTradition, UserProfile } from "@/src/core/types";
import { getJson, setJson, removeKey } from "@/src/core/storage";

const PROFILE_KEY = "profile:v1";
const STUDY_SESSIONS_KEY = "studySessions:v1";

const TRADITIONS: FaithTradition[] = [
  "Christian",
  "Catholic",
  "Protestant",
  "LDS",
  "Other",
  "PreferNotToSay",
];

export default function SettingsScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const load = useCallback(async () => {
    const p = await getJson<UserProfile>(PROFILE_KEY);
    setProfile(
      p ?? {
        id: "default",
        faithTradition: "Christian",
        createdAt: new Date().toISOString(),
      }
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setFaith(t: FaithTradition) {
    const next: UserProfile = {
      id: profile?.id ?? "default",
      faithTradition: t,
      createdAt: profile?.createdAt ?? new Date().toISOString(),
    };
    await setJson(PROFILE_KEY, next);
    setProfile(next);
  }

  async function handleResetStudyData() {
    Alert.alert(
      "Reset Study Data",
      "This will delete all study sessions. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: async () => {
          await removeKey(STUDY_SESSIONS_KEY);
        } },
      ]
    );
  }

  if (!profile) return null;

  return (
    <ScrollView style={styles.containerScroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.label}>Faith tradition</Text>
      <View style={styles.options}>
        {TRADITIONS.map((t) => (
          <Pressable
            key={t}
            onPress={() => setFaith(t)}
            style={[styles.optionBtn, profile.faithTradition === t && styles.optionBtnActive]}
          >
            <Text style={[styles.optionText, profile.faithTradition === t && styles.optionTextActive]}>
              {t}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.debugRow}>
        <Text style={styles.debugLabel}>API</Text>
        <Text style={styles.debugValue} numberOfLines={1}>
          {process.env.EXPO_PUBLIC_API_URL?.trim() || "(not set)"}
        </Text>
      </View>
      <Pressable onPress={handleResetStudyData} style={styles.resetBtn}>
        <Text style={styles.resetBtnText}>Reset study data</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  containerScroll: { flex: 1 },
  container: { padding: 20, paddingTop: 48, paddingBottom: 40, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 24 },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  options: { gap: 10 },
  optionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  optionBtnActive: { borderColor: "#0a7ea4", backgroundColor: "#e8f4f8" },
  optionText: { fontSize: 16 },
  optionTextActive: { fontWeight: "700", color: "#0a7ea4" },
  debugRow: { marginTop: 24, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 8 },
  debugLabel: { fontSize: 12, fontWeight: "600", color: "#666", marginBottom: 4 },
  debugValue: { fontSize: 13, color: "#333" },
  resetBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#dc3545", alignItems: "center" },
  resetBtnText: { fontSize: 16, fontWeight: "600", color: "#dc3545" },
});
