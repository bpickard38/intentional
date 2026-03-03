export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({
    message: "Intentional API",
    endpoints: [
      "POST /api/generate-study-session — body: { durationMin: 15|30|60, topic, mode: devotional|deep|challenge, faithTradition? }",
      "POST /api/study-chat — body: { topic, mode, faithTradition?, userQuestion, plan (StudyPlanV2), lastMessages? }",
      "POST /api/study/generate — body: { chapters: string[] }"
    ]
  });
}
