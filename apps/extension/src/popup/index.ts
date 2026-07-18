import type { RuntimeRequest, RuntimeResponse, SaveMode } from "../shared/contracts";
import {
    applyThemeMode,
    getSettings,
    getSystemThemeMode,
    getThemeMode
} from "../shared/storage";

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const saveLocalButton = document.getElementById("saveLocal") as HTMLButtonElement;
const saveCloudButton = document.getElementById("saveCloud") as HTMLButtonElement;
const optionsButton = document.getElementById("openOptions") as HTMLButtonElement;
const cloudActionWrap = document.getElementById("cloudActionWrap") as HTMLSpanElement;

function showStatus(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

function setCloudAvailability(hasS3Location: boolean): void {
    saveCloudButton.disabled = !hasS3Location;
    cloudActionWrap.classList.toggle("cloud-disabled", !hasS3Location);
}

async function runForMode(mode: SaveMode): Promise<void> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            showStatus("No active tab found.", true);
            return;
        }

        showStatus("Running...");
        const response = (await chrome.runtime.sendMessage({
            type: "RUN_ACTIVE_TAB",
            tabId: tab.id,
            mode
        } as RuntimeRequest)) as RuntimeResponse;

        showStatus(response.message, !response.ok);
    } catch (error) {
        showStatus(error instanceof Error ? error.message : "Run failed.", true);
    }
}

saveLocalButton.addEventListener("click", async () => {
    await runForMode("local");
});

saveCloudButton.addEventListener("click", async () => {
    await runForMode("cloud");
});

optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

async function init(): Promise<void> {
    const storedTheme = await getThemeMode();
    const mode = storedTheme ?? getSystemThemeMode();
    applyThemeMode(mode);

    const settings = await getSettings();
    setCloudAvailability(Boolean(settings.s3Location));
}

init().catch((error) => {
    showStatus(error instanceof Error ? error.message : "Failed to load settings.", true);
});
