import { Readability } from "@mozilla/readability";
import type { CachedAudio, ExtractionResponse, RuntimeRequest } from "../shared/contracts";

const MAX_TEXT_CHARS = 80000;
const PLAYER_CLEANUP_TIMEOUT_MS = 90_000;
const PLAYER_POST_END_CLEANUP_MS = 15_000;

let activePlayerContainer: HTMLDivElement | null = null;
let activeAudioUrl: string | null = null;
let activeCleanupTimer: number | null = null;
let cachedAudio: CachedAudio | null = null;

const THEME_STORAGE_KEY = "aloud.theme";

async function getStoredTheme(): Promise<"light" | "dark" | null> {
    try {
        const data = await chrome.storage.sync.get(THEME_STORAGE_KEY);
        const raw = data[THEME_STORAGE_KEY];
        if (raw === "light" || raw === "dark") return raw;
        return null;
    } catch {
        return null;
    }
}

function applyThemeToPlayer(theme: "light" | "dark" | null): void {
    const player = document.getElementById("aloud-player");
    if (!player) return;
    if (theme) {
        player.dataset.theme = theme;
    } else {
        delete player.dataset.theme;
    }
}

function injectPlayerStyles(): void {
    if (document.getElementById("aloud-player-styles")) {
        return;
    }
    const style = document.createElement("style");
    style.id = "aloud-player-styles";
    // Dark styles are applied via [data-theme="dark"] (explicit user choice) or
    // via @media when no explicit theme is set (system preference fallback).
    style.textContent = `
        #aloud-player {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483647;
            width: 320px;
            padding: 14px 16px 16px;
            box-sizing: border-box;
            background: rgba(255, 248, 243, 0.96);
            border: 1px solid #f8c3b2;
            border-radius: 18px;
            box-shadow:
                0 16px 34px rgba(86, 108, 142, 0.18),
                0 4px 10px rgba(122, 141, 171, 0.12);
            font-family: "Avenir Next", "Nunito", "Trebuchet MS", sans-serif;
            color: #3e2f33;
            animation: aloud-float 4.2s ease-in-out infinite;
        }
        @keyframes aloud-float {
            0%, 100% { transform: translateY(0); }
            50%       { transform: translateY(-4px); }
        }
        #aloud-player .aloud-label {
            display: block;
            margin: 0 0 10px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: #73565f;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        #aloud-player audio {
            display: block;
            width: 100%;
        }
        #aloud-player .aloud-close {
            display: block;
            width: 100%;
            margin-top: 10px;
            padding: 7px 12px;
            box-sizing: border-box;
            border: 1px solid #c28b88;
            border-radius: 10px;
            background: #fff4ee;
            color: #7e4748;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            font-family: inherit;
            text-align: center;
            transition: background-color 120ms ease, transform 120ms ease;
        }
        #aloud-player .aloud-close:hover {
            background: #ffe7dd;
            transform: translateY(-1px);
        }

        #aloud-player[data-theme="dark"] {
            background: rgba(40, 47, 73, 0.96);
            border-color: #515b87;
            color: #eef0ff;
        }
        #aloud-player[data-theme="dark"] .aloud-label { color: #c7cbed; }
        #aloud-player[data-theme="dark"] .aloud-close {
            border-color: #8f9cff;
            background: #3a4570;
            color: #dde3ff;
        }
        #aloud-player[data-theme="dark"] .aloud-close:hover { background: #445186; }

        @media (prefers-color-scheme: dark) {
            #aloud-player:not([data-theme="light"]) {
                background: rgba(40, 47, 73, 0.96);
                border-color: #515b87;
                color: #eef0ff;
            }
            #aloud-player:not([data-theme="light"]) .aloud-label { color: #c7cbed; }
            #aloud-player:not([data-theme="light"]) .aloud-close {
                border-color: #8f9cff;
                background: #3a4570;
                color: #dde3ff;
            }
            #aloud-player:not([data-theme="light"]) .aloud-close:hover { background: #445186; }
        }
    `;
    document.documentElement.appendChild(style);
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && THEME_STORAGE_KEY in changes) {
        const raw = changes[THEME_STORAGE_KEY].newValue;
        applyThemeToPlayer(raw === "light" || raw === "dark" ? raw : null);
    }
});

function normalizeText(input: string): string {
    return input
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function fallbackExtraction(): string {
    const candidates = Array.from(
        document.querySelectorAll("article p, main p, p, h1, h2, h3, li")
    );

    const unique = new Set<string>();
    for (const node of candidates) {
        const text = normalizeText((node as HTMLElement).innerText || "");
        if (text.length < 25) {
            continue;
        }
        unique.add(text);
        if (Array.from(unique).join("\n\n").length > MAX_TEXT_CHARS) {
            break;
        }
    }

    return normalizeText(Array.from(unique).join("\n\n")).slice(0, MAX_TEXT_CHARS);
}

function clearPlayerArtifacts(): void {
    if (activeCleanupTimer !== null) {
        window.clearTimeout(activeCleanupTimer);
        activeCleanupTimer = null;
    }

    if (activePlayerContainer) {
        activePlayerContainer.remove();
        activePlayerContainer = null;
    }

    if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = null;
    }
}

function decodeBase64ToObjectUrl(base64: string, mimeType: string): string {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
}

function renderAudioPlayer(sourceUrl: string, label: string, theme: "light" | "dark" | null): HTMLAudioElement {
    clearPlayerArtifacts();
    injectPlayerStyles();

    const container = document.createElement("div");
    container.id = "aloud-player";
    if (theme) {
        container.dataset.theme = theme;
    }

    const title = document.createElement("span");
    title.className = "aloud-label";
    title.textContent = label;

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.autoplay = true;
    audio.src = sourceUrl;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "aloud-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => clearPlayerArtifacts());

    container.appendChild(title);
    container.appendChild(audio);
    container.appendChild(closeButton);
    document.documentElement.appendChild(container);

    activePlayerContainer = container;

    return audio;
}

async function playAudioInPage(request: RuntimeRequest): Promise<ExtractionResponse> {
    if (request.type !== "PLAY_AUDIO") {
        return { ok: false, error: "Invalid playback request." };
    }

    const mimeType = request.mimeType || "audio/wav";
    const label = request.fileName || "Generated audio";

    let generatedObjectUrl: string | null = null;
    let sourceUrl: string;
    if (request.audioUrl) {
        sourceUrl = request.audioUrl;
    } else if (request.audioBase64) {
        sourceUrl = decodeBase64ToObjectUrl(request.audioBase64, mimeType);
        generatedObjectUrl = sourceUrl;
    } else {
        return { ok: false, error: "Missing audio payload." };
    }

    const theme = await getStoredTheme();
    const audioElement = renderAudioPlayer(sourceUrl, label, theme);
    if (generatedObjectUrl) {
        activeAudioUrl = generatedObjectUrl;
    }

    const scheduleCleanup = (ms: number) => {
        if (activeCleanupTimer !== null) {
            window.clearTimeout(activeCleanupTimer);
        }
        activeCleanupTimer = window.setTimeout(() => clearPlayerArtifacts(), ms);
    };

    scheduleCleanup(PLAYER_CLEANUP_TIMEOUT_MS);

    audioElement.addEventListener("ended", () => {
        scheduleCleanup(PLAYER_POST_END_CLEANUP_MS);
    });

    // Attempt autoplay; keep the player visible even if the browser blocks it.
    // The user can click the native audio controls to start manually.
    audioElement.play().catch(() => {});

    return {
        ok: true,
        data: {
            title: document.title,
            url: window.location.href,
            text: "",
            charCount: 0
        }
    };
}

function extractReadableText(): ExtractionResponse {
    const clone = document.cloneNode(true) as Document;
    const removable = clone.querySelectorAll(
        "script, style, noscript, iframe, svg, canvas, nav, aside, footer"
    );
    removable.forEach((node) => node.remove());

    const article = new Readability(clone, {
        charThreshold: 140,
        keepClasses: false
    }).parse();

    const readable = normalizeText(article?.textContent ?? "");
    const fallback = fallbackExtraction();
    const text = (readable.length >= 250 ? readable : fallback).slice(0, MAX_TEXT_CHARS);

    if (!text) {
        return {
            ok: false,
            error: "Could not extract meaningful text from this page."
        };
    }

    return {
        ok: true,
        data: {
            title: normalizeText(document.title || article?.title || "Untitled"),
            url: window.location.href,
            text,
            charCount: text.length
        }
    };
}

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
    if (request.type === "EXTRACT_PAGE") {
        try {
            sendResponse(extractReadableText());
        } catch (error) {
            sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : "Unexpected extraction error."
            } as ExtractionResponse);
        }
        return;
    }

    if (request.type === "GET_CACHED_AUDIO") {
        sendResponse({ ok: cachedAudio !== null, data: cachedAudio });
        return;
    }

    if (request.type === "CONFIRM_DOWNLOAD") {
        const accepted = window.confirm(
            `Download "${request.fileName}"?`
        );
        sendResponse({ ok: accepted, message: accepted ? "Download approved." : "Download canceled." });
        return;
    }

    if (request.type === "SHOW_ALERT") {
        window.alert(request.message);
        sendResponse({ ok: true, message: "Displayed alert." });
        return;
    }

    if (request.type === "PLAY_AUDIO") {
        if (request.audioBase64 && request.mimeType && request.fileName) {
            cachedAudio = {
                audioBase64: request.audioBase64,
                mimeType: request.mimeType,
                fileName: request.fileName
            };
        }
        playAudioInPage(request)
            .then((result) => {
                sendResponse({
                    ok: result.ok,
                    message: result.ok
                        ? "Audio playback started."
                        : result.error || "Failed to start audio playback."
                });
            })
            .catch((error) => {
                sendResponse({
                    ok: false,
                    message:
                        error instanceof Error
                            ? error.message
                            : "Failed to start audio playback."
                });
            });
        return true;
    }
});