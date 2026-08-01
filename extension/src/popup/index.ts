import type { RuntimeRequest, RuntimeResponse, SaveMode } from "../shared/contracts";
import {
    applyThemeMode,
    getSystemThemeMode,
    getThemeMode
} from "../shared/storage";

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const spinnerEl = document.getElementById("spinner") as HTMLSpanElement;
const playButton = document.getElementById("playAction") as HTMLButtonElement;
const saveButton = document.getElementById("saveAction") as HTMLButtonElement;
const optionsButton = document.getElementById("openOptions") as HTMLButtonElement;

function showStatus(message: string, isError = false): void {
    spinnerEl.hidden = true;
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

function showSynthesising(): void {
    spinnerEl.hidden = false;
    statusEl.textContent = "Synthesising";
    statusEl.classList.remove("error");
}

async function runForMode(mode: SaveMode, localPlay = false): Promise<void> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            showStatus("No active tab found.", true);
            return;
        }

        showSynthesising();
        const response = (await chrome.runtime.sendMessage({
            type: "RUN_ACTIVE_TAB",
            tabId: tab.id,
            mode,
            localPlay
        } as RuntimeRequest)) as RuntimeResponse;

        showStatus(response.message, !response.ok);
    } catch (error) {
        showStatus(error instanceof Error ? error.message : "Run failed.", true);
    }
}

playButton.addEventListener("click", async () => {
    await runForMode("local", true);
});

saveButton.addEventListener("click", async () => {
    await runForMode("local");
});

optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

async function init(): Promise<void> {
    const storedTheme = await getThemeMode();
    const mode = storedTheme ?? getSystemThemeMode();
    applyThemeMode(mode);
}

init().catch((error) => {
    showStatus(error instanceof Error ? error.message : "Failed to load settings.", true);
});
