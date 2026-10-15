"""Check size at the route; inspect the audio container before calling Gemini.

Header validation is not a full codec decoder. Gemini performs decoding.
No extension, path or client MIME type alone is trusted as proof of audio.
"""
from io import BytesIO
import wave

from app.services.assistant_service import AssistantFailure


def audio_mime(data: bytes, declared_type: str | None = None) -> str:
    if not data:
        raise AssistantFailure(422, "VALIDATION_ERROR", "El archivo de audio está vacío.", "file")

    mime = None
    aliases = set()
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        try:
            with wave.open(BytesIO(data), "rb") as recording:
                frames = recording.getnframes()
                size = frames * recording.getnchannels() * recording.getsampwidth()
                if not frames or len(recording.readframes(frames)) != size:
                    raise ValueError("Audio sin muestras o truncado.")
        except (wave.Error, EOFError, ValueError) as exc:
            raise AssistantFailure(
                422, "VALIDATION_ERROR", "El archivo WAV está vacío, dañado o no es PCM compatible.", "file",
            ) from exc
        mime = "audio/wav"
        aliases = {mime, "audio/x-wav", "audio/wave", "audio/vnd.wave"}
    elif data.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in data[:4096].lower():
        if b"A_OPUS" not in data and b"A_VORBIS" not in data:
            raise AssistantFailure(
                422, "VALIDATION_ERROR", "El archivo WebM no contiene una pista de audio reconocible.", "file",
            )
        mime = "audio/webm"
        aliases = {mime, "video/webm"}
    elif len(data) >= 16 and data[4:8] == b"ftyp":
        box_size = int.from_bytes(data[:4], "big")
        if not 16 <= box_size <= len(data) or b"soun" not in data:
            raise AssistantFailure(
                422, "VALIDATION_ERROR", "El archivo MP4/M4A está dañado o no contiene audio reconocible.", "file",
            )
        mime = "audio/m4a"
        aliases = {mime, "audio/mp4", "audio/x-m4a", "video/mp4"}
    else:
        # Locate MPEG Layer III frames after an optional ID3v2 tag.
        start = 0
        if data.startswith(b"ID3") and len(data) >= 10:
            if all(value < 128 for value in data[6:10]):
                start = 10 + sum(value << shift for value, shift in zip(data[6:10], (21, 14, 7, 0)))
                if data[5] & 0x10:
                    start += 10
        for index in range(start, min(start + 4096, len(data) - 3)):
            first, second, third = data[index:index + 3]
            if (first == 0xff and second & 0xe0 == 0xe0
                    and (second >> 3) & 3 != 1 and (second >> 1) & 3 == 1
                    and 0 < third >> 4 < 15 and (third >> 2) & 3 != 3):
                mime = "audio/mpeg"
                aliases = {mime, "audio/mp3", "audio/x-mp3", "audio/mpeg3"}
                break

    if mime is None:
        raise AssistantFailure(
            415, "UNSUPPORTED_MEDIA_TYPE", "Sube una grabación WebM, WAV, MP3 o MP4/M4A válida.", "file",
        )
    declared = (declared_type or "").split(";", 1)[0].strip().lower()
    if declared and declared != "application/octet-stream" and declared not in aliases:
        raise AssistantFailure(
            415, "UNSUPPORTED_MEDIA_TYPE", "El tipo declarado no coincide con el archivo de audio.", "file",
        )
    return mime
