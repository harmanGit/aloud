# Aloud

A Chrome MV3 extension + FastAPI backend that reads web pages aloud. The extension extracts readable text from the active tab, sends it to the API, which detects the language, translates to English if needed (via Google Translate), synthesizes speech with Kokoro TTS, and returns a base64-encoded WAV. The extension plays it inline via a floating audio player or downloads it.

## Repo Layout

- `extension/` — Chrome Manifest V3 client (TypeScript, esbuild)
- `api/` — FastAPI backend (Python, Kokoro TTS)

## End-to-End Flow

1. User triggers via popup, context menu, or keyboard shortcut (`run-processing` command).
2. Background script sends `EXTRACT_PAGE` to content script.
3. Content script runs Mozilla Readability; falls back to heuristic DOM scraping. Text capped at 80 000 chars.
4. Background POSTs to `/synthesis` with `title`, `url`, `text[]`, and mode flags.
5. API detects language → translates to English → Kokoro TTS → returns `audioBase64` (WAV) + metadata.
6. Extension plays audio in a fixed-position overlay player, or downloads the file.

## Cross-Component Contract

The request/response shape is a shared contract — change both sides together:

- Extension side: `extension/src/shared/contracts.ts` (`ApiSuccess`, `SynthesisRequest` body shape)
- API side: `api/src/synthesis_request.py` (`SynthesisRequest` Pydantic model)

API response fields the extension reads: `ok`, `audioBase64`, `mimeType`, `fileName`, `mediaUrl`, `mp4Base64`, `message`.

## Common Commands

```bash
# API
cd api && uvicorn src.main:app --host 0.0.0.0 --port 5000 --reload
cd api && docker compose up
cd api && pytest
cd api && docker compose -f docker-compose.test.yml run --rm api-test

# Extension
cd extension && npm install && npm run build
cd extension && npm run watch
cd extension && npm run typecheck
cd extension && npm run clean
```

Load the unpacked extension from `extension/dist` in `chrome://extensions` after building.

## Working Rules

- Keep changes scoped to one component unless the cross-component contract changes.
- When the contract changes, update both `contracts.ts` and `synthesis_request.py` together.
- Prefer small, readable functions and straightforward control flow.
- TDD mindset for core behavior: write or update tests near the logic change, then implement.
- Not every change needs a unit test — prioritize endpoint behavior, payload validation, and error handling.
- If a behavior is hard to test, simplify the design before adding test complexity.

## Settings Required Before Use

- `apiEndpoint` and `apiToken` must be set in extension options before any API call is made.
- `s3Location` is required only when `saveMode` is `"cloud"`.
