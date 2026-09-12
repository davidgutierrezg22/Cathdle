import os
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("OSU_CLIENT_ID")
CLIENT_SECRET = os.getenv("OSU_CLIENT_SECRET")


# -------------------------------------------------
# 1. Obtener token
# -------------------------------------------------

def get_access_token():
    url = "https://osu.ppy.sh/oauth/token"

    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "client_credentials",
        "scope": "public"
    }

    response = requests.post(url, data=data)

    if response.status_code != 200:
        print("❌ Error obteniendo token")
        print(response.text)
        return None

    return response.json()["access_token"]


# -------------------------------------------------
# 2. Obtener beatmap
# -------------------------------------------------

def get_beatmap(beatmap_id, token):

    url = f"https://osu.ppy.sh/api/v2/beatmaps/{beatmap_id}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        print("❌ Error obteniendo beatmap")
        print("Código:", response.status_code)
        print(response.text)
        return None

    return response.json()


# -------------------------------------------------
# 3. Programa principal
# -------------------------------------------------

token = get_access_token()

if token:

    # ID de ejemplo
    beatmap_id = 1736279

    beatmap = get_beatmap(beatmap_id, token)

    if beatmap:

        print()
        print("🍓 BEATMAP ENCONTRADO")
        print("-----------------------------")

        print("ID:", beatmap["id"])
        print("Título:", beatmap["beatmapset"]["title"])
        print("Artista:", beatmap["beatmapset"]["artist"])
        print("Mapper:", beatmap["beatmapset"]["creator"])

        print("Modo:", beatmap["mode"])
        print("Stars:", beatmap["difficulty_rating"])
        print("BPM:", beatmap["bpm"])
        print("Duración:", beatmap["total_length"], "segundos")

        print("-----------------------------")