import os
import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def database_path():
    local = BASE_DIR / "catchdle.db"
    configured = os.getenv("CATCHDLE_DB_PATH")
    on_render = os.getenv("RENDER", "").lower() == "true"
    path = Path(configured or ("/var/data/catchdle.db" if on_render else local)).expanduser().resolve()

    if on_render:
        # Render mounts a persistent disk on a directory below the service filesystem.
        # mountinfo also lists bind mounts, which ismount() can miss on Linux.
        mounts = set()
        for line in Path("/proc/self/mountinfo").read_text().splitlines():
            fields, fs = line.split(" - ", 1)
            mount = Path(fields.split()[4].replace(r"\040", " "))
            if mount not in BASE_DIR.parents and mount != BASE_DIR and fs.split()[0] not in {"tmpfs", "overlay", "ramfs"}:
                mounts.add(mount)
        if not mounts.intersection(path.parents):
            raise RuntimeError(f"SQLite path {path} needs to be on the Render persistent disk.")
        if local.is_file() and path != local and not path.exists():
            raise RuntimeError("Back up and restore the existing catchdle.db to the disk before starting.")
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


DB_PATH = database_path()


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_database():

    conn = get_connection()
    conn.execute("PRAGMA journal_mode = WAL")



    conn.execute("""
        CREATE TABLE IF NOT EXISTS map_archive (
            beatmapset_id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_maps (
            date TEXT PRIMARY KEY,
            beatmapset_id INTEGER NOT NULL
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS background_maps (
            date TEXT PRIMARY KEY,
            beatmapset_id INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS background_guesses (
            user_id INTEGER NOT NULL REFERENCES users(id),
            date TEXT NOT NULL REFERENCES background_maps(date),
            position INTEGER NOT NULL,
            beatmapset_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, date, position),
            UNIQUE (user_id, date, beatmapset_id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS audio_maps (
            date TEXT PRIMARY KEY,
            beatmapset_id INTEGER NOT NULL,
            pcm BLOB
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audio_guesses (
            user_id INTEGER NOT NULL REFERENCES users(id),
            date TEXT NOT NULL REFERENCES audio_maps(date),
            position INTEGER NOT NULL,
            beatmapset_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, date, position),
            UNIQUE (user_id, date, beatmapset_id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS oauth_states (
            state TEXT PRIMARY KEY,
            created_at REAL NOT NULL
        )
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_oauth_states_created_at
        ON oauth_states(created_at)
    """)

    # =====================================================
    # USUARIOS
    # =====================================================

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            osu_id INTEGER UNIQUE NOT NULL,

            username TEXT NOT NULL,

            avatar_url TEXT,

            country TEXT,

            created_at DATETIME
                DEFAULT CURRENT_TIMESTAMP
        )
    """)


    # =====================================================
    # RESULTADO DIARIO
    # =====================================================

    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            date TEXT NOT NULL,

            beatmapset_id INTEGER NOT NULL,

            attempts INTEGER NOT NULL,

            won INTEGER NOT NULL,

            score INTEGER NOT NULL,

            completed_at DATETIME
                DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id)
                REFERENCES users(id),

            UNIQUE(user_id, date)
        )
    """)


    # =====================================================
    # INTENTOS INDIVIDUALES
    # =====================================================

    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_guesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            date TEXT NOT NULL,

            attempt_number INTEGER NOT NULL,

            beatmapset_id INTEGER NOT NULL,

            created_at DATETIME
                DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id)
                REFERENCES users(id),

            UNIQUE(
                user_id,
                date,
                beatmapset_id
            ),

            UNIQUE(
                user_id,
                date,
                attempt_number
            )
        )
    """)


    # =====================================================
    # SESIONES PERSISTENTES
    # =====================================================

    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            user_json TEXT NOT NULL,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL,

            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
        ON sessions(expires_at)
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_guesses_user_date
        ON daily_guesses(user_id, date)
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_results_user_date
        ON daily_results(user_id, date)
    """)

    # =====================================================
    # GUARDAR CAMBIOS
    # =====================================================

    conn.commit()

    conn.close()