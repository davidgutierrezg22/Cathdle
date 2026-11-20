from functools import lru_cache
from io import BytesIO

import httpx
from PIL import Image

# Each accepted miss reveals more of the same area. At the end show the whole image.
ZOOM = (12, 8, 6, 4.5, 3.5, 2.8, 2.2, 1.75, 1.45, 1.2, 1)


@lru_cache(maxsize=4)
def source_image(map_id):
    base = f"https://assets.ppy.sh/beatmaps/{map_id}/covers/"
    with httpx.Client(timeout=10) as client:
        for name in ("cover@2x.jpg", "cover.jpg"):
            response = client.get(base + name)
            if response.status_code == 404 and name == "cover@2x.jpg":
                continue
            response.raise_for_status()
            with Image.open(BytesIO(response.content)) as image:
                return image.convert("RGB")


@lru_cache(maxsize=32)
def render_background(map_id, step):
    image = source_image(map_id)
    zoom = ZOOM[min(step, len(ZOOM) - 1)]
    # Start on a small, nearly square detail even when the cover is a wide banner.
    height = max(1, round(image.height / zoom))
    width = max(1, round(image.width / zoom ** 1.35))
    left = (image.width - width) // 2
    top = (image.height - height) // 2
    crop = image.crop((left, top, left + width, top + height))
    scale = min(1000 / width, 540 / height)
    crop = crop.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.LANCZOS)
    output = BytesIO()
    crop.save(output, format="JPEG", quality=88)
    return output.getvalue()
