import os
import json
import time
import requests
from dotenv import load_dotenv

# ============================
# CONFIGURACIÓN
# ============================

load_dotenv()

CLIENT_ID = os.getenv("OSU_CLIENT_ID")
CLIENT_SECRET = os.getenv("OSU_CLIENT_SECRET")

DATA_FILE = "data/beatmaps.json"

TOKEN_URL = "https://osu.ppy.sh/oauth/token"
BEATMAP_URL = "https://osu.ppy.sh/api/v2/beatmaps"


# ============================
# OBTENER TOKEN
# ============================

def get_access_token():
    response = requests.post(
        TOKEN_URL,
        json={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "client_credentials",
            "scope": "public"
        }
    )

    response.raise_for_status()

    return response.json()["access_token"]


# ============================
# OBTENER DATOS DEL BEATMAP
# ============================

def get_beatmap(beatmap_id, headers):
    response = requests.get(
        f"{BEATMAP_URL}/{beatmap_id}",
        headers=headers
    )

    if response.status_code == 404:
        return None

    response.raise_for_status()

    return response.json()


# ============================
# PROGRAMA PRINCIPAL
# ============================

def main():

    print()
    print("============================")
    print("🍓 AÑADIENDO DATOS DE DIFICULTAD")
    print("============================")
    print()

    # Cargar base existente
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        beatmaps = json.load(file)

    print(f"🍓 Mapas encontrados: {len(beatmaps)}")
    print()

    # Obtener token
    print("🔑 Obteniendo Access Token...")

    token = get_access_token()

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    print("✅ Token obtenido")
    print()

    updated = 0
    errors = 0

    # ============================
    # PROCESAR CADA MAPA
    # ============================

    for index, map_data in enumerate(beatmaps, start=1):

        beatmap_id = map_data.get("beatmap_id")

        if not beatmap_id:
            print(f"⚠️ Sin beatmap_id: {map_data.get('title')}")
            errors += 1
            continue

        try:

            data = get_beatmap(beatmap_id, headers)

            if data is None:
                print(
                    f"⚠️ [{index}/{len(beatmaps)}] "
                    f"No encontrado: {beatmap_id}"
                )

                errors += 1
                continue

            # Verificar que sea CTB
            if data.get("mode") != "fruits":
                print(
                    f"⚠️ [{index}/{len(beatmaps)}] "
                    f"No es CTB: {beatmap_id}"
                )

                errors += 1
                continue

            # ============================
            # GUARDAR SOLO LA TOP DIFF
            # ============================

            map_data["difficulty_name"] = data.get("version")
            map_data["cs"] = data.get("cs")
            map_data["ar"] = data.get("ar")
            map_data["od"] = data.get("accuracy")
            map_data["hp"] = data.get("drain")

            updated += 1

            print(
                f"✅ [{index}/{len(beatmaps)}] "
                f"{map_data['title']} - "
                f"{map_data['difficulty_name']}"
            )

            # Guardado incremental
            if index % 25 == 0:

                with open(DATA_FILE, "w", encoding="utf-8") as file:
                    json.dump(
                        beatmaps,
                        file,
                        ensure_ascii=False,
                        indent=4
                    )

                print("💾 Progreso guardado")

            # Pequeña pausa para no saturar la API
            time.sleep(0.15)

        except requests.exceptions.RequestException as e:

            print(
                f"❌ Error API en {beatmap_id}: {e}"
            )

            errors += 1

        except Exception as e:

            print(
                f"❌ Error procesando {beatmap_id}: {e}"
            )

            errors += 1

    # ============================
    # GUARDAR RESULTADO FINAL
    # ============================

    with open(DATA_FILE, "w", encoding="utf-8") as file:
        json.dump(
            beatmaps,
            file,
            ensure_ascii=False,
            indent=4
        )

    print()
    print("============================")
    print("✅ PROCESO TERMINADO")
    print("============================")
    print()
    print(f"🍓 Mapas actualizados: {updated}")
    print(f"❌ Errores: {errors}")
    print()
    print(f"📁 Archivo: {DATA_FILE}")
    print()


if __name__ == "__main__":
    main()