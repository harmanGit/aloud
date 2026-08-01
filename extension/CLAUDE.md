# Extension

Chrome Manifest V3 extension that extracts readable page text and sends it to the API for text-to-speech synthesis. Built with TypeScript and bundled with esbuild.

## Key Files

- `manifest.json` — MV3 manifest; declares permissions, content scripts, background service worker, and `run-processing` keyboard command
- `build.mjs` — esbuild bundler script; outputs to `dist/`
- `src/background/index.ts` — service worker; orchestrates the full pipeline
- `src/content/index.ts` — injected into pages; handles extraction and audio playback
- `src/popup/index.ts` — popup UI trigger
- `src/options/index.ts` — options page for API settings
- `src/shared/contracts.ts` — shared TypeScript types and the cross-component API contract
- `src/shared/storage.ts` — `chrome.storage.sync` helpers for settings

## Architecture

The background script cannot touch the page DOM — all extraction and audio playback happen in the content script. The background script coordinates by messaging the content script.

### Pipeline (`background/index.ts`)

1. Trigger arrives via popup (`RUN_ACTIVE_TAB` message), context menu (`aloud-process-current-page`), or keyboard shortcut (`run-processing` command).
2. `requestExtraction(tabId)` sends `EXTRACT_PAGE` to the content script (injects `content.js` first if not already there).
3. `postToApi(extraction, mode, localPlay)` POSTs to `<apiEndpoint>/synthesis` with a Bearer token. Text is split on double-newlines before sending.
4. `processApiResponse(...)` handles three response shapes:
   - JSON with `audioBase64` (current API behavior — WAV)
   - JSON with `mp4Base64` or `mediaUrl` (legacy/future)
   - Binary `video/mp4` body (binary fallback)
5. For `localPlay`, sends `PLAY_AUDIO` to content script to render the floating player. Otherwise, prompts download via `CONFIRM_DOWNLOAD` + `chrome.downloads.download`.

### Content Script (`content/index.ts`)

**Extraction:**
- Clones the DOM, strips `script`, `style`, `nav`, `aside`, `footer`, etc.
- Runs Mozilla Readability (`charThreshold: 140`).
- Falls back to heuristic scraping (`article p, main p, p, h1, h2, h3, li`) if Readability yields fewer than 250 chars.
- Text is capped at `MAX_TEXT_CHARS` (80 000).
- Normalizes whitespace: collapses runs of spaces/tabs, trims excess blank lines.

**Audio player:**
- Fixed-position overlay (bottom-right, `z-index: 2147483647`), dark theme.
- Auto-plays on injection. Shows title label and a Close button.
- Cleans up object URLs and DOM element after 90 s idle, or 15 s after playback ends.

### Message Types (`contracts.ts`)

| Message type | Direction | Purpose |
|---|---|---|
| `RUN_ACTIVE_TAB` | popup → background | Start pipeline |
| `EXTRACT_PAGE` | background → content | Extract page text |
| `CONFIRM_DOWNLOAD` | background → content | Ask user to approve download |
| `PLAY_AUDIO` | background → content | Render inline audio player |
| `SHOW_ALERT` | background → content | Display alert in page |

## Cross-Component Contract

When changing the API request/response shape, update both:
- `src/shared/contracts.ts` (`ApiSuccess`, `ApiFailure`, `ApiPayload`)
- `../api/src/synthesis_request.py` (`SynthesisRequest`)

## Commands

```bash
npm install
npm run build       # esbuild bundle → dist/
npm run watch       # rebuild on file change
npm run typecheck   # tsc --noEmit
npm run clean       # rm -rf dist
docker compose run --rm extension-build
docker compose run --rm extension-watch
```

Load unpacked from `extension/dist` in `chrome://extensions` after building.

## Pitfalls

- Restricted URLs (`chrome://`, `chrome-extension://`, `edge://`, `about:`) block content script injection — the background script checks and throws a descriptive error.
- Settings (`apiEndpoint`, `apiToken`) must be set before any API call; `s3Location` is additionally required for cloud save mode.
- `isMissingReceiverError` handles the case where the content script isn't injected yet — background retries after injecting.

## Testing Guidance

- TDD for core extension behavior: extraction quality, request shaping, response handling.
- Prefer direct tests around pure helpers and contract serialization.
- UI changes (popup, options) don't need unit tests unless they contain non-trivial logic.
