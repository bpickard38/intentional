import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Line,
  Path as SvgPath,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import type { Habit, HabitLog, HabitSchedule, StudyPlanDoc, StudyPlanDay } from "@/src/core/types";
import { createPathGeometry, rcx, Z0, Z_FAR } from "@/src/path/geometry";
import {
  listHabits,
  addHabit,
  toggleHabitCompleteToday,
  getTodayHabitLog,
  getTodayProgress,
  deleteHabit,
} from "@/src/habits/habitService";
import { listPlans } from "@/src/study/planStorage";
import { Palette } from "@/constants/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ── Perspective projection ────────────────────────────────────────────────────
const SVG_W = SCREEN_W;
const SVG_H = Math.min(SCREEN_H * 0.56, 400);
const PATH  = createPathGeometry(SVG_W, SVG_H);
const { HY, CX, proj, ROAD_D } = PATH;

const DEPTH_ZS = [2, 2.8, 4, 6, 9, 14, 22];

const STARS = [
  { cx: 32,  cy: 32,  r: 1.4, o: 0.90 },
  { cx: 88,  cy: 18,  r: 1.0, o: 0.65 },
  { cx: 142, cy: 52,  r: 1.2, o: 0.80 },
  { cx: 200, cy: 20,  r: 1.5, o: 0.95 },
  { cx: 258, cy: 58,  r: 1.0, o: 0.55 },
  { cx: 314, cy: 16,  r: 1.3, o: 0.82 },
  { cx: 362, cy: 66,  r: 1.0, o: 0.68 },
  { cx: 52,  cy: 92,  r: 1.0, o: 0.50 },
  { cx: 160, cy: 86,  r: 1.2, o: 0.62 },
  { cx: 288, cy: 80,  r: 1.0, o: 0.58 },
  { cx: 338, cy: 110, r: 1.1, o: 0.46 },
  { cx: 110, cy: 120, r: 1.0, o: 0.42 },
];

type StoneData = {
  id: string; label: string; completed: boolean;
  x: number; y: number; r: number; z: number;
};

function buildStones(habits: Habit[], log: HabitLog | null): StoneData[] {
  const vis = habits.filter(h => !h.archived).slice(0, 11);
  return PATH.layoutStones(vis.length).map((pos, i) => ({
    ...pos,
    id: vis[i].id,
    label: vis[i].title ?? vis[i].name ?? "",
    completed: log?.completedHabitIds.includes(vis[i].id) ?? false,
  }));
}
// ── Date helpers ──────────────────────────────────────────────────────────────
const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getDateLabel(): string {
  const d = new Date();
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function getActivePlanDay(plan: StudyPlanDoc): StudyPlanDay | null {
  const created   = new Date(plan.createdAt);
  const now       = new Date();
  const dayOffset = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const dayNumber = dayOffset + 1;
  if (dayNumber < 1 || dayNumber > plan.length) return null;
  return plan.days.find(d => d.dayNumber === dayNumber) ?? null;
}

// ── Home screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();

  const [habits,       setHabits]       = useState<Habit[]>([]);
  const [log,          setLog]          = useState<HabitLog | null>(null);
  const [addVisible,   setAddVisible]   = useState(false);
  const [newName,      setNewName]      = useState("");
  const [schedType,    setSchedType]    = useState<"daily" | "weekly">("daily");
  const [targetPerWk,  setTargetPerWk]  = useState("3");
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [activePlan,   setActivePlan]   = useState<StudyPlanDoc | null>(null);
  const [todayDay,     setTodayDay]     = useState<StudyPlanDay | null>(null);
  const [listExpanded, setListExpanded] = useState(false);

  // Stone tap ripple animation
  const rippleScale   = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const [ripplePos, setRipplePos] = useState<{ x: number; y: number; r: number } | null>(null);

  const load = useCallback(async () => {
    const [h, l, plans] = await Promise.all([
      listHabits(),
      getTodayHabitLog(),
      listPlans(),
    ]);
    setHabits(h);
    setLog(l);
    const inProgress = plans.find(plan => {
      const done = plan.progress?.completedDayIds ?? [];
      return done.length < plan.days.length;
    });
    if (inProgress) {
      setActivePlan(inProgress);
      setTodayDay(getActivePlanDay(inProgress));
    } else {
      setActivePlan(null);
      setTodayDay(null);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeHabits = habits.filter(h => !h.archived);
  const progress     = log ? getTodayProgress(habits, log) : { done: 0, total: 0, percent: 0 };
  const prog         = progress.total > 0 ? progress.done / progress.total : 0;
  const allDone      = progress.total > 0 && progress.done === progress.total;

  const stones = buildStones(activeHabits, log);
  const sorted = [...stones].sort((a, b) => b.z - a.z);

  // Sun glow pulse
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [glow]);

  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.58] });
  const glowSc = glow.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.22] });
  const sunX = CX, sunY = HY;

  async function handleStoneTap(habitId: string) {
    // Ripple animation at stone position
    const tapped = stones.find(s => s.id === habitId);
    if (tapped) {
      setRipplePos({ x: tapped.x, y: tapped.y, r: Math.max(tapped.r, 12) });
      rippleScale.setValue(0.6);
      rippleOpacity.setValue(0.85);
      Animated.parallel([
        Animated.timing(rippleScale, { toValue: 3.2, duration: 420, useNativeDriver: true }),
        Animated.timing(rippleOpacity, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]).start(() => setRipplePos(null));
    }
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const updated = await toggleHabitCompleteToday(habitId);
    setLog(updated);
    const nowAllDone = activeHabits.length > 0 &&
      activeHabits.every(h => updated.completedHabitIds.includes(h.id));
    if (nowAllDone) {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
  }

  async function handleAddHabit() {
    const name = newName.trim();
    if (!name) return;
    const schedule: HabitSchedule =
      schedType === "daily"
        ? { type: "daily" }
        : { type: "weekly", targetPerWeek: Math.max(1, parseInt(targetPerWk, 10) || 3) };
    await addHabit(name, schedule);
    setNewName("");
    setSchedType("daily");
    setTargetPerWk("3");
    setAddVisible(false);
    load();
  }

  return (
    <View style={s.screen}>
      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.dateLabel}>{getDateLabel()}</Text>
        {progress.total > 0 && (
          <Text style={[s.progressBadge, allDone && s.progressBadgeDone]}>
            {progress.done}/{progress.total}{allDone ? " 🎉" : ""}
          </Text>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 180 }}
      >
        {/* ── Interactive Path ── */}
        <View style={{ position: "relative" }}>
          <Svg width={SVG_W} height={SVG_H}>
            <Defs>
              <LinearGradient id="hsky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0"    stopColor="#020912" />
                <Stop offset="0.75" stopColor="#091828" />
                <Stop offset="1"    stopColor="#0f2240" />
              </LinearGradient>
              <LinearGradient id="hground" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#6b4e20" />
                <Stop offset="1" stopColor="#b8882e" />
              </LinearGradient>
              <LinearGradient id="hroad" x1="0.5" y1="0" x2="0.5" y2="1">
                <Stop offset="0"   stopColor="#cfc4a4" />
                <Stop offset="0.4" stopColor="#ede3c8" />
                <Stop offset="1"   stopColor="#f8f0d8" />
              </LinearGradient>
              <RadialGradient id="hsun" cx="50%" cy="50%" r="50%">
                <Stop offset="0"    stopColor="#fff176" stopOpacity="1"    />
                <Stop offset="0.35" stopColor="#ffd740" stopOpacity="0.85" />
                <Stop offset="0.65" stopColor="#f5a020" stopOpacity="0.40" />
                <Stop offset="1"    stopColor="#c05000" stopOpacity="0"    />
              </RadialGradient>
              <RadialGradient id="hhalo" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#ffd54f" stopOpacity="0.55" />
                <Stop offset="1" stopColor="#ffd54f" stopOpacity="0"    />
              </RadialGradient>
              <RadialGradient id="hvignette" cx="50%" cy="50%" r="65%">
                <Stop offset="0" stopColor="#000" stopOpacity="0"    />
                <Stop offset="1" stopColor="#000" stopOpacity="0.52" />
              </RadialGradient>
            </Defs>

            {/* Sky */}
            <Rect x="0" y="0" width={SVG_W} height={HY + 2} fill="url(#hsky)" />

            {/* Stars */}
            {STARS.map((st, i) => (
              <Circle key={i} cx={st.cx} cy={st.cy} r={st.r} fill="white" opacity={st.o} />
            ))}

            {/* Ground */}
            <Rect x="0" y={HY} width={SVG_W} height={SVG_H - HY} fill="url(#hground)" />

            {/* Depth lines */}
            {DEPTH_ZS.map((wz, i) => {
              const y = proj(0, wz).y;
              if (y < HY || y > SVG_H) return null;
              return (
                <Line key={i} x1={0} y1={y} x2={SVG_W} y2={y}
                  stroke="#7a5818" strokeWidth={0.6} opacity={0.30} />
              );
            })}

            {/* Road */}
            <SvgPath d={ROAD_D} fill="#1a1206" opacity={0.28} />
            <SvgPath d={ROAD_D} fill="url(#hroad)" />

            {/* Road center dashes */}
            {Array.from({ length: 14 }, (_, i) => {
              const t  = (i + 0.5) / 14;
              const wz = Z0 * Math.pow(Z_FAR / Z0, t);
              const p  = proj(rcx(wz), wz);
              const sz = Math.max(1.5, 8 * (Z0 / wz));
              return p.y >= HY && p.y <= SVG_H ? (
                <Rect key={i}
                  x={p.x - sz * 0.3} y={p.y - sz}
                  width={sz * 0.6} height={sz * 2}
                  fill="#c0a870" opacity={0.4} rx={sz * 0.3}
                />
              ) : null;
            })}

            {/* Stones — far → near for correct z-order */}
            {sorted.map(stone => (
              <G key={stone.id}>
                {stone.completed && (
                  <Circle cx={stone.x} cy={stone.y} r={stone.r * 2.2} fill="url(#hhalo)" />
                )}
                {/* Shadow */}
                <Circle cx={stone.x} cy={stone.y + stone.r * 0.4} r={stone.r * 1.1}
                  fill="#000" opacity={0.22} />
                {/* Body */}
                <Circle
                  cx={stone.x} cy={stone.y} r={stone.r}
                  fill={stone.completed ? "#f5a623" : "rgba(255,255,255,0.12)"}
                  stroke={stone.completed ? "#ffd54f" : "rgba(255,255,255,0.42)"}
                  strokeWidth={stone.r > 6 ? 1.5 : 1}
                />
                {/* Check mark */}
                {stone.completed && stone.r >= 5 && (
                  <SvgText
                    x={stone.x} y={stone.y + stone.r * 0.38}
                    fontSize={stone.r * 1.1} fontWeight="900"
                    fill="white" textAnchor="middle" opacity={0.95}
                  >✓</SvgText>
                )}
                {/* Habit name label — only on larger near stones, on a dark pill so it
                    stays legible over the light road. Width is estimated from length. */}
                {stone.r >= 8 && (() => {
                  const text  = stone.label.length > 13 ? stone.label.slice(0, 12) + "…" : stone.label;
                  const fs    = Math.min(12, Math.max(9, stone.r * 0.7));
                  const w     = text.length * fs * 0.56 + 12;
                  const left  = stone.x > CX;
                  const edge  = left ? stone.x - stone.r - 6 : stone.x + stone.r + 6;
                  return (
                    <G>
                      <Rect
                        x={left ? edge - w : edge} y={stone.y - fs * 0.75 - 2}
                        width={w} height={fs * 1.5 + 4} rx={(fs * 1.5 + 4) / 2}
                        fill="rgba(6,12,24,0.62)"
                      />
                      <SvgText
                        x={left ? edge - 6 : edge + 6} y={stone.y + fs * 0.35}
                        fontSize={fs} fontWeight="700"
                        fill={stone.completed ? "#ffd54f" : "rgba(255,255,255,0.92)"}
                        textAnchor={left ? "end" : "start"}
                      >
                        {text}
                      </SvgText>
                    </G>
                  );
                })()}
              </G>
            ))}

            {/* Sun */}
            <Circle cx={sunX} cy={sunY} r={60} fill="url(#hsun)"
              opacity={0.28 + prog * 0.42} />
            <Circle cx={sunX} cy={sunY} r={38} fill="url(#hsun)"
              opacity={0.48 + prog * 0.28} />
            <Circle cx={sunX} cy={sunY} r={16} fill="#ffd740" opacity={0.92} />
            <Circle cx={sunX} cy={sunY} r={10} fill="#fff176" />
            <Circle cx={sunX} cy={sunY} r={5}  fill="white" opacity={0.60} />

            {/* Horizon glow */}
            <Rect x={sunX - 100} y={HY - 6} width={200} height={14}
              fill="#f5a820" opacity={0.10 + prog * 0.18} rx={7} />

            {/* Vignette */}
            <Rect x="0" y="0" width={SVG_W} height={SVG_H} fill="url(#hvignette)" />

            {/* YOUR GOAL label */}
            <SvgText x={sunX} y={HY - 26} fontSize={9} fontWeight="600"
              fill="rgba(255,221,74,0.60)" textAnchor="middle" letterSpacing={2}>
              YOUR GOAL
            </SvgText>

            {/* Empty state hint */}
            {activeHabits.length === 0 && (
              <SvgText x={CX} y={SVG_H * 0.74} fontSize={13}
                fill="rgba(255,255,255,0.40)" textAnchor="middle" fontWeight="600">
                Tap + to add your first habit
              </SvgText>
            )}
          </Svg>

          {/* Animated sun glow (RN layer — outside SVG) */}
          <Animated.View
            pointerEvents="none"
            style={[s.sunGlow, {
              left: sunX - 72, top: sunY - 72,
              opacity: glowOp, transform: [{ scale: glowSc }],
            }]}
          />

          {/* Invisible touch targets over each stone */}
          {stones.map(stone => {
            const hitR = Math.max(22, stone.r + 12);
            return (
              <Pressable
                key={stone.id}
                onPress={() => handleStoneTap(stone.id)}
                style={{
                  position: "absolute",
                  left:   stone.x - hitR,
                  top:    stone.y - hitR,
                  width:  hitR * 2,
                  height: hitR * 2,
                  borderRadius: hitR,
                }}
              />
            );
          })}

          {/* Ripple ring feedback on stone tap */}
          {ripplePos && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: ripplePos.x - ripplePos.r * 1.5,
                top:  ripplePos.y - ripplePos.r * 1.5,
                width:  ripplePos.r * 3,
                height: ripplePos.r * 3,
                borderRadius: ripplePos.r * 1.5,
                borderWidth: 2,
                borderColor: Palette.amber400,
                opacity: rippleOpacity,
                transform: [{ scale: rippleScale }],
              }}
            />
          )}
        </View>

        {/* ── Progress bar ── */}
        <View style={s.progressBar}>
          <Text style={s.progressBarLabel}>
            {progress.total === 0
              ? "Add habits to begin your journey"
              : allDone
              ? "All steps complete — amazing work!"
              : `${progress.done} of ${progress.total} ${progress.total === 1 ? "step" : "steps"} today`}
          </Text>
          {progress.total > 0 && (
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.round(prog * 100)}%` as any },
                allDone && s.fillDone]} />
            </View>
          )}
        </View>

        {/* ── Today's Reading plan card ── */}
        {activePlan && todayDay && (
          <View style={s.planCard}>
            <View style={s.planCardHeader}>
              <Text style={s.planCardLabel}>TODAY&apos;S READING</Text>
              <Text style={s.planCardName} numberOfLines={1}>{activePlan.title}</Text>
            </View>
            <Text style={s.planCardFocus}>{todayDay.focus}</Text>
            {todayDay.references.length > 0 && (
              <Text style={s.planCardRefs}>{todayDay.references.join(" • ")}</Text>
            )}
            <Pressable
              onPress={() =>
                router.push(`/study/plans/${activePlan.id}/day/${todayDay.id}` as never)
              }
              style={s.planCardBtn}
            >
              <Text style={s.planCardBtnText}>Start Today&apos;s Study →</Text>
            </Pressable>
          </View>
        )}

        {/* ── Habit list (expandable) ── */}
        {activeHabits.length > 0 && (
          <View style={s.listSection}>
            <Pressable
              onPress={() => setListExpanded(e => !e)}
              style={s.listToggle}
            >
              <Text style={s.listToggleLabel}>HABITS</Text>
              <Text style={s.listToggleChevron}>{listExpanded ? "▲" : "▼"}</Text>
            </Pressable>
            {listExpanded && activeHabits.map(habit => {
              const isDone = log?.completedHabitIds.includes(habit.id) ?? false;
              const name   = (habit as any).title ?? (habit as any).name ?? "";
              return (
                <Pressable
                  key={habit.id}
                  onPress={() => handleStoneTap(habit.id)}
                  style={[s.habitRow, isDone && s.habitRowDone]}
                >
                  <View style={[s.habitCircle, isDone && s.habitCircleDone]}>
                    {isDone && <Text style={s.habitCircleCheck}>✓</Text>}
                  </View>
                  <Text style={[s.habitName, isDone && s.habitNameDone]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Pressable
                    onPress={() => setDeleteId(habit.id)}
                    hitSlop={8}
                    style={s.habitDeleteBtn}
                  >
                    <Text style={s.habitDeleteText}>✕</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable onPress={() => setAddVisible(true)} style={s.fab}>
        <Text style={s.fabText}>+</Text>
      </Pressable>

      {/* ── Add habit modal ── */}
      <Modal
        visible={addVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setAddVisible(false)}>
          <Pressable style={s.modalBox} onPress={e => e.stopPropagation()}>
            <Text style={s.modalTitle}>New Habit</Text>
            <TextInput
              style={s.input}
              placeholder="Habit name"
              placeholderTextColor="rgba(255,255,255,0.30)"
              value={newName}
              onChangeText={setNewName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleAddHabit}
            />
            <View style={s.schedRow}>
              <Pressable
                onPress={() => setSchedType("daily")}
                style={[s.schedBtn, schedType === "daily" && s.schedBtnActive]}
              >
                <Text style={[s.schedBtnText, schedType === "daily" && s.schedBtnTextActive]}>
                  Daily
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSchedType("weekly")}
                style={[s.schedBtn, schedType === "weekly" && s.schedBtnActive]}
              >
                <Text style={[s.schedBtnText, schedType === "weekly" && s.schedBtnTextActive]}>
                  Weekly
                </Text>
              </Pressable>
            </View>
            {schedType === "weekly" && (
              <TextInput
                style={s.input}
                placeholder="Times per week (e.g. 3)"
                placeholderTextColor="rgba(255,255,255,0.30)"
                value={targetPerWk}
                onChangeText={setTargetPerWk}
                keyboardType="number-pad"
              />
            )}
            <View style={s.modalActions}>
              <Pressable onPress={() => setAddVisible(false)} style={s.cancelBtn}>
                <Text style={s.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleAddHabit} style={s.saveBtn}>
                <Text style={s.saveBtnText}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete confirm modal ── */}
      <Modal
        visible={deleteId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteId(null)}
      >
        <Pressable style={s.overlay} onPress={() => setDeleteId(null)}>
          <Pressable style={s.modalBox} onPress={e => e.stopPropagation()}>
            <Text style={s.modalTitle}>Delete habit?</Text>
            <Text style={s.deleteWarning}>
              This will remove all streak history for this habit.
            </Text>
            <View style={s.modalActions}>
              <Pressable onPress={() => setDeleteId(null)} style={s.cancelBtn}>
                <Text style={s.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!deleteId) return;
                  await deleteHabit(deleteId);
                  setDeleteId(null);
                  load();
                }}
                style={s.deleteBtn}
              >
                <Text style={s.deleteBtnText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.navy800 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 8,
  },
  dateLabel: {
    fontSize: 15, fontWeight: "700",
    color: Palette.white60, letterSpacing: 0.3,
  },
  progressBadge: {
    fontSize: 15, fontWeight: "700", color: Palette.white60,
  },
  progressBadgeDone: { color: Palette.amber500 },

  // Sun glow overlay
  sunGlow: {
    position: "absolute", width: 144, height: 144, borderRadius: 72,
    backgroundColor: "#f5a823",
  },

  // Progress bar
  progressBar: {
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: Palette.navy800,
    borderTopWidth: 1, borderTopColor: Palette.navy500,
  },
  progressBarLabel: {
    fontSize: 13, color: Palette.white60, fontWeight: "600", marginBottom: 8,
  },
  track: {
    height: 5, borderRadius: 3,
    backgroundColor: Palette.navy500, overflow: "hidden",
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: Palette.amber500 },
  fillDone: { backgroundColor: Palette.amber300 },

  // Plan card
  planCard: {
    marginHorizontal: 16, marginTop: 14,
    borderRadius: 16, borderWidth: 1,
    borderColor: "rgba(245,166,35,0.28)",
    backgroundColor: Palette.navy700, padding: 16,
  },
  planCardHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 8,
  },
  planCardLabel: {
    fontSize: 11, fontWeight: "700", color: Palette.amber500, letterSpacing: 1,
  },
  planCardName: {
    fontSize: 11, color: Palette.white40, flexShrink: 1, maxWidth: "55%",
  },
  planCardFocus: {
    fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 4,
  },
  planCardRefs: {
    fontSize: 13, color: Palette.white60, marginBottom: 12,
  },
  planCardBtn: {
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: Palette.amber500, alignItems: "center",
  },
  planCardBtnText: { fontSize: 14, fontWeight: "700", color: Palette.navy800 },

  // Habit list
  listSection: { marginHorizontal: 16, marginTop: 16 },
  listToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Palette.navy500,
  },
  listToggleLabel: {
    fontSize: 11, fontWeight: "700",
    color: Palette.white40, letterSpacing: 1,
  },
  listToggleChevron: { fontSize: 10, color: Palette.white40 },
  habitRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 13, paddingHorizontal: 2,
    borderBottomWidth: 1, borderBottomColor: Palette.navy500,
  },
  habitRowDone: { opacity: 0.60 },
  habitCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: Palette.white20,
    marginRight: 12, alignItems: "center", justifyContent: "center",
  },
  habitCircleDone: { borderColor: Palette.amber500, backgroundColor: Palette.amber500 },
  habitCircleCheck: { color: Palette.navy800, fontSize: 12, fontWeight: "900" },
  habitName: {
    flex: 1, fontSize: 16, fontWeight: "600", color: Palette.white95,
  },
  habitNameDone: {
    textDecorationLine: "line-through", color: Palette.white40,
  },
  habitDeleteBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Palette.white10,
  },
  habitDeleteText: { fontSize: 11, color: Palette.white40, fontWeight: "700" },

  // FAB
  fab: {
    // Sits above the floating tab bar (16px offset + 64px height in (tabs)/_layout.tsx).
    position: "absolute", bottom: 96, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Palette.amber500,
    alignItems: "center", justifyContent: "center",
    shadowColor: Palette.amber500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: { fontSize: 30, fontWeight: "300", color: Palette.navy800, lineHeight: 34 },

  // Modals
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center", padding: 24,
  },
  modalBox: {
    backgroundColor: Palette.navy700, borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: Palette.navy500,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 16 },
  deleteWarning: { fontSize: 14, color: Palette.white60, marginBottom: 20 },
  input: {
    borderWidth: 1, borderColor: Palette.navy500, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 16, color: "#fff", marginBottom: 12,
    backgroundColor: Palette.navy800,
  },
  schedRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  schedBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: Palette.navy500, alignItems: "center",
  },
  schedBtnActive: {
    borderColor: Palette.amber500,
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  schedBtnText: { fontSize: 15, fontWeight: "600", color: Palette.white40 },
  schedBtnTextActive: { color: Palette.amber500 },
  modalActions: {
    flexDirection: "row", justifyContent: "flex-end",
    gap: 10, marginTop: 8,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { fontSize: 16, fontWeight: "600", color: Palette.white60 },
  saveBtn: {
    paddingVertical: 10, paddingHorizontal: 24,
    backgroundColor: Palette.amber500, borderRadius: 12,
  },
  saveBtnText: { fontSize: 16, fontWeight: "700", color: Palette.navy800 },
  deleteBtn: {
    paddingVertical: 10, paddingHorizontal: 20,
    backgroundColor: Palette.error, borderRadius: 12,
  },
  deleteBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
