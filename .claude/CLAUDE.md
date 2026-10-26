# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the app (port 8082)
npm start

# Platform-specific
npm run android
npm run ios
npm run web

# Lint
npm run lint

# Type check
npm run typecheck

# Clear cache and restart (required after .env changes)
npx expo start -c
```

Unit tests use Vitest (`npm test`; files match `src/**/*.test.ts`). `vitest.config.mts` sets `TZ=America/Denver` so date-key/timezone bugs surface. Parse `YYYY-MM-DD` keys with `parseDateKey` from `src/core/dates.ts`, never `new Date(key)` (that parses as UTC).

## Architecture Overview

**Intentional** is an Expo/React Native app (file-based routing via `expo-router`) paired with a separate Vercel serverless API backend.

### Frontend (`app/`, `src/`, `components/`)

- **Routing:** `app/(tabs)/` contains the five main tabs (Today/index, Study, History, Streaks, Settings). Nested routes live under `app/habits/`, `app/study/`, `app/modal.tsx`.
- **State/persistence:** No global state manager. All persistent data lives in AsyncStorage via the thin wrappers in `src/core/storage.ts` (`getJson`, `setJson`, `removeKey`).
- **Types:** All shared types are in `src/core/types.ts` — `Habit`, `StudySession`, `StudyPlanV2`, `StudyChapterResult`, `StudyPlanDoc`, etc.
- **API client:** `src/ai/apiClient.ts` is the single entry point for all backend calls. It reads `EXPO_PUBLIC_API_URL` from `.env` and constructs URLs with an optional `/api` prefix (controlled by `EXPO_PUBLIC_API_PATH`). Functions: `generateStudySession`, `generateChapterStudy`, `generateStudyPlanDoc`, `studyChat`. A lower-level `apiPost` helper lives in `src/lib/api.ts`.
- **Caching:** AI results are cached in AsyncStorage. Study session plans use `study_cache_v1` (consolidated map keyed by a hash) and a legacy `chapterStudyCache:v1:<ref>` key. Multi-day study plans use `study_plans_v1` and `study_plan_cache_v1`.
- **Feature services:** `src/habits/habitService.ts` (CRUD), `src/habits/streakUtils.ts` (streak calculations), `src/study/sessionService.ts` (session CRUD), `src/study/journalStorage.ts`, `src/study/planStorage.ts`.

### Backend (`api/`)

A standalone Vercel serverless project (ESM, Node ≥18). Uses OpenAI directly (no Anthropic SDK).

- `api/index.js` — health check (`GET /api`)
- `api/generate-study-session.js` — `POST /api/generate-study-session`
- `api/study-chat.js` — `POST /api/study-chat`
- `api/study/generate.js` — `POST /api/study/generate` (chapter study helps)
- `api/study/plan/generate.js` — `POST /api/study/plan/generate` (multi-day plan)

Backend env vars: `OPENAI_API_KEY`, optionally `ALLOW_FULL_BIBLE_TEXT`.

### Environment Setup

Create `.env` in the project root:
```
EXPO_PUBLIC_API_URL=https://your-project.vercel.app
# For local dev:
# EXPO_PUBLIC_API_URL=http://localhost:3000
```

- No trailing slash on the URL.
- On Android emulator use `http://10.0.2.2:3000`; on physical device use your LAN IP.
- The app falls back to a mocked study plan if the API is unreachable.

### AsyncStorage Keys Reference

| Key | Contents |
|-----|----------|
| `study_cache_v1` | Consolidated chapter study cache map |
| `study_plans_v1` | Saved multi-day study plan docs array |
| `study_plan_cache_v1` | Multi-day plan generation cache |
| `study_journal_v1` | Per-chapter journal entries |
| `study_pins_v1` | Pinned "Look for" prompts per chapter |

### Theme & Styling

Custom theme constants in `constants/theme.ts`. Components in `components/` follow a `themed-*` naming convention for dark/light mode support. The color scheme hook is in `hooks/use-color-scheme.ts` (with a `.web.ts` override).

### Adding Study Plan Topics

Edit `TOPIC_CHIPS` in `app/study/plans/create.tsx`.
