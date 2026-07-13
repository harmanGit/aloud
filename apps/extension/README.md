# Aloud Extension (Manifest V3)

Chrome extension that extracts readable page text and sends it to your API.

## What it does

- Uses `@mozilla/readability` plus fallback heuristics to extract page text.
- Sends extracted text to your configured API endpoint.
- Stores `apiEndpoint`, `apiToken`, and optional `s3Location` in extension storage.
- If API returns MP4 data (or media URL), asks for confirmation before local download.
- Supports popup action, context menu action, and keyboard shortcut (`Command+Shift+Y` on macOS).

## Build with Docker (preferred)

From repo root:

```bash
docker run --rm \
  -v "$PWD":/workspace \
  -w /workspace/apps/extension \
  node:20-bookworm-slim \
  sh -lc "npm install && npm run build"
```

This keeps installs/artifacts in the repo at `apps/extension/node_modules` and `apps/extension/dist`.

## Build with Docker Compose

From `apps/extension`:

```bash
docker compose run --rm extension-build
```

Watch mode:

```bash
docker compose run --rm extension-watch
```

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `apps/extension/dist`.

## Expected API contract (MVP)

Request JSON:

```json
{
  "title": "Page title",
  "url": "https://example.com/page",
  "text": "Extracted text",
  "s3Location": "s3://bucket/prefix" 
}
```

Possible responses:

- JSON success with URL:

```json
{
  "ok": true,
  "mediaUrl": "https://.../audio.mp4",
  "fileName": "optional-name.mp4"
}
```

- JSON success with base64 MP4:

```json
{
  "ok": true,
  "mp4Base64": "<base64>",
  "fileName": "optional-name.mp4"
}
```

- JSON failure:

```json
{
  "ok": false,
  "error": "Reason"
}
```

- Or direct binary `video/mp4` response.
