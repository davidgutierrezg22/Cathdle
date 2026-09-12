import os
import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("CATCHDLE_DB_PATH", str(BASE_DIR / "catchdle.db"))).expanduser()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_database():

    conn = get_connection()
    conn.execute("PRAGMA journal_mode = WAL")



    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_maps (
            date TEXT PRIMARY KEY,
            beatmapset_id INTEGER NOT NULL
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