# Deploy Catchdle on Render

## 1. GitHub
Create a **private** GitHub repository and upload this project. Do **not** upload `.env` or `catchdle.db`.

## 2. Render
Create **New → Web Service**, connect the GitHub repository, and use:

- Runtime: Python 3
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn server.app:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

### Production database (Neon PostgreSQL)

All game modes share the same PostgreSQL database. Set the service secret
`DATABASE_URL` to the connection string for the Catchdle project in Neon,
including its SSL options. Render Free can use this configuration without a disk.
The app creates missing tables on startup and does not fall back to SQLite when
the configured PostgreSQL connection fails. Never commit the URL.

For local development without `DATABASE_URL`, the app still uses SQLite. A
disk-backed Render installation can also continue to use `CATCHDLE_DB_PATH`.

### Moving an existing service without losing scores

Keep the running service on its current deploy while you copy its database. Adding a disk
or changing environment variables can restart the service. Pause gameplay during the
final copy so that no later guesses are left behind.

From the current service shell, create a consistent backup including committed WAL data:

```sh
python - <<'PY'
import os, sqlite3, tempfile
from pathlib import Path
from contextlib import closing
source = Path(os.environ.get("CATCHDLE_DB_PATH", "catchdle.db")).resolve()
with tempfile.NamedTemporaryFile(prefix="catchdle-backup-", suffix=".db", delete=False) as f:
    backup = Path(f.name)
with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src, closing(sqlite3.connect(backup)) as dst:
    src.backup(dst)
    assert dst.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print(backup)
PY
```

Transfer that backup to private storage **outside the service** before attaching the disk.
It includes sessions and player records. Keep it out of GitHub. Use a disk-mounted
service with gameplay paused when restoring, and restore into a fresh destination
before the app accepts writes. Do not overwrite an active database. Check player and
result counts for Classic, Background and Audio against the backup, then verify them
again after a restart. Keep the original backup until the checks pass.

## 3. Environment variables
Set these in Render:

```text
ENVIRONMENT=production
COOKIE_SECURE=true
DATABASE_URL=<private PostgreSQL connection string>
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
