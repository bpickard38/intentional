# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Local Dev

- **Start the app:** `npm start` (or `npx expo start`).

- **API URL:** The app calls a backend at `EXPO_PUBLIC_API_URL` for generating study sessions (e.g. `/api/generate-study-session`). Set it in `.env`:
  - **Local:** `EXPO_PUBLIC_API_URL=http://localhost:3000` (or your dev server URL).
  - **Production:** Set `EXPO_PUBLIC_API_URL` to your production API base URL (e.g. `https://api.yourdomain.com`).
  If the variable is missing or the request fails, the app falls back to a mocked study plan so it works offline.

### "Network request failed" / API unavailable

- The app now shows the **exact URL** it’s calling in the error banner (e.g. `URL: https://your-api.vercel.app/api/generate-study-session`). Test that URL in a browser or with curl to confirm the backend responds.
- **No trailing slash:** Use `https://your-app.vercel.app` not `https://your-app.vercel.app/`.
- **Restart Expo** after changing `.env` (`npx expo start`), then reload the app (shake device → Reload, or refresh in web).
- **Expo Web (browser):** The backend must allow CORS. In your API handler, send CORS headers and handle `OPTIONS`:

  ```js
  // At the start of your handler (e.g. Next.js API route or Vercel serverless):
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  ```
- **Device/emulator:** If you use a local backend (e.g. `http://localhost:3000`), on Android emulator use `http://10.0.2.2:3000`; on a physical device use your computer's LAN IP (e.g. `http://192.168.1.x:3000`).

## Study Session + Chat

- **Study modes:** Devotional, Deep Study, and Challenge. Each mode changes the plan structure and reflection prompts.
- **Guided session:** After choosing duration, mode, and topic and tapping "Start session", you get a time-boxed plan with steps, scriptures (shown as chapter-based cards with key moments), optional talks, and a simple reflection section. A countdown timer runs on-device; you can Pause/Resume and advance steps manually.
- **Ask during study:** The in-session chat sends your question to the backend `/api/study-chat` with the current plan, mode, topic, and last messages. Responses are short and mentor-style. If the API fails, a friendly error bubble is shown.
- **Persistence:** Sessions, habit logs, and chat transcripts are stored locally with AsyncStorage. History lists all sessions (newest first) with mode and status; tap to see full detail and chat transcript. "Resume" appears for in-progress sessions and opens the Study tab with that session.
- **Env and restart:** Set `EXPO_PUBLIC_API_URL` in `.env` (no trailing slash). After changing `.env`, clear cache and restart: `npx expo start -c`. Use your computer’s LAN IP (e.g. `http://192.168.1.x:3000`) when testing on a device.

## Habits & Streaks

- **Today tab:** Shows your daily and weekly habits, with per-day and per-week progress. Habits are stored locally in AsyncStorage.
- **Streaks tab:** Summarizes total habits, how many are currently in a streak, and the longest current streak. Below the summary, a list shows each habit’s current and best streak, plus the last day it was completed.
- **Habit details:** Tapping a habit in the Streaks list opens a detail screen with a 30‑day grid (completed / missed / not scheduled), current/best streak stats, and Edit/Delete actions. Deleting a habit also removes its completion history from the streak calculations.

## Chapter Study API

- **Frontend client:** The Study tab includes a “Chapter study” mode with a chapter picker (Standard Works → book → chapter chips). When you tap **Generate Study Helps**, the app calls `generateChapterStudy` from `src/ai/apiClient.ts`, which:
  - POSTs to `POST /api/study/generate` with `{ chapters: string[] }`.
  - Caches results in AsyncStorage under keys like `chapterStudyCache:v1:<sorted chapter list>`.
  - Returns `{ result, fromCache }` so the UI can show cached results instantly and offer a **Regenerate** button.
- **Backend route:** `api/study/generate.js` uses `OPENAI_API_KEY` to call OpenAI and returns:
  - For each chapter: `reference`, `bigIdea`, `crossReferences[{ theme, refs[] }]`, `discussionQuestions[]`, `lookFor[]`, `context`, and `links[{ label, url }]`, plus an optional `studyPlanSuggestion`.
  - The route is **copyright safe**: it never returns full scripture or talk text, only references, summaries, prompts, and official links (e.g. `churchofjesuschrist.org`).
- **Usage:** Set `EXPO_PUBLIC_API_URL` to your deployed API base (for example, your Vercel URL). The app will hit:
  - `POST <API_URL>/api/generate-study-session`
  - `POST <API_URL>/api/study-chat`
  - `POST <API_URL>/api/study/generate`
