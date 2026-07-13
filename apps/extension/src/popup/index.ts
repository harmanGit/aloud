import type { ExtensionSettings, RuntimeRequest, RuntimeResponse } from "../shared/contracts";
import { getSettings, saveSettings } from "../shared/storage";

const endpointInput = document.getElementById("apiEndpoint") as HTMLInputElement;
const tokenInput = document.getElementById("apiToken") as HTMLInputElement;
const s3Input = document.getElementById("s3Location") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const saveButton = document.getElementById("saveSettings") as HTMLButtonElement;
const runButton = document.getElementById("runNow") as HTMLButtonElement;
const optionsButton = document.getElementById("openOptions") as HTMLButtonElement;

function showStatus(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

function collectSettings(): ExtensionSettings {
    return {
        apiEndpoint: endpointInput.value,
        apiToken: tokenInput.value,
        s3Location: s3Input.value
    };
}

async function loadInitialState(): Promise<void> {
    const settings = await getSettings();
    endpointInput.value = settings.apiEndpoint;
    tokenInput.value = settings.apiToken;
    s3Input.value = settings.s3Location;
}

saveButton.addEventListener("click", async () => {
    try {
        const settings = collectSettings();
        if (!settings.apiEndpoint) {
            showStatus("API endpoint is required.", true);
            return;
        }
        if (!settings.apiToken) {
            showStatus("API token is required.", true);
            return;
        }
        await saveSettings(settings);
        showStatus("Settings saved.");
    } catch (error) {
        showStatus(error instanceof Error ? error.message : "Failed to save settings.", true);
    }
});

runButton.addEventListener("click", async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            showStatus("No active tab found.", true);
            return;
        }

        showStatus("Running...");
        const response = (await chrome.runtime.sendMessage({
            type: "RUN_ACTIVE_TAB",
            tabId: tab.id
        } as RuntimeRequest)) as RuntimeResponse;

        showStatus(response.message, !response.ok);
    } catch (error) {
        showStatus(error instanceof Error ? error.message : "Run failed.", true);
    }
});

optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

loadInitialState().catch((error) => {
    showStatus(error instanceof Error ? error.message : "Failed to load settings.", true);
});
