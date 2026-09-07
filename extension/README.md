# Aloud Extension (Manifest V3)

Chrome extension that extracts readable page text and sends it to the Aloud API for text-to-speech synthesis.

## What it does

- Uses `@mozilla/readability` plus heuristic fallback scraping to extract page text.
- Sends extracted text to your configured API endpoint (`POST /synthesis`).
- Stores `apiEndpoint`, `apiToken`, `saveMode`, and optional `s3Location` in `chrome.storage.sync`.
- Plays the returned audio inline via a floating overlay player, or prompts for download.
- Supports popup action, context menu action, and keyboard shortcut (`run-processing` command).

## Build with Docker (preferred)

From repo root:

```bash
docker run --rm \
  -v "$PWD/extension":/workspace \
  -w /workspace \
  node:20-bookworm-slim \
  sh -lc "npm install && npm run build"
```

This keeps installs/artifacts in the repo at `extension/node_modules` and `extension/dist`.

## Build with Docker Compose

From `extension`:

```bash
docker compose run --rm extension-build
```

Watch mode:

```bash
docker compose run --rm extension-watch
```

## Build without Docker

```bash
npm install
npm run build       # esbuild bundle → dist/
npm run watch       # rebuild on file change
npm run typecheck   # tsc --noEmit
```

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `extension/dist`.
5. Open the extension's options page and set `apiEndpoint` and `apiToken` (required). Set `s3Location` if you use cloud save mode.

## API Contract

Request JSON (`POST /synthesis`):

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

Success response (`200`):

```json
{
  "ok": true,
  "message": "Generated English narration from page text.",
  "sourceLanguage": "en",
  "translated": false,
  "translatedText": "...",
  "audioBase64": "<base64 WAV>",
  "mimeType": "audio/wav",
  "fileName": "page-title.wav"
}
```

Failure response (`400` on empty/invalid text, `500` on synthesis errors):

```json
{
  "detail": "Reason"
}
```

The extension also tolerates a legacy `mediaUrl` / `mp4Base64` response shape, or a direct binary response, as fallbacks. See `extension/src/shared/contracts.ts` for the full type definitions.
