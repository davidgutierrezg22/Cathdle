import os
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("OSU_CLIENT_ID")
CLIENT_SECRET = os.getenv("OSU_CLIENT_SECRET")


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


def search_beatmaps(token):

    url = "https://osu.ppy.sh/api/v2/beatmapsets/search"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    # Primera prueba:
    # solo mapas de osu!catch
    params = {
        "mode": "catch"
    }

    response = requests.get(
        url,
        headers=headers,
        params=params
    )

    print("URL consultada:")
    print(response.url)
    print()

    print("Código:", response.status_code)

    if response.status_code != 200:
        print("❌ Error buscando beatmaps")
        print(response.text)
        return None

    return response.json()


# -----------------------------------------
# Programa principal
# -----------------------------------------

token = get_access_token()

if token:

    data = search_beatmaps(token)

    if data:

        print()
        print("🍓 PRIMER BEATMAPSET")
        print("-----------------------------")

        beatmapsets = data.get("beatmapsets", [])

        if beatmapsets:

            primer_mapa = beatmapsets[0]

            print("ID:", primer_mapa.get("id"))
            print("Título:", primer_mapa.get("title"))
            print("Artista:", primer_mapa.get("artist"))
            print("Mapper:", primer_mapa.get("creator"))
            print("Estado:", primer_mapa.get("status"))

            print()
            print("🔎 DIFICULTADES:")

            for beatmap in primer_mapa.get("beatmaps", []):

                print(
                    "ID:", beatmap.get("id"),
                    "|",
                    "Modo:", beatmap.get("mode"),
                    "|",
                    "Stars:", beatmap.get("difficulty_rating"),
                    "|",
                    "BPM:", beatmap.get("bpm"),
                    "|",
                    "Duración:", beatmap.get("total_length")
                )