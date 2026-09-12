# Deploy Catchdle on Render

## 1. GitHub
Create a **private** GitHub repository and upload this project. Do **not** upload `.env` or `catchdle.db`.

## 2. Render
Create **New → Web Service**, connect the GitHub repository, and use:

- Runtime: Python 3
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn server.app:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

Catchdle uses SQLite. Because Render's normal filesystem is ephemeral, attach a **persistent disk** to the web service (paid web service) at `/var/data`. The app is configured to use `CATCHDLE_DB_PATH=/var/data/catchdle.db`. Render documents that persistent disks preserve filesystem changes across deploys/restarts; without one, SQLite data would be lost.

## 3. Environment variables
Set these in Render:

```text
ENVIRONMENT=production
COOKIE_SECURE=true
CATCHDLE_DB_PATH=/var/data/catchdle.db
OSU_CLIENT_ID=<your osu client id>
OSU_CLIENT_SECRET=<your osu client secret>
APP_ORIGIN=https://YOUR-SERVICE.onrender.com
OSU_REDIRECT_URI=https://YOUR-SERVICE.onrender.com/auth/callback
```

Replace `YOUR-SERVICE` with the actual Render service hostname.

## 4. osu! OAuth
In your osu! OAuth application, change the callback URL to exactly:

`https://YOUR-SERVICE.onrender.com/auth/callback`

The local callback can remain configured too if you want local development.

## 5. First deploy
Deploy, open the Render URL, and test:

1. Home page loads.
2. Background collage appears while logged out.
3. osu! login works.
4. Avatar loads.
5. Search dropdown works.
6. Correct daily map produces Victory.
7. Statistics and leaderboard work.

## Important
Do not paste your osu! Client Secret into GitHub, chat, screenshots, or `render.yaml`. Put it only in Render Environment Variables.
