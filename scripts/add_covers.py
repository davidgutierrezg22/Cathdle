import json


# --------------------------------------------------
# CONFIGURACIÓN
# --------------------------------------------------

DATABASE_FILE = "data/beatmaps.json"


# --------------------------------------------------
# CARGAR BASE DE DATOS
# --------------------------------------------------

with open(
    DATABASE_FILE,
    "r",
    encoding="utf-8"
) as file:

    beatmaps = json.load(file)


print()
print("🍓 AÑADIENDO PORTADAS")
print("============================")
print()

print(
    "Mapas encontrados:",
    len(beatmaps)
)


# --------------------------------------------------
# AÑADIR URLS DE PORTADA
# --------------------------------------------------

for beatmap in beatmaps:

    beatmapset_id = beatmap["beatmapset_id"]


    # ----------------------------------------------
    # PORTADA NORMAL
    # ----------------------------------------------

    beatmap["cover_url"] = (
        f"https://assets.ppy.sh/beatmaps/"
        f"{beatmapset_id}/covers/cover.jpg"
    )


    # ----------------------------------------------
    # PORTADA DE MAYOR RESOLUCIÓN
    # ----------------------------------------------

    beatmap["background_url"] = (
        f"https://assets.ppy.sh/beatmaps/"
        f"{beatmapset_id}/covers/cover@2x.jpg"
    )


# --------------------------------------------------
# GUARDAR
# --------------------------------------------------

with open(
    DATABASE_FILE,
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        beatmaps,
        file,
        ensure_ascii=False,
        indent=4
    )


# --------------------------------------------------
# RESULTADO
# --------------------------------------------------

print()
print("============================")
print("✅ PORTADAS AÑADIDAS")
print("============================")
print()

print(
    "🍓 Mapas actualizados:",
    len(beatmaps)
)

print()
print("📁 Archivo:")
print(DATABASE_FILE)

print()
print("🖼️ Portada normal:")
print("cover.jpg")

print()
print("🖼️ Fondo de mayor resolución:")
print("cover@2x.jpg")

print()
print("✅ Proceso terminado.")