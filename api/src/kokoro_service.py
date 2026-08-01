import base64
import io
import os
import re
import wave
from functools import lru_cache

import numpy as np
from deep_translator import GoogleTranslator
from kokoro_onnx import Kokoro
from langdetect import LangDetectException, detect

KOKORO_VOICE = os.getenv("KOKORO_VOICE", "af_heart")
KOKORO_MODEL_PATH = os.getenv("KOKORO_MODEL_PATH", "models/kokoro-v1.0.onnx")
KOKORO_VOICES_PATH = os.getenv("KOKORO_VOICES_PATH", "models/voices-v1.0.bin")


@lru_cache(maxsize=1)
def get_kokoro() -> Kokoro:
    return Kokoro(KOKORO_MODEL_PATH, KOKORO_VOICES_PATH)


@lru_cache(maxsize=1)
def get_translator() -> GoogleTranslator:
    return GoogleTranslator(source="auto", target="en")


def flatten_text_payload(text: str | list[str]) -> str:
    if isinstance(text, str):
        return text.strip()

    blocks = [block.strip() for block in text if block.strip()]
    return "\n\n".join(blocks)


def translate_to_english(text: str) -> tuple[str, str, bool]:
    try:
        source_language = detect(text)
    except LangDetectException:
        source_language = "unknown"

    if source_language == "en":
        return text, source_language, False

    translated = get_translator().translate(text)
    if translated and translated.strip():
        return translated.strip(), source_language, True

    return text, source_language, False


def pcm_to_wav_bytes(
    samples: np.ndarray,
    sample_rate: int,
) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    pcm16 = (clipped * 32767).astype(np.int16)

    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())

    return output.getvalue()


def synthesize_english_wav_base64(text: str) -> str:
    kokoro = get_kokoro()
    paragraphs = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: list[np.ndarray] = []
    sample_rate = 24_000
    for paragraph in paragraphs:
        samples, sample_rate = kokoro.create(
            paragraph,
            voice=KOKORO_VOICE,
            speed=1.0,
            lang="en-us",
        )
        chunks.append(np.asarray(samples, dtype=np.float32))

    if not chunks:
        raise ValueError("Kokoro did not generate audio output.")

    merged = np.concatenate(chunks)
    return base64.b64encode(pcm_to_wav_bytes(merged, sample_rate)).decode("ascii")


def build_output_filename(title: str | None, extension: str = "wav") -> str:
    if title is None:
        return f"aloud-output.{extension}"

    cleaned = re.sub(r"[^a-zA-Z0-9 _.-]", "", title)
    cleaned = re.sub(r"\s+", "-", cleaned.strip())
    cleaned = cleaned[:80]
    if not cleaned:
        cleaned = "aloud-output"

    return f"{cleaned}.{extension}"


def build_english_narration(
    text: str | list[str],
    title: str | None = None,
) -> dict[str, str | bool]:
    source_text = flatten_text_payload(text)
    if not source_text:
        raise ValueError("Request text is empty.")

    translated_text, source_language, was_translated = translate_to_english(
        source_text
    )
    audio_base64 = synthesize_english_wav_base64(translated_text)

    return {
        "source_language": source_language,
        "translated": was_translated,
        "translated_text": translated_text,
        "audio_base64": audio_base64,
        "file_name": build_output_filename(title),
    }
