import base64

import numpy as np
from fastapi.testclient import TestClient

from src import kokoro_service
from src import main


def test_flatten_text_payload_from_list():
    payload = ["  first paragraph  ", "", "second paragraph"]

    assert (
        kokoro_service.flatten_text_payload(payload)
        == "first paragraph\n\nsecond paragraph"
    )


def test_translate_to_english_skips_when_language_is_english(monkeypatch):
    monkeypatch.setattr(kokoro_service, "detect", lambda _text: "en")

    translated, source_language, was_translated = (
        kokoro_service.translate_to_english("Already English")
    )

    assert translated == "Already English"
    assert source_language == "en"
    assert not was_translated


def test_translate_to_english_uses_translator_for_non_english(monkeypatch):
    class FakeTranslator:
        def translate(self, text: str) -> str:
            assert text == "Hola mundo"
            return "Hello world"

    monkeypatch.setattr(kokoro_service, "detect", lambda _text: "es")
    monkeypatch.setattr(
        kokoro_service,
        "get_translator",
        lambda: FakeTranslator(),
    )

    translated, source_language, was_translated = (
        kokoro_service.translate_to_english("Hola mundo")
    )

    assert translated == "Hello world"
    assert source_language == "es"
    assert was_translated


def test_pcm_to_wav_bytes_generates_wav_header():
    samples = np.array([0.0, 0.1, -0.1, 0.5], dtype=np.float32)

    wav_bytes = kokoro_service.pcm_to_wav_bytes(samples, 24_000)

    assert wav_bytes[:4] == b"RIFF"
    assert len(wav_bytes) > 44


def test_synthesize_english_wav_base64_builds_wav(monkeypatch):
    class FakeKokoro:
        def create(self, text: str, voice: str, speed: float, lang: str):
            assert voice
            assert speed == 1.0
            assert lang == "en-us"
            return (np.array([0.0, 0.2, -0.2, 0.1, -0.1], dtype=np.float32), 24_000)

    monkeypatch.setattr(kokoro_service, "get_kokoro", lambda: FakeKokoro())

    encoded = kokoro_service.synthesize_english_wav_base64("Hello world")
    decoded = base64.b64decode(encoded)

    assert decoded[:4] == b"RIFF"


def test_build_output_filename_uses_article_title():
    file_name = kokoro_service.build_output_filename("A Great Article: 2026")

    assert file_name == "A-Great-Article-2026.wav"


def test_build_output_filename_falls_back_when_title_missing():
    file_name = kokoro_service.build_output_filename(None)

    assert file_name == "aloud-output.wav"


def test_synthesis_endpoint_calls_service(monkeypatch):
    client = TestClient(main.app)

    monkeypatch.setattr(
        main,
        "build_english_narration",
        lambda _text, _title: {
            "source_language": "es",
            "translated": True,
            "translated_text": "Hello world",
            "audio_base64": "abc123",
            "file_name": "my-article.wav",
        },
    )

    response = client.post(
        "/synthesis",
        json={"title": "My Article", "text": "Hola mundo"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["sourceLanguage"] == "es"
    assert payload["translated"] is True
    assert payload["translatedText"] == "Hello world"
    assert payload["audioBase64"] == "abc123"
    assert payload["fileName"] == "my-article.wav"
