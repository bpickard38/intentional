# Deploying the API to Vercel

Follow these steps so the app can reach your API (Study session + "Ask a question").

## 1. Connect the repo

- In [Vercel](https://vercel.com), create a **New Project** and import your **intentional** repo.
- Do **not** set a Root Directory (leave it **empty**). The project root must be the repo root so that the `api/` folder is included.

## 2. Project settings

In the project **Settings → General**:

| Setting           | Value        |
|------------------|--------------|
| **Root Directory** | Leave **empty** (use repo root) |
| **Framework Preset** | Other (or leave default) |
| **Build Command**   | Leave default, or set to `echo 'OK'` if you only need the API and want to skip a frontend build |
| **Output Directory** | Leave default |

## 3. Environment variables

In **Settings → Environment Variables**, add:

| Name             | Value        | Environments   |
|------------------|-------------|----------------|
| `OPENAI_API_KEY` | Your OpenAI API key | Production, Preview |

Optional (copyright / display):

| Name | Value | Note |
|------|--------|------|
| `ALLOW_FULL_BIBLE_TEXT` | `true` or `1` | API: allow full Bible verse text in responses. Omit or `false` = reference + summary + link only. |
| (App) `EXPO_PUBLIC_ALLOW_FULL_BIBLE_TEXT` | `true` or `1` | App: allow showing full Bible text in UI when API provides it. Set in project `.env`. |

Save and redeploy if the project already exists.

## 4. Deploy

- Push to your main branch (or trigger a deploy from the Vercel dashboard).
- Wait for the build to finish. The build should **succeed** (no "pattern doesn't match" error).

## 5. Use the API URL in the app

- Copy your project URL, e.g. `https://your-project.vercel.app`.
- In the **intentional** app, in the project root, create or edit `.env`:

```
EXPO_PUBLIC_API_URL=https://your-project.vercel.app
```

- Do **not** add a trailing slash.
- Do **not** set `EXPO_PUBLIC_API_PATH` (the app uses `/api/...` by default).
- Restart the app with a clean cache: `npx expo start -c`.

## 6. Check that it works

- Open the **Study** tab in the app. The **API** box should show **Reachable** and the URL.
- If it shows **Not reachable** or 404:
  - Confirm **Root Directory** is empty in Vercel.
  - Open `https://your-project.vercel.app/api` in a browser; you should see JSON with `"message": "Intentional API"`.
  - Make sure `.env` has the correct URL and you ran `npx expo start -c`.

## If you previously set Root Directory to `api`

- That causes the "pattern 'api/**/*.js' doesn't match" build error and 404s, because there is no `api` folder inside the `api` directory.
- Set **Root Directory** back to **empty** (repo root), then redeploy.

---

## Troubleshooting: 404 / wrong route

Use **DevTools → Network** and check the failing request.

**1) Endpoint path** — App calls exactly: `BASE/api`, `BASE/api/generate-study-session`, `BASE/api/study-chat` (BASE = EXPO_PUBLIC_API_URL). Backend: `api/index.js`, `api/generate-study-session.js`, `api/study-chat.js`. One wrong character = 404.

**2) Hit API, not frontend** — Request URL must start with your Vercel URL. If it’s localhost or wrong domain, set EXPO_PUBLIC_API_URL in .env and run `npx expo start -c`.

**3) Route in production** — Repo must have the three `api/*.js` files committed. Vercel Root Directory must be empty so `api/` is deployed.

**4) No undefined in URL** — App uses fixed paths + POST body. If you see `undefined` in the URL, fix the client (e.g. apiClient.ts).

**5) Auth** — This API has no auth; 404 is not a masked 401/403.

---

## "My URL still returns 404"

If `https://your-project.vercel.app/api` returns 404, the API is not deployed there. Fix in Vercel:

1. **Settings → General → Root Directory** — must be **empty**. If set to `api` or anything else, clear it, Save, then Redeploy.
2. **Settings → Git** — confirm the connected repo contains the `api/` folder and you're on the right branch.
3. **Deployments** → Redeploy. Then open `https://your-project.vercel.app/api` in a browser; you should see JSON with `"message": "Intentional API"`.
4. If the build fails with "pattern api/**/*.js doesn't match", Root Directory is wrong (step 1).

Your app and .env are correct; the issue is the Vercel project not serving the api folder until the steps above are done.
