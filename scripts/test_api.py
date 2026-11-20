import os

import httpx
from dotenv import load_dotenv


def main():
    load_dotenv()
    client_id = os.getenv("OSU_CLIENT_ID")
    client_secret = os.getenv("OSU_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("Faltan las credenciales de osu! en .env")
        return 1

    try:
        response = httpx.post(
            "https://osu.ppy.sh/oauth/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials",
                "scope": "public",
            },
            timeout=15,
        )
        response.raise_for_status()
        token = response.json()
    except httpx.HTTPStatusError as error:
        print(f"osu! rechazó la solicitud (HTTP {error.response.status_code})")
        return 1
    except (httpx.RequestError, ValueError):
        print("No se pudo obtener una respuesta válida de osu!.")
        return 1

    if not isinstance(token, dict) or not token.get("access_token"):
        print("La respuesta de osu! no contiene un token.")
        return 1

    print("Conexión con osu! exitosa.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
