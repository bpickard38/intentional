import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { FaithTradition, UserProfile, StudyDisplayMode, StudyDepth } from "@/src/core/types";
import { getJson, setJson, removeKey } from "@/src/core/storage";
import { Palette } from "@/constants/theme";

const PROFILE_KEY       = "profile:v1";
const STUDY_SESSIONS_KEY = "studySessions:v1";

const TRADITIONS: FaithTradition[] = [
  "Christian", "Catholic", "Protestant", "LDS", "Other", "PreferNotToSay",
];

const STUDY_DISPLAY_MODES: { value: StudyDisplayMode; label: string }[] = [
  { value: "KEY_VERSES",    label: "Key Verses" },
  { value: "FULL_CHAPTER",  label: "Full Chapter" },
  { value: "BOTH",          label: "Both" },
];

const STUDY_DEPTH_OPTIONS: { value: StudyDepth; label: string }[] = [
  { value: "QUICK",     label: "Quick" },
  { value: "GUIDED",    label: "Guided" },
  { value: "DEEP_DIVE", label: "Deep Dive" },
];

export default function SettingsScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const load = useCallback(async () => {
    const p = await getJson<UserProfile>(PROFILE_KEY);
    setProfile(p ?? {
      id: "default",
      faithTradition: "Christian",
      studyDisplayMode: "BOTH",
      studyDepth: "GUIDED",
      createdAt: new Date().toISOString(),
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(next: UserProfile) {
    await setJson(PROFILE_KEY, next);
    setProfile(next);
  }

  async function handleResetStudyData() {
    Alert.alert(
      "Reset Study Data",
      "This will delete all study sessions. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset", style: "destructive",
          onPress: async () => { await removeKey(STUDY_SESSIONS_KEY); },
        },
      ]
    );
  }

  if (!profile) return null;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.title}>Settings</Text>

      <Text style={s.label}>Faith Tradition</Text>
      <View style={s.options}>
        {TRADITIONS.map(t => (
          <Pressable
            key={t}
            onPress={() => update({ ...profile, faithTradition: t })}
            style={[s.optionBtn, profile.faithTradition === t && s.optionBtnActive]}
          >
            <Text style={[s.optionText, profile.faithTradition === t && s.optionTextActive]}>
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>Study Mode</Text>
      <View style={s.options}>
        {STUDY_DISPLAY_MODES.map(({ value, label }) => (
          <Pressable
            key={value}
            onPress={() => update({ ...profile, studyDisplayMode: value })}
            style={[s.optionBtn, (profile.studyDisplayMode ?? "BOTH") === value && s.optionBtnActive]}
          >
            <Text style={[s.optionText, (profile.studyDisplayMode ?? "BOTH") === value && s.optionTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>Study Depth</Text>
      <View style={s.options}>
        {STUDY_DEPTH_OPTIONS.map(({ value, label }) => (
          <Pressable
            key={value}
            onPress={() => update({ ...profile, studyDepth: value })}
            style={[s.optionBtn, (profile.studyDepth ?? "GUIDED") === value && s.optionBtnActive]}
          >
            <Text style={[s.optionText, (profile.studyDepth ?? "GUIDED") === value && s.optionTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={s.debugRow}>
        <Text style={s.debugLabel}>API</Text>
        <Text style={s.debugValue} numberOfLines={1}>
          {process.env.EXPO_PUBLIC_API_URL?.trim() || "(not set)"}
        </Text>
      </View>

      <Pressable onPress={handleResetStudyData} style={s.resetBtn}>
        <Text style={s.resetBtnText}>Reset Study Data</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Palette.navy800 },
  container: { padding: 20, paddingTop: 54, paddingBottom: 48 },
  title: {
    fontSize: 28, fontWeight: "800",
    color: Palette.white95, marginBottom: 28,
  },
  label: {
    fontSize: 12, fontWeight: "700",
    color: Palette.white40, letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 10, marginTop: 20,
  },
  options: { gap: 8 },
  optionBtn: {
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1,
    borderColor: Palette.navy500,
    backgroundColor: Palette.navy700,
  },
  optionBtnActive: {
    borderColor: Palette.amber500,
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  optionText: { fontSize: 16, color: Palette.white80 },
  optionTextActive: { fontWeight: "700", color: Palette.amber500 },
  debugRow: {
    marginTop: 28, padding: 14,
    backgroundColor: Palette.navy700,
    borderRadius: 12, borderWidth: 1, borderColor: Palette.navy500,
  },
  debugLabel: {
    fontSize: 11, fontWeight: "700",
    color: Palette.white40, letterSpacing: 1, marginBottom: 4,
  },
  debugValue: { fontSize: 13, color: Palette.white60 },
  resetBtn: {
    marginTop: 14, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: Palette.error, alignItems: "center",
  },
  resetBtnText: { fontSize: 16, fontWeight: "600", color: Palette.error },
});
