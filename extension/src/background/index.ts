import type {
    ApiPayload,
    ExtractionResponse,
    RuntimeRequest,
    RuntimeResponse,
    SaveMode,
    TriggerSource
} from "../shared/contracts";
import { getSettings } from "../shared/storage";

const CONTEXT_MENU_ID = "aloud-process-current-page";

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

function decodeBase64Mp4(base64: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: "video/mp4" });
}

async function requestExtraction(tabId: number): Promise<ExtractionResponse> {
    return (await chrome.tabs.sendMessage(tabId, {
        type: "EXTRACT_PAGE"
    } as RuntimeRequest)) as ExtractionResponse;
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

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
    const objectUrl = URL.createObjectURL(blob);
    await chrome.downloads.download({
        url: objectUrl,
        filename,
        saveAs: true
    });
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
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

async function processApiResponse(tabId: number, title: string, response: Response): Promise<string> {
    if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const outputName = `${sanitizeFilename(title)}.mp4`;

    if (contentType.includes("application/json")) {
        const payload = (await response.json()) as ApiPayload;
        if (!payload.ok) {
            throw new Error(payload.error || "API returned an unknown error.");
        }

        if (payload.mediaUrl) {
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
            const approved = await askForDownloadApproval(tabId, payload.fileName || outputName, "base64 payload");
            if (!approved) {
                return "Download canceled by user.";
            }
            await downloadBlob(decodeBase64Mp4(payload.mp4Base64), payload.fileName || outputName);
            return "Downloaded MP4 file from API response.";
        }

        return payload.message || "API call succeeded.";
    }

    const binaryBlob = await response.blob();
    const approved = await askForDownloadApproval(tabId, outputName, "binary response");
    if (!approved) {
        return "Download canceled by user.";
    }
    await downloadBlob(binaryBlob, outputName);
    return "Downloaded MP4 file from binary API response.";
}

async function runPipeline(
    tabId: number,
    source: TriggerSource,
    mode: SaveMode = "local",
    localPlay = false
): Promise<RuntimeResponse> {
    const extraction = await requestExtraction(tabId);
    if (!extraction.ok || !extraction.data) {
        throw new Error(extraction.error || "Extraction failed.");
    }

    const response = await postToApi(extraction.data, mode, localPlay);
    const message = await processApiResponse(tabId, extraction.data.title, response);
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

    (async () => {
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
    })();

    return true;
});
