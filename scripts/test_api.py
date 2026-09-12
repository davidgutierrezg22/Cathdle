import os
import requests
from dotenv import load_dotenv

# Cargar las variables del archivo .env
load_dotenv()

client_id = os.getenv("OSU_CLIENT_ID")
client_secret = os.getenv("OSU_CLIENT_SECRET")

# Comprobar que las variables existen
if not client_id or not client_secret:
    print("❌ No se encontraron las credenciales en .env")
    exit()

# Solicitar un Access Token
url = "https://osu.ppy.sh/oauth/token"

data = {
    "client_id": client_id,
    "client_secret": client_secret,
    "grant_type": "client_credentials",
    "scope": "public"
}

response = requests.post(url, data=data)

if response.status_code == 200:
    token_data = response.json()

    print("✅ Conexión con osu! exitosa")
    print("✅ Access Token obtenido")
    print()
    print("Tipo:", token_data["token_type"])
    print("Expira en:", token_data["expires_in"], "segundos")

else:
    print("❌ Error al obtener el token")
    print("Código:", response.status_code)
    print("Respuesta:", response.text)