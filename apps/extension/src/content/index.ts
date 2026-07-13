import { Readability } from "@mozilla/readability";
import type { ExtractionResponse, RuntimeRequest } from "../shared/contracts";

const MAX_TEXT_CHARS = 80000;

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

    if (request.type === "CONFIRM_DOWNLOAD") {
        const accepted = window.confirm(
            `API returned an MP4 file (${request.fileName}) from ${request.source}. Download to this device?`
        );
        sendResponse({ ok: accepted, message: accepted ? "Download approved." : "Download canceled." });
        return;
    }

    if (request.type === "SHOW_ALERT") {
        window.alert(request.message);
        sendResponse({ ok: true, message: "Displayed alert." });
    }
});
