# API

FastAPI backend that accepts page text from the extension, translates it to English if necessary, synthesizes speech with Kokoro TTS, and returns a base64-encoded WAV.

## Key Files

- `src/main.py` — FastAPI app, `GET /health` and `POST /synthesis` endpoints
- `src/synthesis_request.py` — Pydantic `SynthesisRequest` model
- `src/kokoro_service.py` — all synthesis logic: language detection, translation, TTS, WAV encoding
- `requirements.txt` — pinned deps (fastapi, uvicorn, kokoro, deep-translator, langdetect, numpy)
- `Dockerfile` / `docker-compose.yml` — production container
- `Dockerfile.test` / `docker-compose.test.yml` — isolated test container

## Synthesis Pipeline (`kokoro_service.py`)

1. `flatten_text_payload` — joins `list[str]` blocks into a single string.
2. `translate_to_english` — detects language with `langdetect`; if not English, translates via `deep-translator` (Google Translate). Returns `(text, source_language, was_translated)`.
3. `synthesize_english_wav_base64` — splits text by newlines into paragraphs, calls `kokoro_onnx.Kokoro.create()` on each (voice from `KOKORO_VOICE` env var, default `af_heart`, lang `en-us`), concatenates float32 arrays, encodes as WAV, returns base64 string. Sample rate comes from the `create()` return value.
4. `build_output_filename` — sanitizes page title into a safe filename.

Both `Kokoro` and `GoogleTranslator` are cached with `@lru_cache(maxsize=1)` — they're expensive to initialize.

## Request Model

```python
class SynthesisRequest(BaseModel):
    title: str | None = None
    url: str | None = None
    text: str | list[str]       # required
    local_play: bool = False
    download: bool = False
    delivery: bool = False
    delivery_url: str | None = None
    delivery_token: str | None = None
```

When changing this model, update `extension/src/shared/contracts.ts` and `extension/src/background/index.ts` in sync.

## Response Shape

```json
{
  "ok": true,
  "message": "Generated English narration from page text.",
  "sourceLanguage": "<detected>",
  "translated": true,
  "translatedText": "<english text>",
  "audioBase64": "<base64 WAV>",
  "mimeType": "audio/wav",
  "fileName": "<sanitized-title>.wav"
}
```

400 on empty text or synthesis failure; 500 on unexpected errors.

## Environment Variables

- `KOKORO_VOICE` — Kokoro voice id (default: `af_heart`)
- `KOKORO_MODEL_PATH` — path to `kokoro-v1.0.onnx` (default: `models/kokoro-v1.0.onnx`)
- `KOKORO_VOICES_PATH` — path to `voices-v1.0.bin` (default: `models/voices-v1.0.bin`)

Model files are downloaded from GitHub releases at Docker build time (no Hugging Face dependency). They land in `/models/` in the production image. For local development, download them manually:

```bash
mkdir -p api/models
wget -q -O api/models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
wget -q -O api/models/voices-v1.0.bin   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

A quantized variant (`kokoro-v1.0.int8.onnx`, ~80 MB vs ~300 MB) is also available at the same release tag and can be swapped in via `KOKORO_MODEL_PATH` or the `KOKORO_MODEL_URL` Docker build arg.

## Commands

```bash
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 5000 --reload
docker compose up
pytest
docker compose -f docker-compose.test.yml run --rm api-test
```

## Testing Guidance

- Follow TDD for endpoint behavior, payload validation, and error handling.
- Keep tests direct and table-like; avoid overly abstract fixtures.
- Keep endpoint handlers thin — move non-trivial logic into `kokoro_service.py` where it can be tested independently.
- Prefer explicit response shapes over loosely structured payloads.
