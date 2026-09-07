# Aloud

A Chrome extension that reads web pages aloud, paired with a FastAPI backend for text-to-speech synthesis.

The extension extracts readable text from the active tab and sends it to the API, which detects the language, translates to English if needed, synthesizes speech with [Kokoro TTS](https://github.com/thewh1teagle/kokoro-onnx), and returns audio for inline playback or download.

> **Status:** proof of concept. This project demonstrates the end-to-end pipeline but isn't a polished, fully complete product — expect rough edges.

## Repo Layout

- [`extension/`](extension) — Chrome Manifest V3 client (TypeScript, esbuild). See [`extension/README.md`](extension/README.md).
- [`api/`](api) — FastAPI backend (Python, Kokoro TTS). See [`api/README.md`](api/README.md).

## How It Works

1. User triggers via the popup, context menu, or keyboard shortcut.
2. The background script asks the content script to extract page text (Mozilla Readability, with a heuristic DOM-scraping fallback).
3. The extension POSTs the text to `/synthesis` on the configured API.
4. The API detects the source language, translates to English if necessary, synthesizes speech with Kokoro TTS, and returns a base64-encoded WAV.
5. The extension plays the audio in a floating overlay player, or downloads the file.

## Quick Start

**API**

```bash
cd api
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 5000 --reload
# or: docker compose up
```

**Extension**

```bash
cd extension
npm install
npm run build
```

Then load `extension/dist` as an unpacked extension via `chrome://extensions` (Developer mode enabled).

Before using the extension, set `apiEndpoint` and `apiToken` on its options page. `s3Location` is only needed if you use cloud save mode.

## Testing

```bash
cd api && pytest
cd extension && npm run typecheck
```

## License

[MIT](LICENSE)
