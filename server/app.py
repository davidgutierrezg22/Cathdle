import os
import secrets
import time
import json
import hashlib
import logging
import random
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from server.database import init_database, get_connection


# =========================================================
# INICIALIZAR BASE DE DATOS
# =========================================================

init_database()


# =========================================================
# RUTAS DEL PROYECTO
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
WEB_DIR = BASE_DIR / "web"
BEATMAPS_FILE = DATA_DIR / "beatmaps.json"

# =========================================================
# VARIABLES DE ENTORNO
# =========================================================

load_dotenv(BASE_DIR / ".env")

OSU_CLIENT_ID = os.getenv("OSU_CLIENT_ID")
OSU_CLIENT_SECRET = os.getenv("OSU_CLIENT_SECRET")
REDIRECT_URI = os.getenv("OSU_REDIRECT_URI", "http://localhost:8000/auth/callback")
APP_ORIGIN = os.getenv("APP_ORIGIN", "http://localhost:8000").rstrip("/")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true" if ENVIRONMENT == "production" else "false").lower() == "true"

# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(
    level=logging.INFO if ENVIRONMENT != "production" else logging.WARNING,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("catchdle")

# =========================================================
# VALIDAR CONFIGURACIÓN
# =========================================================

if not OSU_CLIENT_ID:
    raise RuntimeError("Falta OSU_CLIENT_ID en el archivo .env")
if not OSU_CLIENT_SECRET:
    raise RuntimeError("Falta OSU_CLIENT_SECRET en el archivo .env")
if ENVIRONMENT == "production" and not COOKIE_SECURE:
    raise RuntimeError("COOKIE_SECURE debe estar activado en producción")

# =========================================================
# FASTAPI
# =========================================================

app = FastAPI(
    title="Catchdle API",
    version="2.0.0",
    docs_url=None if ENVIRONMENT == "production" else "/docs",
    redoc_url=None if ENVIRONMENT == "production" else "/redoc",
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > 16 * 1024:
                return JSONResponse({"error": "Request too large"}, status_code=413)
        except ValueError:
            return JSONResponse({"error": "Invalid Content-Length"}, status_code=400)

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "img-src 'self' data: https://assets.ppy.sh https://osu.ppy.sh https://a.ppy.sh https://cdn.simpleicons.org; "
        "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
        "font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; "
        "form-action 'self' https://osu.ppy.sh"
    )
    if request.url.path.startswith("/api/") or request.url.path.startswith("/auth/"):
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("Pragma", "no-cache")
    if COOKIE_SECURE:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

# =========================================================
# DATASET EN MEMORIA
# =========================================================

def _load_beatmaps():
    try:
        with BEATMAPS_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"No se pudo cargar {BEATMAPS_FILE}: {exc}") from exc

    if not isinstance(data, list) or not data:
        raise RuntimeError("beatmaps.json debe contener una lista no vacía")

    by_id = {}
    valid = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            beatmapset_id = int(item.get("beatmapset_id"))
        except (TypeError, ValueError):
            continue
        if beatmapset_id <= 0 or beatmapset_id in by_id:
            continue
        item = dict(item)
        item["beatmapset_id"] = beatmapset_id
        by_id[beatmapset_id] = item
        valid.append(item)

    if not valid:
        raise RuntimeError("beatmaps.json no contiene beatmapsets válidos")

    valid.sort(key=lambda item: item["beatmapset_id"])
    return valid, by_id

BEATMAPS, BEATMAPS_BY_ID = _load_beatmaps()
BACKGROUND_COVERS = [
    item.get("cover_url")
    or f"https://assets.ppy.sh/beatmaps/{item['beatmapset_id']}/covers/cover.jpg"
    for item in BEATMAPS
]

# =========================================================
# MAPA DIARIO ESTABLE
# =========================================================

def today_colombia():
    return datetime.now(ZoneInfo("America/Bogota")).strftime("%Y-%m-%d")


def _daily_candidate_id(today: str) -> int:
    """Select the daily map using Catchdle's original deterministic algorithm.

    This intentionally mirrors the original JavaScript hash so existing
    daily maps (for example the current test day) do not silently change
    when the game is moved from client-side selection to server-side selection.
    """
    hash_value = 0
    for character in today:
        hash_value = ((hash_value << 5) - hash_value) + ord(character)
        hash_value &= 0xFFFFFFFF
    hash_value &= 0x7FFFFFFF
    index = hash_value % len(BEATMAPS)
    return int(BEATMAPS[index]["beatmapset_id"])


def get_daily_map(today: str | None = None):
    today = today or today_colombia()
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT beatmapset_id FROM daily_maps WHERE date = ?",
            (today,),
        ).fetchone()

        candidate_id = _daily_candidate_id(today)

        if row:
            stored_id = int(row["beatmapset_id"])
            if stored_id != candidate_id:
                # A previous hardened build used a different hash algorithm.
                # Repair only that stale day's selection. Any partial result for
                # that day belongs to the old answer, so it must be reset too.
                logger.warning(
                    "Repairing daily map for %s: %s -> %s",
                    today, stored_id, candidate_id,
                )
                conn.execute(
                    "UPDATE daily_maps SET beatmapset_id = ? WHERE date = ?",
                    (candidate_id, today),
                )
                conn.execute("DELETE FROM daily_guesses WHERE date = ?", (today,))
                conn.execute("DELETE FROM daily_results WHERE date = ?", (today,))
                conn.commit()
            else:
                return BEATMAPS_BY_ID.get(stored_id)
        else:
            conn.execute(
                "INSERT INTO daily_maps(date, beatmapset_id) VALUES (?, ?)",
                (today, candidate_id),
            )
            conn.commit()
        row = conn.execute(
            "SELECT beatmapset_id FROM daily_maps WHERE date = ?",
            (today,),
        ).fetchone()
        return BEATMAPS_BY_ID.get(int(row["beatmapset_id"])) if row else None
    finally:
        conn.close()


# =========================================================
# OAUTH CONFIG
# =========================================================

OSU_AUTHORIZE_URL = "https://osu.ppy.sh/oauth/authorize"
OSU_TOKEN_URL = "https://osu.ppy.sh/oauth/token"
OSU_ME_URL = "https://osu.ppy.sh/api/v2/me/osu"

# =========================================================
# SESIONES
# =========================================================

SESSION_MAX_AGE = 60 * 60 * 24 * 30

# Rate limit sencillo por sesión. En producción multi-instancia
# conviene moverlo a Redis, pero evita spam accidental/automatizado
# en una instalación local sin añadir dependencias.
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_GUESSES = 30
RATE_LIMIT_MAX_SEARCHES = 60
RATE_LIMIT_MAX_GAME_READS = 30
rate_limit_buckets = {}


def _rate_limit(key: str, limit: int) -> bool:
    now = time.monotonic()
    bucket = rate_limit_buckets.get(key)
    if not bucket or now - bucket["started"] >= RATE_LIMIT_WINDOW:
        rate_limit_buckets[key] = {"started": now, "count": 1}
        return True
    if bucket["count"] >= limit:
        return False
    bucket["count"] += 1
    return True


def hash_session_id(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def create_persistent_session(user_id, user):
    session_id = secrets.token_urlsafe(48)
    now = time.time()
    expires_at = now + SESSION_MAX_AGE

    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO sessions (
                id, user_id, user_json, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                hash_session_id(session_id),
                user_id,
                json.dumps(user, ensure_ascii=False),
                now,
                expires_at,
            )
        )
        conn.commit()
    finally:
        conn.close()

    return session_id


def get_session(session_id):
    if not session_id:
        return None

    session_hash = hash_session_id(session_id)
    now = time.time()

    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT user_id, user_json, expires_at
            FROM sessions
            WHERE id = ?
            """,
            (session_hash,)
        ).fetchone()

        if not row:
            return None

        if float(row["expires_at"]) <= now:
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_hash,))
            conn.commit()
            return None

        try:
            user = json.loads(row["user_json"])
        except Exception:
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_hash,))
            conn.commit()
            return None

        return {"user": user, "user_id": row["user_id"]}
    finally:
        conn.close()


def delete_session(session_id):
    if not session_id:
        return
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM sessions WHERE id = ?",
            (hash_session_id(session_id),)
        )
        conn.commit()
    finally:
        conn.close()


def cleanup_expired_sessions():
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM sessions WHERE expires_at <= ?",
            (time.time(),)
        )
        conn.commit()
    finally:
        conn.close()


def check_rate_limit(session_id: str, action: str, limit: int) -> bool:
    return _rate_limit(f"{action}:{hash_session_id(session_id)}", limit)


def validate_same_origin(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return True
    return origin.rstrip("/") == APP_ORIGIN


# =========================================================
# ESTADOS OAUTH
# =========================================================

def clean_old_oauth_states():
    cutoff = time.time() - 600
    conn = get_connection()
    try:
        conn.execute("DELETE FROM oauth_states WHERE created_at <= ?", (cutoff,))
        conn.commit()
    finally:
        conn.close()


def store_oauth_state(state: str):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO oauth_states(state, created_at) VALUES (?, ?)",
            (state, time.time()),
        )
        conn.commit()
    finally:
        conn.close()


def consume_oauth_state(state: str):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT created_at FROM oauth_states WHERE state = ?",
            (state,),
        ).fetchone()
        if not row:
            return None
        conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
        conn.commit()
        return {"created_at": float(row["created_at"])}
    finally:
        conn.close()


# =========================================================
# LOGIN CON OSU!
# =========================================================

@app.get("/auth/login")
async def osu_login():

    print()
    print("========================================")
    print("🔐 INICIANDO LOGIN CON OSU!")
    print("========================================")

    # Limpiar states antiguos
    clean_old_oauth_states()

    # Crear state seguro
    state = secrets.token_urlsafe(32)

    store_oauth_state(state)

    # Parámetros OAuth
    params = {

        "client_id":
            int(OSU_CLIENT_ID),

        "redirect_uri":
            REDIRECT_URI,

        "response_type":
            "code",

        # public + identify
        "scope":
            "public identify",

        "state":
            state,
    }

    authorization_url = (
        f"{OSU_AUTHORIZE_URL}?{urlencode(params)}"
    )

    print("➡️ Redirigiendo a osu!")
    print("Callback:", REDIRECT_URI)
    print("========================================")
    print()

    response = RedirectResponse(
        url=authorization_url,
        status_code=302
    )

    # Guardamos state en cookie
    response.set_cookie(

        key="oauth_state",

        value=state,

        httponly=True,

        samesite="lax",

        secure=COOKIE_SECURE,

        max_age=600,
        path="/",
    )

    return response


# =========================================================
# CALLBACK DE OSU!
# =========================================================

@app.get("/auth/callback")
async def osu_callback(

    request: Request,

    code: str | None = None,

    state: str | None = None,

    error: str | None = None,
):

    print()
    print("========================================")
    print("🔐 CALLBACK DE OSU!")
    print("========================================")


    # =====================================================
    # ERROR DEVUELTO POR OSU
    # =====================================================

    if error:

        print("❌ osu! rechazó la autenticación")
        print("Error:", error)

        return JSONResponse(

            {"error": "osu! rechazó la autenticación"},

            status_code=400,
        )


    # =====================================================
    # VALIDAR CODE Y STATE
    # =====================================================

    if not code:

        print("❌ Falta el authorization code")

        return JSONResponse(

            {
                "error":
                    "Falta el parámetro code"
            },

            status_code=400,
        )


    if not state:

        print("❌ Falta el OAuth state")

        return JSONResponse(

            {
                "error":
                    "Falta el parámetro state"
            },

            status_code=400,
        )


    print("✅ Code recibido")
    print("✅ State recibido")


    # =====================================================
    # OBTENER STATE DE LA COOKIE
    # =====================================================

    cookie_state = request.cookies.get(
        "oauth_state"
    )


    if not cookie_state:

        print("❌ No existe cookie oauth_state")

        return JSONResponse(

            {
                "error":
                    "Falta la cookie OAuth state"
            },

            status_code=400,
        )


    # =====================================================
    # COMPARAR STATES
    # =====================================================

    if cookie_state != state:

        print("❌ OAuth state no coincide")

        return JSONResponse(

            {
                "error":
                    "OAuth state inválido"
            },

            status_code=400,
        )


    print("✅ OAuth state coincide")


    # =====================================================
    # COMPROBAR STATE EN MEMORIA
    # =====================================================

    state_data = consume_oauth_state(state)


    if not state_data:

        print("❌ OAuth state no encontrado")

        return JSONResponse(

            {
                "error":
                    "OAuth state expirado o inválido"
            },

            status_code=400,
        )


    # =====================================================
    # COMPROBAR EXPIRACIÓN
    # =====================================================

    created_at = state_data.get(
        "created_at",
        0
    )


    if time.time() - created_at > 600:

        # State is consumed on lookup; an expired state is simply rejected.

        print("❌ OAuth state expirado")

        return JSONResponse(

            {
                "error":
                    "OAuth state expirado"
            },

            status_code=400,
        )


    # =====================================================
    # STATE USADO
    # =====================================================

    print("✅ OAuth state válido")


    # =====================================================
    # INTERCAMBIAR CODE POR ACCESS TOKEN
    # =====================================================

    token_data = {

        "client_id":
            int(OSU_CLIENT_ID),

        "client_secret":
            OSU_CLIENT_SECRET,

        "code":
            code,

        "grant_type":
            "authorization_code",

        "redirect_uri":
            REDIRECT_URI,
    }


    print()
    print("🔄 Solicitando access token a osu!...")


    try:

        async with httpx.AsyncClient() as client:

            token_response = await client.post(

                OSU_TOKEN_URL,

                # osu! espera FORM DATA
                data=token_data,

                headers={

                    "Accept":
                        "application/json",

                    "Content-Type":
                        "application/x-www-form-urlencoded",
                },

                timeout=20,
            )


    except Exception as e:

        print()
        print("❌ ERROR CONECTANDO CON OSU!")
        print(str(e))

        return JSONResponse(

            {
                "error":
                    "Error conectando con osu!"
            },

            status_code=500,
        )


    # =====================================================
    # COMPROBAR RESPUESTA DEL TOKEN
    # =====================================================

    if token_response.status_code != 200:

        print()
        print("========================================")
        print("❌ ERROR OBTENIENDO ACCESS TOKEN")
        print("========================================")

        print(
            "Status:",
            token_response.status_code
        )

        print("========================================")
        print()

        logger.warning("osu token exchange failed with status %s", token_response.status_code)
        return JSONResponse(
            {"error": "No se pudo completar la autenticación con osu!"},
            status_code=400,
        )


    # =====================================================
    # LEER TOKEN
    # =====================================================

    try:

        token = token_response.json()

    except Exception:

        print(
            "❌ osu! devolvió una respuesta inválida"
        )

        return JSONResponse(

            {
                "error":
                    "Respuesta inválida de osu!"
            },

            status_code=400,
        )


    access_token = token.get(
        "access_token"
    )


    if not access_token:

        print(
            "❌ osu! no devolvió access_token"
        )

        return JSONResponse(

            {
                "error":
                    "osu! no devolvió access_token"
            },

            status_code=400,
        )


    print("✅ Access token obtenido")


    # =====================================================
    # OBTENER USUARIO
    # =====================================================

    print()
    print(
        "👤 Obteniendo información del usuario..."
    )


    user_headers = {

        "Authorization":
            f"Bearer {access_token}",

        "Accept":
            "application/json",
    }


    try:

        async with httpx.AsyncClient() as client:

            user_response = await client.get(

                OSU_ME_URL,

                headers=user_headers,

                timeout=20,
            )


    except Exception as e:

        print()
        print("❌ ERROR OBTENIENDO USUARIO")
        print(str(e))

        return JSONResponse(

            {
                "error":
                    "Error conectando con osu!"
            },

            status_code=500,
        )


    # =====================================================
    # COMPROBAR USUARIO
    # =====================================================

    if user_response.status_code != 200:

        print()
        print("========================================")
        print("❌ ERROR OBTENIENDO USUARIO")
        print("========================================")

        print(
            "Status:",
            user_response.status_code
        )

        logger.warning("osu user request failed with status %s", user_response.status_code)

        print("========================================")
        print()

        return JSONResponse(

            {
                "error":
                    "No se pudo obtener el usuario de osu!",

                "status":
                    user_response.status_code,
            },

            status_code=400,
        )


    # =====================================================
    # PARSEAR USUARIO
    # =====================================================

    try:

        user = user_response.json()

    except Exception:

        print(
            "❌ Respuesta de usuario inválida"
        )

        return JSONResponse(

            {
                "error":
                    "Respuesta inválida de osu!"
            },

            status_code=400,
        )


    # =====================================================
    # LOGIN EXITOSO
    # =====================================================

    print()
    print("========================================")
    print("🎉 LOGIN EXITOSO")
    print("========================================")

    print(
        "Usuario:",
        user.get("username")
    )

    print(
        "ID:",
        user.get("id")
    )

    print("========================================")
    print()


    # =====================================================
    # GUARDAR USUARIO EN SQLITE
    # =====================================================

    osu_id = user.get(
        "id"
    )

    username = user.get(
        "username"
    )

    avatar_url = user.get(
        "avatar_url"
    )


    # osu! devuelve country como objeto:
    #
    # {
    #     "code": "CO",
    #     "name": "Colombia"
    # }
    #
    # Guardamos solamente el código.

    country = None

    if isinstance(
        user.get("country"),
        dict
    ):

        country = user.get(
            "country",
            {}
        ).get(
            "code"
        )


    conn = get_connection()


    try:

        conn.execute(
            """
            INSERT INTO users (
                osu_id,
                username,
                avatar_url,
                country
            )
            VALUES (?, ?, ?, ?)

            ON CONFLICT(osu_id)
            DO UPDATE SET
                username = excluded.username,
                avatar_url = excluded.avatar_url,
                country = excluded.country
            """,

            (
                osu_id,
                username,
                avatar_url,
                country
            )
        )


        conn.commit()


        db_user = conn.execute(
            """
            SELECT id
            FROM users
            WHERE osu_id = ?
            """,

            (
                osu_id,
            )
        ).fetchone()


    finally:

        conn.close()


    print(
        "💾 Usuario guardado en SQLite"
    )

    print(
        "🆔 osu_id:",
        osu_id
    )

    print(
        "👤 username:",
        username
    )

    if db_user:

        print(
            "🗄️ ID interno:",
            db_user["id"]
        )


    # =====================================================
    # CREAR SESIÓN PERSISTENTE
    # =====================================================

    session_id = create_persistent_session(
        db_user["id"],
        user
    )


    # =====================================================
    # REDIRECCIÓN AL JUEGO
    # =====================================================

    response = RedirectResponse(

        url="/",

        status_code=302
    )


    # Cookie de sesión
    response.set_cookie(

        key="catchdle_session",

        value=session_id,

        httponly=True,

        samesite="lax",

        secure=COOKIE_SECURE,

        max_age=SESSION_MAX_AGE,
    )


    # Eliminar cookie OAuth
    response.delete_cookie(
        "oauth_state"
    )


    return response


# =========================================================
# USUARIO ACTUAL
# =========================================================

@app.get("/api/me")
async def get_current_user(

    request: Request
):

    session_id = request.cookies.get(
        "catchdle_session"
    )


    # =====================================================
    # NO LOGUEADO
    # =====================================================

    if not session_id:

        return {

            "logged_in":
                False,

            "user":
                None,
        }


    # =====================================================
    # BUSCAR SESIÓN
    # =====================================================

    session = get_session(
        session_id
    )


    if not session:

        return {

            "logged_in":
                False,

            "user":
                None,
        }


    # =====================================================
    # COMPROBAR SESIÓN
    # =====================================================

    user = session.get(
        "user"
    )


    if not user:

        return {

            "logged_in":
                False,

            "user":
                None,
        }


    # =====================================================
    # DEVOLVER INFORMACIÓN PÚBLICA
    # =====================================================

    return {

        "logged_in":
            True,

        "user": {

            "id":
                user.get("id"),

            "username":
                user.get("username"),

            "avatar_url":
                user.get("avatar_url"),

            "country":
                user.get("country"),

            "country_code":

                (
                    user.get("country")
                    or {}
                ).get("code")

                if isinstance(
                    user.get("country"),
                    dict
                )

                else None,
        },
    }
# =========================================================
# PROCESAR INTENTO
# =========================================================

# =========================================================
# SAFE GAME API
# =========================================================

MAX_ATTEMPTS = 10
CLUE_STATS_ATTEMPT = 4
CLUE_DIFFICULTY_ATTEMPT = 7
CLUE_BACKGROUND_ATTEMPT = 9
STAR_CLOSE_RANGE = 0.50
BPM_CLOSE_RANGE = 20
LENGTH_CLOSE_RANGE = 15


def search_map(map_data):
    """Metadata safe to expose before a guess is submitted.

    Numeric answer-comparison fields and clue values are intentionally omitted.
    """
    return {
        "beatmapset_id": int(map_data["beatmapset_id"]),
        "title": map_data.get("title", ""),
        "artist": map_data.get("artist", ""),
        "mapper": map_data.get("mapper", ""),
        "status": map_data.get("status", ""),
        "cover_url": map_data.get("cover_url")
            or f"https://assets.ppy.sh/beatmaps/{map_data['beatmapset_id']}/covers/cover.jpg",
        "url": map_data.get("url")
            or f"https://osu.ppy.sh/beatmapsets/{map_data['beatmapset_id']}",
    }


def public_map(map_data):
    """Full map metadata allowed after a guess or after the game ends."""
    if not map_data:
        return None
    return {
        **search_map(map_data),
        "stars": float(map_data.get("stars", 0) or 0),
        "bpm": float(map_data.get("bpm", 0) or 0),
        "duration": int(map_data.get("duration", 0) or 0),
        "beatmap_id": int(map_data.get("beatmap_id", 0) or 0),
        "difficulty_name": map_data.get("difficulty_name") or map_data.get("version", ""),
        "cs": float(map_data.get("cs", 0) or 0),
        "ar": float(map_data.get("ar", 0) or 0),
        "od": float(map_data.get("od", 0) or 0),
        "hp": float(map_data.get("hp", 0) or 0),
    }


def normalize_server(value):
    import unicodedata
    return "".join(
        c for c in unicodedata.normalize("NFD", str(value or "").lower())
        if unicodedata.category(c) != "Mn"
    ).strip()


def comparison_text(guess, answer):
    return "correct" if normalize_server(guess) == normalize_server(answer) else "wrong"


def comparison_number(value, answer, close_range):
    value = float(value or 0)
    answer = float(answer or 0)
    if abs(value - answer) < 0.001:
        return {"status": "correct", "arrow": ""}
    return {
        "status": "close" if abs(value - answer) <= close_range else "wrong",
        "arrow": "↑" if value < answer else "↓",
    }


def comparison_for(guess, answer):
    return {
        "artist": comparison_text(guess.get("artist"), answer.get("artist")),
        "mapper": comparison_text(guess.get("mapper"), answer.get("mapper")),
        "stars": comparison_number(guess.get("stars"), answer.get("stars"), STAR_CLOSE_RANGE),
        "bpm": comparison_number(guess.get("bpm"), answer.get("bpm"), BPM_CLOSE_RANGE),
        "length": comparison_number(guess.get("duration"), answer.get("duration"), LENGTH_CLOSE_RANGE),
    }


def _get_authenticated_session(request: Request):
    session = get_session(request.cookies.get("catchdle_session"))
    if not session or not session.get("user"):
        return None
    return session


@app.get("/api/search")
async def search_maps_api(request: Request):
    session = _get_authenticated_session(request)
    if not session:
        return JSONResponse({"error": "No has iniciado sesión"}, status_code=401)
    session_id = request.cookies.get("catchdle_session")
    if not check_rate_limit(session_id, "search", RATE_LIMIT_MAX_SEARCHES):
        return JSONResponse({"error": "Too many searches. Please wait a minute."}, status_code=429, headers={"Retry-After": str(RATE_LIMIT_WINDOW)})

    query = normalize_server(request.query_params.get("q", ""))[:80]
    if len(query) < 2:
        return {"success": True, "results": []}

    results = []
    for item in BEATMAPS:
        haystack = " ".join((
            normalize_server(item.get("title")),
            normalize_server(item.get("artist")),
            normalize_server(item.get("mapper")),
        ))
        if query in haystack:
            results.append(search_map(item))
            if len(results) >= 8:
                break
    return {"success": True, "results": results}


@app.get("/api/backgrounds")
async def get_backgrounds():
    daily = get_daily_map()
    daily_id = int(daily["beatmapset_id"]) if daily else -1
    candidates = [url for item, url in zip(BEATMAPS, BACKGROUND_COVERS) if int(item["beatmapset_id"]) != daily_id]
    return {"success": True, "backgrounds": random.sample(candidates, min(30, len(candidates)))}


@app.get("/api/game")
async def get_game_state(request: Request):
    session = _get_authenticated_session(request)
    if not session:
        return JSONResponse({"error": "No has iniciado sesión"}, status_code=401)
    session_id = request.cookies.get("catchdle_session")
    if not check_rate_limit(session_id, "game", RATE_LIMIT_MAX_GAME_READS):
        return JSONResponse({"error": "Too many requests. Please wait a minute."}, status_code=429, headers={"Retry-After": str(RATE_LIMIT_WINDOW)})

    today = today_colombia()
    daily = get_daily_map(today)
    if not daily:
        return JSONResponse({"error": "No se pudo determinar el mapa del día"}, status_code=500)

    conn = get_connection()
    try:
        db_user = conn.execute("SELECT id FROM users WHERE osu_id = ?", (session["user"].get("id"),)).fetchone()
        if not db_user:
            return JSONResponse({"error": "Usuario no encontrado"}, status_code=404)
        user_id = db_user["id"]
        rows = conn.execute(
            """SELECT attempt_number, beatmapset_id FROM daily_guesses
               WHERE user_id = ? AND date = ? ORDER BY attempt_number ASC""",
            (user_id, today),
        ).fetchall()
        result = conn.execute(
            """SELECT attempts, won, score FROM daily_results
               WHERE user_id = ? AND date = ?""",
            (user_id, today),
        ).fetchone()
    finally:
        conn.close()

    attempts = []
    for row in rows:
        guessed = BEATMAPS_BY_ID.get(int(row["beatmapset_id"]))
        if guessed:
            attempts.append({"map": public_map(guessed), "comparison": comparison_for(guessed, daily)})

    count = len(attempts)
    won = bool(result and result["won"])
    finished = won or count >= MAX_ATTEMPTS
    clues = {
        "stats": count >= CLUE_STATS_ATTEMPT,
        "difficulty": count >= CLUE_DIFFICULTY_ATTEMPT,
        "background": count >= CLUE_BACKGROUND_ATTEMPT,
    }
    payload = {
        "success": True, "date": today, "max_attempts": MAX_ATTEMPTS,
        "attempts": attempts, "won": won, "finished": finished,
        "score": int(result["score"]) if result else 0,
        "clues": clues, "clue_data": {}, "backgrounds": [],
    }
    if clues["stats"]:
        payload["clue_data"].update({
            "cs": float(daily.get("cs", 0) or 0), "ar": float(daily.get("ar", 0) or 0),
            "od": float(daily.get("od", 0) or 0), "hp": float(daily.get("hp", 0) or 0),
        })
    if clues["difficulty"]:
        payload["clue_data"]["difficulty_name"] = daily.get("difficulty_name") or daily.get("version", "Unknown")
    if clues["background"]:
        payload["clue_data"]["background_url"] = daily.get("background_url") or daily.get("bg_url") or public_map(daily)["cover_url"]
    if finished:
        payload["answer"] = public_map(daily)

    candidates = [url for item, url in zip(BEATMAPS, BACKGROUND_COVERS) if int(item["beatmapset_id"]) != int(daily["beatmapset_id"])]
    payload["backgrounds"] = random.sample(candidates, min(30, len(candidates)))
    return payload


@app.post("/api/guess")
async def process_guess(request: Request):
    if not validate_same_origin(request):
        return JSONResponse({"error": "Invalid request origin"}, status_code=403)

    session_id = request.cookies.get("catchdle_session")
    session = get_session(session_id)
    if not session or not session.get("user"):
        return JSONResponse({"error": "Sesión inválida"}, status_code=401)

    if not check_rate_limit(session_id, "guess", RATE_LIMIT_MAX_GUESSES):
        return JSONResponse({"error": "Too many guesses. Please wait a minute."}, status_code=429, headers={"Retry-After": str(RATE_LIMIT_WINDOW)})

    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "JSON inválido"}, status_code=400)
    if not isinstance(data, dict):
        return JSONResponse({"error": "JSON inválido"}, status_code=400)

    beatmapset_id = data.get("beatmapset_id")
    try:
        if isinstance(beatmapset_id, bool):
            raise ValueError
        beatmapset_id = int(beatmapset_id)
    except (TypeError, ValueError):
        return JSONResponse({"error": "beatmapset_id inválido"}, status_code=400)
    if beatmapset_id <= 0:
        return JSONResponse({"error": "beatmapset_id inválido"}, status_code=400)

    guessed_map = BEATMAPS_BY_ID.get(beatmapset_id)
    if not guessed_map:
        return JSONResponse({"error": "Beatmapset inválido"}, status_code=400)

    today = today_colombia()
    daily_map = get_daily_map(today)
    if not daily_map:
        return JSONResponse({"error": "No se pudo determinar el mapa del día"}, status_code=500)
    daily_beatmapset_id = int(daily_map["beatmapset_id"])
    user = session["user"]

    # =====================================================
    # BUSCAR USUARIO EN SQLITE
    # =====================================================

    conn = get_connection()

    try:

        db_user = conn.execute(
            """
            SELECT id
            FROM users
            WHERE osu_id = ?
            """,
            (user.get("id"),)
        ).fetchone()

        if not db_user:
            return JSONResponse(
                {
                    "error":
                        "Usuario no existe en la base de datos"
                },
                status_code=404
            )

        user_id = db_user["id"]

        # =================================================
        # BUSCAR PROGRESO DE HOY
        # =================================================

        existing = conn.execute(
            """
            SELECT
                attempts,
                won,
                score
            FROM daily_results
            WHERE user_id = ?
              AND date = ?
            """,
            (
                user_id,
                today
            )
        ).fetchone()

        # =================================================
        # COMPROBAR SI YA TERMINÓ
        # =================================================

        if existing:

            if existing["won"] == 1:
                return JSONResponse(
                    {
                        "success": True,
                        "already_finished": True,
                        "correct": True,
                        "attempts": existing["attempts"],
                        "score": existing["score"],
                        "finished": True
                    }
                )

            if existing["attempts"] >= MAX_ATTEMPTS:
                return JSONResponse(
                    {
                        "success": True,
                        "already_finished": True,
                        "correct": False,
                        "attempts": existing["attempts"],
                        "score": existing["score"],
                        "finished": True
                    }
                )

        # =================================================
        # CALCULAR NUEVO INTENTO
        # =================================================

        if existing:
            attempts = existing["attempts"] + 1
        else:
            attempts = 1

        # =================================================
        # COMPROBAR MAPA REPETIDO
        # =================================================

        already_guessed = conn.execute(
            """
            SELECT id
            FROM daily_guesses
            WHERE user_id = ?
              AND date = ?
              AND beatmapset_id = ?
            """,
            (
                user_id,
                today,
                beatmapset_id
            )
        ).fetchone()

        if already_guessed:
            return JSONResponse(
                {
                    "success": False,
                    "error":
                        "You already guessed this beatmap."
                },
                status_code=409
            )

        # =================================================
        # COMPROBAR RESPUESTA
        # =================================================

        correct = (
            beatmapset_id ==
            daily_beatmapset_id
        )

        # =================================================
        # GUARDAR INTENTO INDIVIDUAL
        # =================================================

        try:
            conn.execute(
                """
                INSERT INTO daily_guesses (
                    user_id,
                    date,
                    attempt_number,
                    beatmapset_id
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    user_id,
                    today,
                    attempts,
                    beatmapset_id
                )
            )

        except Exception as error:
            conn.rollback()

            print(
                "❌ Error guardando intento:",
                error
            )

            return JSONResponse(
                {
                    "success": False,
                    "error":
                        "No se pudo guardar el intento"
                },
                status_code=500
            )

        # =================================================
        # CALCULAR PUNTOS
        # =================================================

        score_table = {
            1: 100,
            2: 90,
            3: 80,
            4: 70,
            5: 60,
            6: 50,
            7: 40,
            8: 30,
            9: 20,
            10: 10
        }

        if correct:
            score = score_table.get(
                attempts,
                0
            )
            won = 1
        else:
            score = 0
            won = 0

        # =================================================
        # ACTUALIZAR RESULTADO DEL DÍA
        # =================================================

        conn.execute(
            """
            INSERT INTO daily_results (
                user_id,
                date,
                beatmapset_id,
                attempts,
                won,
                score
            )
            VALUES (?, ?, ?, ?, ?, ?)

            ON CONFLICT(user_id, date)
            DO UPDATE SET
                beatmapset_id =
                    excluded.beatmapset_id,
                attempts =
                    excluded.attempts,
                won =
                    excluded.won,
                score =
                    excluded.score,
                completed_at =
                    CURRENT_TIMESTAMP
            """,
            (
                user_id,
                today,
                daily_beatmapset_id,
                attempts,
                won,
                score
            )
        )

        conn.commit()

    finally:
        conn.close()

    # =====================================================
    # RESPUESTA
    # =====================================================

    finished = correct or attempts >= MAX_ATTEMPTS
    clues = {"stats": attempts >= CLUE_STATS_ATTEMPT, "difficulty": attempts >= CLUE_DIFFICULTY_ATTEMPT, "background": attempts >= CLUE_BACKGROUND_ATTEMPT}
    clue_data = {}
    if clues["stats"]:
        clue_data.update({"cs": float(daily_map.get("cs", 0) or 0), "ar": float(daily_map.get("ar", 0) or 0), "od": float(daily_map.get("od", 0) or 0), "hp": float(daily_map.get("hp", 0) or 0)})
    if clues["difficulty"]:
        clue_data["difficulty_name"] = daily_map.get("difficulty_name") or daily_map.get("version", "Unknown")
    if clues["background"]:
        clue_data["background_url"] = daily_map.get("background_url") or daily_map.get("bg_url") or public_map(daily_map)["cover_url"]
    payload = {"success": True, "correct": correct, "attempts": attempts, "won": bool(won), "score": score, "finished": finished, "clues": clues, "clue_data": clue_data, "attempt": {"map": public_map(guessed_map), "comparison": comparison_for(guessed_map, daily_map)}}
    if finished:
        payload["answer"] = public_map(daily_map)
    return payload


# =========================================================
# GUARDAR RESULTADO DIARIO
# =========================================================

# =========================================================
# ESTADÍSTICAS DEL USUARIO
# =========================================================

@app.get("/api/stats")
async def get_user_stats(request: Request):

    session_id = request.cookies.get("catchdle_session")

    if not session_id:
        return JSONResponse(
            {"error": "No has iniciado sesión"},
            status_code=401
        )

    session = get_session(session_id)

    if not session or not session.get("user"):
        return JSONResponse(
            {"error": "Sesión inválida"},
            status_code=401
        )

    osu_id = session["user"].get("id")

    conn = get_connection()

    try:
        user = conn.execute(
            """
            SELECT id, username, avatar_url, country
            FROM users
            WHERE osu_id = ?
            """,
            (osu_id,)
        ).fetchone()

        if not user:
            return JSONResponse(
                {"error": "Usuario no encontrado"},
                status_code=404
            )

        rows = conn.execute(
            """
            SELECT date, attempts, won, score
            FROM daily_results
            WHERE user_id = ?
            ORDER BY date ASC
            """,
            (user["id"],)
        ).fetchall()

    finally:
        conn.close()

    games = len(rows)
    wins = sum(1 for row in rows if row["won"] == 1)
    losses = games - wins
    total_points = sum(int(row["score"] or 0) for row in rows)

    win_rate = round((wins / games) * 100, 1) if games else 0.0

    winning_dates = {
        row["date"]
        for row in rows
        if row["won"] == 1
    }

    # Racha actual: solo existe si la última partida registrada
    # corresponde a hoy en Colombia y fue una victoria.
    from datetime import date, timedelta
    from zoneinfo import ZoneInfo

    current_streak = 0
    today_date = datetime.now(ZoneInfo("America/Bogota")).date()

    if winning_dates and today_date.isoformat() in winning_dates:
        cursor = today_date

        while cursor.isoformat() in winning_dates:
            current_streak += 1
            cursor -= timedelta(days=1)

    # Mejor racha histórica.
    best_streak = 0
    streak = 0
    previous = None

    for row in rows:
        if row["won"] != 1:
            streak = 0
            previous = None
            continue

        current = date.fromisoformat(row["date"])

        if previous is not None and current == previous + timedelta(days=1):
            streak += 1
        else:
            streak = 1

        best_streak = max(best_streak, streak)
        previous = current

    average_attempts = round(
        sum(
            int(row["attempts"])
            for row in rows
            if row["won"] == 1
        ) / wins,
        2
    ) if wins else 0.0

    return {
        "success": True,
        "user": {
            "username": user["username"],
            "avatar_url": user["avatar_url"],
            "country": user["country"]
        },
        "stats": {
            "total_points": total_points,
            "games": games,
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate,
            "current_streak": current_streak,
            "best_streak": best_streak,
            "average_attempts": average_attempts
        }
    }


# =========================================================
# LEADERBOARD
# =========================================================

@app.get("/api/leaderboard")
async def get_leaderboard():

    conn = get_connection()

    try:

        rows = conn.execute(
            """
            SELECT
                u.username,
                u.avatar_url,
                u.country,

                COALESCE(
                    SUM(dr.score),
                    0
                ) AS total_points,

                COUNT(dr.id) AS games,

                COALESCE(
                    SUM(
                        CASE
                            WHEN dr.won = 1
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS wins

            FROM users u

            LEFT JOIN daily_results dr
                ON dr.user_id = u.id

            GROUP BY u.id

            ORDER BY
                total_points DESC,
                wins DESC,
                games DESC,
                u.username ASC

            LIMIT 100
            """
        ).fetchall()

    finally:

        conn.close()


    leaderboard = []


    for rank, row in enumerate(
        rows,
        start=1
    ):

        games = row["games"]
        wins = row["wins"]

        win_rate = (
            round(
                (wins / games) * 100,
                1
            )
            if games > 0
            else 0
        )


        leaderboard.append({

            "rank":
                rank,

            "username":
                row["username"],

            "avatar_url":
                row["avatar_url"],

            "country":
                row["country"],

            "total_points":
                row["total_points"],

            "games":
                games,

            "wins":
                wins,

            "win_rate":
                win_rate

        })


    return {

        "success":
            True,

        "leaderboard":
            leaderboard

    }

 # =========================================================
# LOGOUT
# =========================================================

@app.get("/auth/logout")
async def logout(

    request: Request
):

    session_id = request.cookies.get(
        "catchdle_session"
    )


    # =====================================================
    # ELIMINAR SESIÓN
    # =====================================================

    if session_id:

        delete_session(session_id)


        print()
        print("👋 Usuario cerró sesión")
        print()


    # =====================================================
    # REDIRECCIONAR
    # =====================================================

    response = RedirectResponse(

        url="/",

        status_code=302
    )


    response.delete_cookie(
        "catchdle_session"
    )


    return response


# =========================================================
# FRONTEND
# =========================================================

app.mount(

    "/",

    StaticFiles(

        directory=str(WEB_DIR),

        html=True,
    ),

    name="web",
)