import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FaithTradition, UserProfile } from "@/src/core/types";
import { getJson, setJson } from "@/src/core/storage";

const PROFILE_KEY = "profile:v1";

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

  if (!profile) return null;

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: "#fff" },
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
});
