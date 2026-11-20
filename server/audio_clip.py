from io import BytesIO
import subprocess
import wave

import httpx
from imageio_ffmpeg import get_ffmpeg_exe

STAGES = (1, 2, 4, 6, 8, 10)
SAMPLE_RATE = 22050


def fetch_preview(map_id):
    response = httpx.get(f"https://b.ppy.sh/preview/{map_id}.mp3", timeout=8, follow_redirects=True)
    if response.status_code in (404, 410):
        return None
    response.raise_for_status()
    try:
        decoded = subprocess.run(
            [get_ffmpeg_exe(), "-v", "error", "-protocol_whitelist", "pipe", "-i", "pipe:0",
             "-t", str(STAGES[-1]), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "pipe:1"],
            input=response.content, capture_output=True, timeout=12,
        )
    except subprocess.TimeoutExpired as error:
        raise TimeoutError("Audio conversion timed out") from error
    if decoded.returncode or len(decoded.stdout) < SAMPLE_RATE * 2 * STAGES[-1]:
        return None
    return decoded.stdout


def wav_clip(pcm, seconds):
    result = BytesIO()
    with wave.open(result, "wb") as output:
        output.setparams((1, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
        output.writeframes(pcm[:seconds * SAMPLE_RATE * 2])
    return result.getvalue()
