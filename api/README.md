# Aloud API

FastAPI backend that accepts page text from the [Aloud extension](../extension), translates it to English if necessary, synthesizes speech with [Kokoro TTS](https://github.com/thewh1teagle/kokoro-onnx), and returns a base64-encoded WAV.

## Endpoints

- `GET /health` — liveness check.
- `POST /synthesis` — accepts a `SynthesisRequest` payload and returns synthesized audio.

### Request

```json
{
  "title": "Page title",
  "url": "https://example.com/page",
  "text": ["Paragraph one.", "Paragraph two."],
  "local_play": false,
  "download": true,
  "delivery": false,
  "delivery_url": null,
  "delivery_token": null
}
```

`text` may be a single string or a list of strings; only `text` is required. See `src/synthesis_request.py` for the full model.

### Response

`200`:

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

`400` on empty/invalid text, `500` on unexpected synthesis errors — both return FastAPI's standard `{"detail": "..."}` shape.

## Synthesis Pipeline

Implemented in `src/kokoro_service.py`:

1. Flatten the `text` payload (list or string) into one string.
2. Detect language with `langdetect`; translate to English via `deep-translator` (Google Translate) if needed.
3. Split into paragraphs, synthesize each with Kokoro (`KOKORO_VOICE`, default `af_heart`), concatenate, and encode as WAV.
4. Sanitize the page title into a safe output filename.

## Run Locally

```bash
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 5000 --reload
```

Kokoro needs its model files available locally:

```bash
mkdir -p models
wget -q -O models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
wget -q -O models/voices-v1.0.bin   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

## Run with Docker

```bash
docker compose up
```

The production image downloads model files from GitHub releases at build time — see `Dockerfile`.

## Environment Variables

- `KOKORO_VOICE` — Kokoro voice id (default: `af_heart`)
- `KOKORO_MODEL_PATH` — path to `kokoro-v1.0.onnx` (default: `models/kokoro-v1.0.onnx`)
- `KOKORO_VOICES_PATH` — path to `voices-v1.0.bin` (default: `models/voices-v1.0.bin`)

## Testing

```bash
pytest
# or, fully containerized:
docker compose -f docker-compose.test.yml run --rm api-test
```
