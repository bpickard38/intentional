import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
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
  Path as SvgPath,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
  Line,
} from "react-native-svg";
import { useFocusEffect, useRouter } from "expo-router";

import type { Habit, HabitLog, WeeklyReflection } from "@/src/core/types";
import { todayKey } from "@/src/core/dates";
import { listHabits, getAllLogs } from "@/src/habits/habitService";
import { computeAllStreaks, type HabitStreak } from "@/src/habits/streakUtils";
import { listGoals, listValues } from "@/src/goals/goalService";
import {
  getCurrentWeekKey,
  getReflectionForWeek,
  listReflections,
  saveReflection,
} from "@/src/reflection/reflectionService";
import { generateReflection } from "@/src/ai/apiClient";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const TABS = ["Path", "Streaks", "Reflect"] as const;
type TabName = (typeof TABS)[number];

// ── First-person perspective projection ──────────────────────────────────────

const SVG_W  = SCREEN_W;
const SVG_H  = Math.min(SCREEN_H * 0.66, 510);
const HY     = SVG_H * 0.38;          // horizon y
const CX     = SVG_W / 2;             // center x (vanishing point)
const Z0     = 1.5;                   // z-near (viewer's feet)
const EH     = 1.5;                   // eye height (= Z0 so road fills bottom)
const FL     = SVG_H - HY;            // focal length (= SVG_H*0.62)
const Z_FAR  = 30;

// Project world point (wx, wz) → screen (x, y)
function proj(wx: number, wz: number) {
  const s = FL / wz;
  return { x: CX + wx * s, y: HY + EH * s };
}

// Road center S-curve: moves right then back left as depth increases
function rcx(z: number): number {
  return Math.sin(z * 0.25) * 2.6;
}

const RHW    = 1.05;   // road half-width in world units

// Build road polygon
function buildRoadD(N = 90): string {
  const left: string[] = [], right: string[] = [];
  for (let i = 0; i <= N; i++) {
    // Log-spaced z: dense near viewer, sparse at horizon
    const t  = i / N;
    const wz = Z0 * Math.pow(Z_FAR / Z0, t);
    const cx = rcx(wz);
    const lp = proj(cx - RHW, wz);
    const rp = proj(cx + RHW, wz);
    left.push(`${lp.x.toFixed(1)} ${lp.y.toFixed(1)}`);
    right.push(`${rp.x.toFixed(1)} ${rp.y.toFixed(1)}`);
  }
  // Left edge near→far, then right edge far→near
  return `M ${left[0]} ` + left.slice(1).map(p => `L ${p}`).join(" ")
       + ` L ${right[N]} ` + right.slice(0, N).reverse().map(p => `L ${p}`).join(" ")
       + " Z";
}
const ROAD_D = buildRoadD();

// Ground depth lines (z-indexed horizontal bands for perspective texture)
const DEPTH_ZS = [2, 2.8, 4, 6, 9, 14, 22];

// Fixed stars
const STARS = [
  {cx:32,  cy:32,  r:1.4, o:0.90},
  {cx:88,  cy:18,  r:1.0, o:0.65},
  {cx:142, cy:52,  r:1.2, o:0.80},
  {cx:200, cy:20,  r:1.5, o:0.95},
  {cx:258, cy:58,  r:1.0, o:0.55},
  {cx:314, cy:16,  r:1.3, o:0.82},
  {cx:362, cy:66,  r:1.0, o:0.68},
  {cx:52,  cy:92,  r:1.0, o:0.50},
  {cx:160, cy:86,  r:1.2, o:0.62},
  {cx:288, cy:80,  r:1.0, o:0.58},
  {cx:338, cy:110, r:1.1, o:0.46},
  {cx:110, cy:120, r:1.0, o:0.42},
];

// ── Stone & milestone data ────────────────────────────────────────────────────

type StoneData = {
  id: string; label: string; completed: boolean;
  x: number; y: number; r: number; z: number;
};

// Fixed screen-Y stepping so stones always look tightly packed
const STONE_STEP = 32;  // pixels between stones in screen-space

function buildStones(habits: Habit[], log: HabitLog | null): StoneData[] {
  const vis = habits.filter(h => !h.archived).slice(0, 11);
  if (!vis.length) return [];
  const yBot = SVG_H * 0.91;  // nearest stone y (near feet)

  const result: StoneData[] = [];
  for (let i = 0; i < vis.length; i++) {
    const sy = yBot - i * STONE_STEP;
    if (sy <= HY + 6) break;       // clip anything at/above horizon
    const wz = EH * FL / (sy - HY);
    const wx = rcx(wz);
    const p  = proj(wx, wz);
    const r  = Math.max(5, 20 * (Z0 / wz));  // min 5px so far stones are visible

    result.push({
      id: vis[i].id,
      label: vis[i].title ?? (vis[i] as any).name,
      completed: log?.completedHabitIds.includes(vis[i].id) ?? false,
      x: p.x, y: sy, r, z: wz,
    });
  }
  return result;
}

type MilestoneData = {
  id: string; label: string; achieved: boolean;
  x: number; y: number; leftX: number; z: number;
};

const STREAK_TARGETS = [
  { days: 7,   label: "7-Day Streak",   wz: 6  },
  { days: 30,  label: "30-Day Streak",  wz: 10 },
  { days: 100, label: "100-Day Streak", wz: 17 },
];

function buildMilestones(habits: Habit[], logs: HabitLog[]): MilestoneData[] {
  const active  = habits.filter(h => !h.archived);
  const streaks = computeAllStreaks(active, logs, todayKey());
  const best    = streaks.reduce((m, s) => Math.max(m, s.best, s.current), 0);

  return STREAK_TARGETS.map(st => {
    const cx   = rcx(st.wz);
    const cp   = proj(cx, st.wz);
    const lp   = proj(cx - RHW, st.wz);
    return {
      id: st.label, label: st.label,
      achieved: best >= st.days,
      x: cp.x, y: cp.y,
      leftX: lp.x,
      z: st.wz,
    };
  });
}

// ── PathVisual ────────────────────────────────────────────────────────────────

function PathVisual({ habits, logs, log }: { habits: Habit[]; logs: HabitLog[]; log: HabitLog | null }) {
  const stones     = buildStones(habits, log);
  const milestones = buildMilestones(habits, logs);
  const done       = stones.filter(s => s.completed).length;
  const total      = stones.length;
  const progress   = total > 0 ? done / total : 0;

  // Sun glow pulse animation
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
  const glowSc = glow.interpolate({ inputRange: [0, 1], outputRange: [1.0,  1.22] });

  // Sun is at horizon center
  const sunX = CX, sunY = HY;

  // Sorted stones: draw far (small) first so near (big) renders on top
  const sorted = [...stones].sort((a, b) => b.z - a.z);

  return (
    <View style={{ position: "relative" }}>
      <Svg width={SVG_W} height={SVG_H}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"    stopColor="#020912" />
            <Stop offset="0.75" stopColor="#091828" />
            <Stop offset="1"    stopColor="#0f2240" />
          </LinearGradient>

          <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"   stopColor="#6b4e20" />
            <Stop offset="1"   stopColor="#b8882e" />
          </LinearGradient>

          <LinearGradient id="road" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0"   stopColor="#cfc4a4" />
            <Stop offset="0.4" stopColor="#ede3c8" />
            <Stop offset="1"   stopColor="#f8f0d8" />
          </LinearGradient>

          <RadialGradient id="sunG" cx="50%" cy="50%" r="50%">
            <Stop offset="0"    stopColor="#fff176" stopOpacity="1"    />
            <Stop offset="0.35" stopColor="#ffd740" stopOpacity="0.85" />
            <Stop offset="0.65" stopColor="#f5a020" stopOpacity="0.40" />
            <Stop offset="1"    stopColor="#c05000" stopOpacity="0"    />
          </RadialGradient>

          <RadialGradient id="doneHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ffd54f" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#ffd54f" stopOpacity="0"    />
          </RadialGradient>

          <RadialGradient id="vignette" cx="50%" cy="50%" r="65%">
            <Stop offset="0" stopColor="#000" stopOpacity="0"    />
            <Stop offset="1" stopColor="#000" stopOpacity="0.52" />
          </RadialGradient>
        </Defs>

        {/* Sky */}
        <Rect x="0" y="0" width={SVG_W} height={HY + 2} fill="url(#sky)" />

        {/* Stars */}
        {STARS.map((s, i) => <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="white" opacity={s.o} />)}

        {/* Ground */}
        <Rect x="0" y={HY} width={SVG_W} height={SVG_H - HY} fill="url(#ground)" />

        {/* Ground depth lines (perspective bands for 3-D feel) */}
        {DEPTH_ZS.map((wz, i) => {
          const y = proj(0, wz).y;
          if (y < HY || y > SVG_H) return null;
          return (
            <Line key={i}
              x1={0} y1={y} x2={SVG_W} y2={y}
              stroke="#7a5818" strokeWidth={0.6} opacity={0.30} />
          );
        })}

        {/* Road surface */}
        <SvgPath d={ROAD_D} fill="#1a1206" opacity={0.28} />
        <SvgPath d={ROAD_D} fill="url(#road)" />

        {/* Road center dashes — curve follows road */}
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

        {/* ── Stones (far → near for correct z-order) ── */}
        {sorted.map(stone => (
          <G key={stone.id}>
            {stone.completed && (
              <Circle cx={stone.x} cy={stone.y} r={stone.r * 2.2} fill="url(#doneHalo)" />
            )}
            {/* Shadow */}
            <Circle cx={stone.x} cy={stone.y + stone.r * 0.4} r={stone.r * 1.1}
              fill="#000" opacity={0.22} />
            {/* Body */}
            <Circle cx={stone.x} cy={stone.y} r={stone.r}
              fill={stone.completed ? "#f5a623" : "rgba(255,255,255,0.10)"}
              stroke={stone.completed ? "#ffd54f" : "rgba(255,255,255,0.38)"}
              strokeWidth={stone.r > 6 ? 1.5 : 1}
            />
            {/* Small ✓ — only when stone is large enough */}
            {stone.completed && stone.r >= 5 && (
              <SvgText
                x={stone.x} y={stone.y + stone.r * 0.38}
                fontSize={stone.r * 1.1}
                fontWeight="900"
                fill="white" textAnchor="middle" opacity={0.95}
              >✓</SvgText>
            )}
          </G>
        ))}

        {/* ── Milestone markers (streak benchmarks) ── */}
        {milestones.map(ms => {
          if (ms.y < HY + 4 || ms.y > SVG_H) return null;
          const labelX = Math.max(12, ms.leftX - 46);
          const dotR   = Math.max(3, 7 * (Z0 / ms.z));
          return (
            <G key={ms.id}>
              <Line
                x1={ms.leftX} y1={ms.y} x2={labelX + 4} y2={ms.y}
                stroke={ms.achieved ? "#ffd54f" : "rgba(255,255,255,0.22)"}
                strokeWidth={0.8}
              />
              <Circle cx={ms.leftX} cy={ms.y} r={dotR}
                fill={ms.achieved ? "#f5a623" : "rgba(255,255,255,0.12)"}
                stroke={ms.achieved ? "#ffd54f" : "rgba(255,255,255,0.30)"}
                strokeWidth={1}
              />
              {ms.achieved && (
                <SvgText x={ms.leftX} y={ms.y + dotR * 0.38}
                  fontSize={dotR * 1.1} fontWeight="900"
                  fill="white" textAnchor="middle">✓</SvgText>
              )}
              <SvgText
                x={labelX} y={ms.y - 3}
                fontSize={Math.max(8, 12 * (Z0 / ms.z))}
                fontWeight={ms.achieved ? "700" : "400"}
                fill={ms.achieved ? "#ffd54f" : "rgba(255,255,255,0.45)"}
                textAnchor="end"
              >
                {ms.label}
              </SvgText>
            </G>
          );
        })}

        {/* ── Sun (long-term goal) at horizon ── */}
        <Circle cx={sunX} cy={sunY} r={60} fill="url(#sunG)" opacity={0.28 + progress * 0.42} />
        <Circle cx={sunX} cy={sunY} r={38} fill="url(#sunG)" opacity={0.48 + progress * 0.28} />
        <Circle cx={sunX} cy={sunY} r={16} fill="#ffd740" opacity={0.92} />
        <Circle cx={sunX} cy={sunY} r={10} fill="#fff176" />
        <Circle cx={sunX} cy={sunY} r={5}  fill="white"   opacity={0.60} />

        {/* Horizon glow band */}
        <Rect x={sunX - 100} y={HY - 6} width={200} height={14}
          fill="#f5a820" opacity={0.10 + progress * 0.16} rx={7} />

        {/* Vignette */}
        <Rect x="0" y="0" width={SVG_W} height={SVG_H} fill="url(#vignette)" />

        {/* "YOUR GOAL" label just above sun */}
        <SvgText x={sunX} y={HY - 26}
          fontSize={9} fontWeight="600"
          fill="rgba(255,221,74,0.60)"
          textAnchor="middle" letterSpacing={2}>
          YOUR GOAL
        </SvgText>
      </Svg>

      {/* Animated sun glow (RN Animated — outside SVG so it layers over vignette) */}
      <Animated.View
        pointerEvents="none"
        style={[pvS.sunGlow, {
          left: sunX - 72, top: sunY - 72,
          opacity: glowOp, transform: [{ scale: glowSc }],
        }]}
      />

      {/* Progress bar */}
      <View style={pvS.bar}>
        <Text style={pvS.barLabel}>
          {total === 0
            ? "Add habits on Today to begin your journey"
            : `Today: ${done} of ${total} ${total === 1 ? "step" : "steps"} on your path`}
        </Text>
        <View style={pvS.track}>
          <View style={[pvS.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>
    </View>
  );
}

const pvS = StyleSheet.create({
  sunGlow: {
    position: "absolute", width: 144, height: 144, borderRadius: 72,
    backgroundColor: "#f5a823",
  },
  bar: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#060f20", borderTopWidth: 1, borderTopColor: "#142030" },
  barLabel: { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "600", marginBottom: 8 },
  track: { height: 5, borderRadius: 3, backgroundColor: "#142030", overflow: "hidden" },
  fill:  { height: 5, borderRadius: 3, backgroundColor: "#f5a623" },
});

// ── Streaks section ───────────────────────────────────────────────────────────

type Filter = "all" | "active" | "zero";

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[ss.chip, active && ss.chipOn]}>
      <Text style={active ? ss.chipTxtOn : ss.chipTxt}>{label}</Text>
    </Pressable>
  );
}

function StreaksSection({ habits, logs, loading }: { habits: Habit[]; logs: HabitLog[]; loading: boolean }) {
  const router   = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const active   = habits.filter(h => !h.archived);
  const streaks  = computeAllStreaks(active, logs, todayKey());
  const filtered = streaks.filter(s =>
    filter === "active" ? s.current > 0 : filter === "zero" ? s.current === 0 : true
  );
  const inStreak = streaks.filter(s => s.current > 0).length;
  const longest  = streaks[0];

  return (
    <ScrollView contentContainerStyle={ss.container} showsVerticalScrollIndicator={false}>
      <View style={ss.summaryRow}>
        {[
          { label: "Habits",    val: String(active.length) },
          { label: "In streak", val: String(inStreak) },
          { label: "Best",      val: longest?.current > 0 ? `${longest.current} 🔥` : "—" },
        ].map(c => (
          <View key={c.label} style={ss.summaryCard}>
            <Text style={ss.summaryLabel}>{c.label}</Text>
            <Text style={ss.summaryValue} numberOfLines={1}>{c.val}</Text>
          </View>
        ))}
      </View>
      <View style={ss.filterRow}>
        <FilterChip label="All"    active={filter === "all"}    onPress={() => setFilter("all")} />
        <FilterChip label="Active" active={filter === "active"} onPress={() => setFilter("active")} />
        <FilterChip label="Zero"   active={filter === "zero"}   onPress={() => setFilter("zero")} />
      </View>
      {loading ? (
        <Text style={ss.helper}>Loading…</Text>
      ) : filtered.length === 0 ? (
        <Text style={ss.helper}>
          {active.length === 0 ? "No habits yet — add one on the Today tab." : "No habits match this filter."}
        </Text>
      ) : filtered.map(item => (
        <Pressable key={item.habit.id} style={ss.card}
          onPress={() => router.push({ pathname: "/habits/[id]", params: { id: item.habit.id } })}>
          <View style={ss.cardTop}>
            <Text style={ss.cardTitle}>{item.habit.title ?? item.habit.name}</Text>
            {item.current > 0 && <Text>🔥</Text>}
          </View>
          <View style={ss.cardRow}>
            <Text style={ss.metric}>🔥 {item.current} current</Text>
            <Text style={ss.metric}>🏆 {item.best} best</Text>
            {item.lastCompletedKey && <Text style={ss.metric}>Last: {new Date(item.lastCompletedKey).toLocaleDateString()}</Text>}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const ss = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#eee", backgroundColor: "#f8f9fa" },
  summaryLabel: { fontSize: 11, color: "#555", marginBottom: 4 },
  summaryValue: { fontSize: 15, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff" },
  chipOn: { borderColor: "#f5a623", backgroundColor: "#fff8ed" },
  chipTxt: { fontSize: 13, color: "#444" },
  chipTxtOn: { fontSize: 13, fontWeight: "700", color: "#c07800" },
  helper: { fontSize: 14, color: "#666", marginTop: 12 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#eee", marginBottom: 10, backgroundColor: "#fff" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { fontSize: 13, color: "#555" },
});

// ── Reflect section ───────────────────────────────────────────────────────────

function ReflectSection({ habits, logs }: { habits: Habit[]; logs: HabitLog[] }) {
  const [reflection, setReflection] = useState<WeeklyReflection | null>(null);
  const [past, setPast]             = useState<WeeklyReflection[]>([]);
  const [answer, setAnswer]         = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    const wk = getCurrentWeekKey();
    const [cur, all] = await Promise.all([getReflectionForWeek(wk), listReflections()]);
    setReflection(cur); setAnswer(cur?.answer ?? "");
    setPast(all.filter(r => r.weekKey !== wk).reverse());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleGenerate() {
    setGenerating(true); setError(null);
    try {
      const wk = getCurrentWeekKey();
      const now = new Date();
      const sow = new Date(now); sow.setDate(now.getDate() - now.getDay()); sow.setHours(0,0,0,0);
      const weekLogs = logs.filter(l => new Date(l.date) >= sow);
      const counts: Record<string, number> = {};
      for (const lg of weekLogs) for (const id of lg.completedHabitIds) counts[id] = (counts[id] ?? 0) + 1;
      const completedHabits = habits.filter(h => !h.archived && counts[h.id]).map(h => ({ name: h.title ?? h.name, count: counts[h.id] }));
      const [goals, values] = await Promise.all([listGoals(), listValues()]);
      const result = await generateReflection({
        completedHabits,
        goals: goals.map(g => ({ title: g.title, milestonesCompleted: g.milestones.filter(m => m.completed).length })),
        values: values.map(v => v.text),
        previousReflections: past.slice(0, 5).map(r => r.question),
      });
      const nr: WeeklyReflection = { id: `r-${Date.now()}`, weekKey: wk, question: result.question, summary: result.summary, generatedAt: new Date().toISOString() };
      await saveReflection(nr); setReflection(nr); setAnswer("");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to generate."); }
    finally { setGenerating(false); }
  }

  async function handleSave() {
    if (!reflection || !answer.trim()) return;
    setSaving(true);
    const u: WeeklyReflection = { ...reflection, answer: answer.trim(), answeredAt: new Date().toISOString() };
    await saveReflection(u); setReflection(u); setSaving(false);
  }

  return (
    <ScrollView contentContainerStyle={rs.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={rs.heading}>This Week</Text>
      {reflection ? (
        <View style={rs.card}>
          {reflection.summary ? <Text style={rs.summary}>{reflection.summary}</Text> : null}
          <Text style={rs.question}>{reflection.question}</Text>
          <TextInput style={rs.input} placeholder="Write your reflection…" value={answer} onChangeText={setAnswer} multiline numberOfLines={4} textAlignVertical="top" />
          <Pressable onPress={handleSave} style={[rs.btn, (!answer.trim() || saving) && rs.btnOff]} disabled={saving || !answer.trim()}>
            <Text style={rs.btnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={rs.empty}>
          <Text style={rs.emptyText}>Ready to reflect on this week?</Text>
          {error ? <Text style={rs.error}>{error}</Text> : null}
          <Pressable onPress={handleGenerate} style={[rs.btn, generating && rs.btnOff]} disabled={generating}>
            <Text style={rs.btnText}>{generating ? "Generating…" : "Generate Reflection"}</Text>
          </Pressable>
        </View>
      )}
      {past.length > 0 && (
        <>
          <Text style={[rs.heading, { marginTop: 28 }]}>Past Reflections</Text>
          {past.map(r => (
            <View key={r.id} style={rs.pastCard}>
              <Text style={rs.pastWeek}>{r.weekKey}</Text>
              <Text style={rs.pastQ}>{r.question}</Text>
              {r.answer ? <Text style={rs.pastA}>{r.answer}</Text> : <Text style={rs.noAnswer}>No answer recorded</Text>}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const rs = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  heading: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#e0e7ff", backgroundColor: "#f8f9ff", marginBottom: 16 },
  summary: { fontSize: 14, color: "#555", lineHeight: 20, marginBottom: 12 },
  question: { fontSize: 16, fontWeight: "700", color: "#1a1a2e", marginBottom: 12, lineHeight: 22 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, minHeight: 100, backgroundColor: "#fff", marginBottom: 12 },
  empty: { padding: 20, borderRadius: 16, borderWidth: 1, borderColor: "#eee", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, color: "#555", textAlign: "center" },
  btn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: "#0a7ea4", borderRadius: 12, alignItems: "center" },
  btnOff: { opacity: 0.5 },
  btnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  error: { fontSize: 13, color: "#dc3545", textAlign: "center" },
  pastCard: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#eee", marginBottom: 10 },
  pastWeek: { fontSize: 12, color: "#999", marginBottom: 4 },
  pastQ: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 6 },
  pastA: { fontSize: 14, color: "#555", lineHeight: 20 },
  noAnswer: { fontSize: 13, color: "#aaa", fontStyle: "italic" },
});

// ── Main Path screen ──────────────────────────────────────────────────────────

export default function PathScreen() {
  const [activeTab, setActiveTab] = useState<TabName>("Path");
  const [habits, setHabits]       = useState<Habit[]>([]);
  const [log, setLog]             = useState<HabitLog | null>(null);
  const [logs, setLogs]           = useState<HabitLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, allLogs] = await Promise.all([listHabits(), getAllLogs()]);
      setHabits(h); setLogs(allLogs);
      setLog(allLogs.find(l => l.date === todayKey()) ?? null);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function selectTab(tab: TabName) {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ x: TABS.indexOf(tab) * SCREEN_W, animated: true });
  }

  function handleScroll(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (TABS[i] && TABS[i] !== activeTab) setActiveTab(TABS[i]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <Pressable key={tab} onPress={() => selectTab(tab)} style={[styles.tabBtn, activeTab === tab && styles.tabBtnOn]}>
            <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtOn]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        <ScrollView style={{ width: SCREEN_W }} showsVerticalScrollIndicator={false}>
          <PathVisual habits={habits} logs={logs} log={log} />
        </ScrollView>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <StreaksSection habits={habits} logs={logs} loading={loading} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <ReflectSection habits={habits} logs={logs} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#060f20", paddingTop: 54 },
  tabBar: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 8, paddingTop: 2, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  tabBtnOn: { backgroundColor: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.30)" },
  tabTxt: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.40)" },
  tabTxtOn: { color: "rgba(255,255,255,0.92)" },
});
