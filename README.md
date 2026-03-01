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
- **Guided session:** After choosing duration, mode, and topic and tapping "Start session", you get a time-boxed plan with steps, scriptures (with background, observation questions, interpretation, cross-references), talks/articles, reflection prompts, and an action step. A countdown timer runs on-device; you can Pause/Resume and advance steps manually.
- **Ask during study:** The in-session chat sends your question to the backend `/api/study-chat` with the current plan, mode, topic, and last messages. Responses are short and mentor-style. If the API fails, a friendly error bubble is shown.
- **Persistence:** Sessions, habit logs, and chat transcripts are stored locally with AsyncStorage. History lists all sessions (newest first) with mode and status; tap to see full detail and chat transcript. "Resume" appears for in-progress sessions and opens the Study tab with that session.
- **Env and restart:** Set `EXPO_PUBLIC_API_URL` in `.env` (no trailing slash). After changing `.env`, clear cache and restart: `npx expo start -c`. computer’s LAN IP (e.g. `http://192.168.1.x:3000`).
