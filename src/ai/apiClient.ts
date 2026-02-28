import type { StudyPlan } from "@/src/core/types";
import type { FaithTradition } from "@/src/core/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function generateStudyPlan(
  durationMin: 15 | 30 | 60,
  topic: string,
  faithTradition: FaithTradition
): Promise<StudyPlan> {
  if (!API_URL) throw new Error("EXPO_PUBLIC_API_URL is not set");
  const res = await fetch(`${API_URL}/api/generate-study-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ durationMin, topic, faithTradition }),
  });
  if (!res.ok) throw new Error("API request failed: " + res.status);
  const data = await res.json();
  return data as StudyPlan;
}
