import type {
    ApiPayload,
    CachedAudio,
    ExtractionResponse,
    RuntimeRequest,
    RuntimeResponse,
    SaveMode,
    TriggerSource
} from "../shared/contracts";
import { getSettings } from "../shared/storage";

const CONTEXT_MENU_ID = "aloud-process-current-page";

function isMissingReceiverError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    return error.message.includes("Receiving end does not exist");
}

function isRestrictedTabUrl(url?: string): boolean {
    if (!url) {
        return false;
    }
    return (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("edge://") ||
        url.startsWith("about:")
    );
}

async function ensureContentScriptReady(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId);
    if (isRestrictedTabUrl(tab.url)) {
        throw new Error(
            "This tab does not allow extension content scripts. Open a normal http/https page and try again."
        );
    }

    await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
    });
}

function buildSynthesisUrl(rawEndpoint: string): string {
    const normalized = rawEndpoint.trim().replace(/\/+$/, "");
    return normalized.toLowerCase().endsWith("/synthesis")
        ? normalized
        : `${normalized}/synthesis`;
}

function sanitizeFilename(input: string): string {
    const cleaned = input
        .replace(/[^a-zA-Z0-9 _.-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 80);
    return cleaned || "aloud-output";
}

function extensionForMimeType(mimeType: string): string {
    if (mimeType.includes("wav")) {
        return "wav";
    }
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
        return "mp3";
    }
    if (mimeType.includes("mp4")) {
        return "mp4";
    }
    return "bin";
}

async function blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

async function getCachedAudio(tabId: number): Promise<CachedAudio | null> {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { type: "GET_CACHED_AUDIO" } as RuntimeRequest);
        return response?.ok && response.data ? (response.data as CachedAudio) : null;
    } catch {
        return null;
    }
}

async function requestExtraction(tabId: number): Promise<ExtractionResponse> {
    try {
        return (await chrome.tabs.sendMessage(tabId, {
            type: "EXTRACT_PAGE"
        } as RuntimeRequest)) as ExtractionResponse;
    } catch (error) {
        if (!isMissingReceiverError(error)) {
            throw error;
        }

        await ensureContentScriptReady(tabId);
        return (await chrome.tabs.sendMessage(tabId, {
            type: "EXTRACT_PAGE"
        } as RuntimeRequest)) as ExtractionResponse;
    }
}

async function askForDownloadApproval(
    tabId: number,
    fileName: string,
    source: string
): Promise<boolean> {
    try {
        const response = (await chrome.tabs.sendMessage(tabId, {
            type: "CONFIRM_DOWNLOAD",
            fileName,
            source
        } as RuntimeRequest)) as RuntimeResponse;
        return response.ok;
    } catch {
        return true;
    }
}

async function playAudioInTab(
    tabId: number,
    audioSource: { audioBase64?: string; audioUrl?: string; mimeType?: string; fileName?: string }
): Promise<boolean> {
    try {
        const response = (await chrome.tabs.sendMessage(tabId, {
            type: "PLAY_AUDIO",
            ...audioSource
        } as RuntimeRequest)) as RuntimeResponse;
        return response.ok;
    } catch (error) {
        if (isMissingReceiverError(error)) {
            try {
                await ensureContentScriptReady(tabId);
                const retried = (await chrome.tabs.sendMessage(tabId, {
                    type: "PLAY_AUDIO",
                    ...audioSource
                } as RuntimeRequest)) as RuntimeResponse;
                return retried.ok;
            } catch {
                return false;
            }
        }
        return false;
    }
}


async function postToApi(
    extraction: NonNullable<ExtractionResponse["data"]>,
    mode: SaveMode,
    localPlay = false
): Promise<Response> {
    const settings = await getSettings();
    if (!settings.apiEndpoint) {
        throw new Error("Missing API endpoint. Set it in options.");
    }
    if (!settings.apiToken) {
        throw new Error("Missing API token. Set it in options.");
    }
    if (mode === "cloud" && !settings.s3Location) {
        throw new Error("S3 location is required for Save to Cloud. Set it in options.");
    }

    const textBlocks = extraction.text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

    const body = {
        title: extraction.title,
        url: extraction.url,
        text: textBlocks.length > 0 ? textBlocks : [extraction.text],
        local_play: localPlay,
        download: localPlay ? false : mode === "local",
        delivery: localPlay ? false : mode === "cloud",
        delivery_url: localPlay ? null : mode === "cloud" ? settings.s3Location : null,
        delivery_token: null
    };

    return fetch(buildSynthesisUrl(settings.apiEndpoint), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiToken}`
        },
        body: JSON.stringify(body)
    });
}

async function processApiResponse(
    tabId: number,
    title: string,
    response: Response,
    localPlay = false
): Promise<string> {
    if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const binaryExtension = extensionForMimeType(contentType);
    const outputName = `${sanitizeFilename(title)}.${binaryExtension}`;

    if (contentType.includes("application/json")) {
        const payload = (await response.json()) as ApiPayload;
        if (!payload.ok) {
            throw new Error(payload.error || "API returned an unknown error.");
        }

        if (payload.mediaUrl) {
            if (localPlay) {
                const played = await playAudioInTab(tabId, {
                    audioUrl: payload.mediaUrl,
                    mimeType: payload.mimeType,
                    fileName: payload.fileName || outputName
                });
                if (played) {
                    return "Playing synthesized audio in page player.";
                }
            }

            const approved = await askForDownloadApproval(tabId, payload.fileName || outputName, "media URL");
            if (!approved) {
                return "Download canceled by user.";
            }
            await chrome.downloads.download({
                url: payload.mediaUrl,
                filename: payload.fileName || outputName,
                saveAs: true
            });
            return "Downloaded MP4 from returned media URL.";
        }

        if (payload.mp4Base64) {
            if (localPlay) {
                const played = await playAudioInTab(tabId, {
                    audioBase64: payload.mp4Base64,
                    mimeType: "video/mp4",
                    fileName: payload.fileName || outputName
                });
                if (played) {
                    return "Playing synthesized audio in page player.";
                }
            }

            const approved = await askForDownloadApproval(tabId, payload.fileName || outputName, "base64 payload");
            if (!approved) {
                return "Download canceled by user.";
            }
            await chrome.downloads.download({
                url: `data:video/mp4;base64,${payload.mp4Base64}`,
                filename: payload.fileName || outputName,
                saveAs: true
            });
            return "Downloaded MP4 file from API response.";
        }

        if (payload.audioBase64) {
            const mimeType = payload.mimeType || "audio/wav";
            const extension = extensionForMimeType(mimeType);
            const fallbackName = `${sanitizeFilename(title)}.${extension}`;

            if (localPlay) {
                const played = await playAudioInTab(tabId, {
                    audioBase64: payload.audioBase64,
                    mimeType,
                    fileName: payload.fileName || fallbackName
                });
                if (played) {
                    return "Playing synthesized audio in page player.";
                }
            }

            const approved = await askForDownloadApproval(tabId, payload.fileName || fallbackName, "audio payload");
            if (!approved) {
                return "Download canceled by user.";
            }
            await chrome.downloads.download({
                url: `data:${mimeType};base64,${payload.audioBase64}`,
                filename: payload.fileName || fallbackName,
                saveAs: true
            });
            return "Downloaded synthesized English audio file.";
        }

        return payload.message || "API call succeeded.";
    }

    const binaryBlob = await response.blob();
    const binaryBase64 = await blobToBase64(binaryBlob);

    if (localPlay) {
        const played = await playAudioInTab(tabId, {
            audioBase64: binaryBase64,
            mimeType: contentType || "audio/wav",
            fileName: outputName
        });
        if (played) {
            return "Playing synthesized audio in page player.";
        }
    }

    const approved = await askForDownloadApproval(tabId, outputName, "binary response");
    if (!approved) {
        return "Download canceled by user.";
    }
    await chrome.downloads.download({
        url: `data:${contentType || "application/octet-stream"};base64,${binaryBase64}`,
        filename: outputName,
        saveAs: true
    });
    return "Downloaded file from binary API response.";
}

async function runPipeline(
    tabId: number,
    source: TriggerSource,
    mode: SaveMode = "local",
    localPlay = false
): Promise<RuntimeResponse> {
    if (localPlay) {
        const cached = await getCachedAudio(tabId);
        if (cached) {
            const played = await playAudioInTab(tabId, cached);
            if (played) {
                return { ok: true, message: `[${source}] Replaying cached audio.` };
            }
        }
    }

    const extraction = await requestExtraction(tabId);
    if (!extraction.ok || !extraction.data) {
        throw new Error(extraction.error || "Extraction failed.");
    }

    const response = await postToApi(extraction.data, mode, localPlay);
    const message = await processApiResponse(
        tabId,
        extraction.data.title,
        response,
        localPlay
    );
    return {
        ok: true,
        message: `[${source}] [${mode}${localPlay ? "+play" : ""}] ${message}`
    };
}

async function getActiveTabId(): Promise<number> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
        throw new Error("No active tab found.");
    }
    return tab.id;
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: "Aloud: Extract text and send to API",
        contexts: ["page"]
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
        return;
    }

    try {
        await runPipeline(tab.id, "context-menu", "local");
    } catch (error) {
        console.error(error);
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "run-processing") {
        return;
    }

    try {
        const tabId = await getActiveTabId();
        await runPipeline(tabId, "shortcut", "local");
    } catch (error) {
        console.error(error);
    }
});

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
    if (request.type !== "RUN_ACTIVE_TAB") {
        return;
    }

    // Hold a Web Lock for the duration of synthesis so Chrome does not kill the
    // service worker if the popup closes before the API response arrives.
    navigator.locks.request("aloud-synthesis", async () => {
        try {
            const tabId = request.tabId ?? (await getActiveTabId());
            const result = await runPipeline(
                tabId,
                "popup",
                request.mode ?? "local",
                request.localPlay ?? false
            );
            sendResponse(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unexpected error";
            sendResponse({ ok: false, message });
        }
    });

    return true;
});
