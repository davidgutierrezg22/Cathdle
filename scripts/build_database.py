import os
import json
import time
import requests
from dotenv import load_dotenv


# --------------------------------------------------
# CONFIGURACIÓN
# --------------------------------------------------

load_dotenv()

CLIENT_ID = os.getenv("OSU_CLIENT_ID")
CLIENT_SECRET = os.getenv("OSU_CLIENT_SECRET")

API_URL = "https://osu.ppy.sh/api/v2"

# Esperar entre páginas para no hacer demasiadas
# solicitudes seguidas a la API.
DELAY_BETWEEN_PAGES = 1


# --------------------------------------------------
# OBTENER TOKEN
# --------------------------------------------------

def get_access_token():

    url = "https://osu.ppy.sh/oauth/token"

    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "client_credentials",
        "scope": "public"
    }

    response = requests.post(
        url,
        data=data
    )

    if response.status_code != 200:

        print("❌ Error obteniendo token")
        print("Código:", response.status_code)
        print(response.text)

        return None

    return response.json()["access_token"]


# --------------------------------------------------
# BUSCAR BEATMAPSETS
# --------------------------------------------------

def search_beatmapsets(token, cursor=None):

    url = f"{API_URL}/beatmapsets/search"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    params = {
        "mode": "catch"
    }

    # Si existe cursor, pedir siguiente página
    if cursor:

        params["cursor_string"] = cursor

    response = requests.get(
        url,
        headers=headers,
        params=params,
        timeout=30
    )

    if response.status_code != 200:

        print()
        print("❌ Error buscando beatmaps")
        print("Código:", response.status_code)
        print(response.text)

        return None

    return response.json()


# --------------------------------------------------
# PROCESAR UN BEATMAPSET
# --------------------------------------------------

def process_beatmapset(beatmapset):

    # --------------------------------------------------
    # ESTADO
    # --------------------------------------------------

    status = beatmapset.get("status")

    # Solo Ranked y Loved
    if status not in ["ranked", "loved"]:

        return None


    # --------------------------------------------------
    # BUSCAR DIFICULTADES CATCH
    # --------------------------------------------------

    catch_maps = []

    for beatmap in beatmapset.get("beatmaps", []):

        if beatmap.get("mode") == "fruits":

            catch_maps.append(beatmap)


    # Si no tiene dificultades CTB,
    # descartamos el beatmapset.

    if not catch_maps:

        return None


    # --------------------------------------------------
    # ELEGIR LA MAYOR DIFICULTAD CTB
    # --------------------------------------------------

    highest = max(
        catch_maps,
        key=lambda x: x.get(
            "difficulty_rating",
            0
        )
    )


    # --------------------------------------------------
    # CREAR ENTRADA DE NUESTRA BASE DE DATOS
    # --------------------------------------------------

    result = {

        "beatmapset_id":
            beatmapset.get("id"),

        "title":
            beatmapset.get("title"),

        "artist":
            beatmapset.get("artist"),

        "mapper":
            beatmapset.get("creator"),

        "status":
            status,

        "stars":
            highest.get("difficulty_rating"),

        "bpm":
            highest.get("bpm"),

        "duration":
            highest.get("total_length"),

        "beatmap_id":
            highest.get("id"),

        "url":
            f"https://osu.ppy.sh/beatmapsets/"
            f"{beatmapset.get('id')}"
    }

    return result


# --------------------------------------------------
# GUARDAR BASE DE DATOS
# --------------------------------------------------

def save_database(maps):

    os.makedirs(
        "data",
        exist_ok=True
    )

    with open(
        "data/beatmaps.json",
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            maps,
            file,
            ensure_ascii=False,
            indent=4
        )


# --------------------------------------------------
# PROGRAMA PRINCIPAL
# --------------------------------------------------

print()
print("🍓 CATCHDLE DATABASE BUILDER")
print("============================")
print()

print("🎯 Buscando TODOS los beatmapsets CTB")
print("🎯 Estados incluidos: Ranked + Loved")
print()


# --------------------------------------------------
# TOKEN
# --------------------------------------------------

token = get_access_token()

if not token:

    print("❌ No se pudo obtener el token.")
    exit()


print("✅ Token obtenido")
print()


# --------------------------------------------------
# VARIABLES
# --------------------------------------------------

database = []

seen_ids = set()

cursor = None

page = 0

total_beatmapsets = 0

ranked_count = 0

loved_count = 0


# --------------------------------------------------
# RECORRER TODAS LAS PÁGINAS
# --------------------------------------------------

while True:

    page += 1

    print()
    print(
        f"📄 Página {page}"
    )

    print(
        "----------------------------"
    )


    # --------------------------------------------------
    # SOLICITAR PÁGINA
    # --------------------------------------------------

    data = search_beatmapsets(
        token,
        cursor
    )


    if not data:

        print()
        print(
            "❌ No se pudo obtener esta página."
        )

        print(
            "🛑 Deteniendo proceso."
        )

        break


    beatmapsets = data.get(
        "beatmapsets",
        []
    )


    print(
        "📦 Beatmapsets recibidos:",
        len(beatmapsets)
    )


    total_beatmapsets += len(
        beatmapsets
    )


    # --------------------------------------------------
    # PROCESAR BEATMAPSETS
    # --------------------------------------------------

    for beatmapset in beatmapsets:

        result = process_beatmapset(
            beatmapset
        )


        # No es Ranked/Loved o no tiene CTB
        if not result:

            continue


        beatmapset_id = result[
            "beatmapset_id"
        ]


        # --------------------------------------------------
        # EVITAR DUPLICADOS
        # --------------------------------------------------

        if beatmapset_id in seen_ids:

            continue


        seen_ids.add(
            beatmapset_id
        )


        database.append(
            result
        )


        # --------------------------------------------------
        # CONTADORES
        # --------------------------------------------------

        if result["status"] == "ranked":

            ranked_count += 1

        elif result["status"] == "loved":

            loved_count += 1


        # --------------------------------------------------
        # MOSTRAR RESULTADO
        # --------------------------------------------------

        print(
            "✅",
            result["title"],
            "|",
            result["status"],
            "|",
            result["stars"],
            "⭐"
        )


    # --------------------------------------------------
    # GUARDAR PROGRESO
    # --------------------------------------------------

    save_database(
        database
    )


    print()
    print(
        f"💾 Progreso guardado: "
        f"{len(database)} mapas CTB"
    )


    # --------------------------------------------------
    # OBTENER CURSOR
    # --------------------------------------------------

    cursor = data.get(
        "cursor_string"
    )


    # --------------------------------------------------
    # ¿TERMINAMOS?
    # --------------------------------------------------

    if not cursor:

        print()
        print(
            "🏁 No hay más páginas disponibles."
        )

        break


    # --------------------------------------------------
    # ESPERAR ANTES DE CONTINUAR
    # --------------------------------------------------

    time.sleep(
        DELAY_BETWEEN_PAGES
    )


# --------------------------------------------------
# RESULTADO FINAL
# --------------------------------------------------

save_database(
    database
)


print()
print()
print("============================")
print("🍓 BASE DE DATOS COMPLETA")
print("============================")
print()

print(
    "📄 Páginas procesadas:",
    page
)

print(
    "📦 Beatmapsets consultados:",
    total_beatmapsets
)

print(
    "🍓 Mapas CTB guardados:",
    len(database)
)

print()
print(
    "🟢 Ranked:",
    ranked_count
)

print(
    "💗 Loved:",
    loved_count
)

print()
print(
    "📁 Archivo:"
)

print(
    "data/beatmaps.json"
)

print()
print(
    "✅ Proceso terminado."
)