import type { ExtensionSettings, ThemeMode } from "../shared/contracts";
import {
    applyThemeMode,
    getSettings,
    getSystemThemeMode,
    getThemeMode,
    saveSettings,
    saveThemeMode
} from "../shared/storage";

const endpointInput = document.getElementById("apiEndpoint") as HTMLInputElement;
const tokenInput = document.getElementById("apiToken") as HTMLInputElement;
const s3Input = document.getElementById("s3Location") as HTMLInputElement;
const saveModeInput = document.getElementById("saveMode") as HTMLSelectElement;
const themeLightButton = document.getElementById("themeLight") as HTMLButtonElement;
const themeDarkButton = document.getElementById("themeDark") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const saveButton = document.getElementById("saveSettings") as HTMLButtonElement;
const resetButton = document.getElementById("resetSettings") as HTMLButtonElement;

function showStatus(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

function setForm(settings: ExtensionSettings): void {
    endpointInput.value = settings.apiEndpoint;
    tokenInput.value = settings.apiToken;
    s3Input.value = settings.s3Location;
    saveModeInput.value = settings.saveMode;
}

function getForm(): ExtensionSettings {
    return {
        apiEndpoint: endpointInput.value,
        apiToken: tokenInput.value,
        s3Location: s3Input.value,
        saveMode: saveModeInput.value === "cloud" ? "cloud" : "local"
    };
}

function setActiveThemeButton(mode: ThemeMode): void {
    themeLightButton.classList.toggle("active", mode === "light");
    themeDarkButton.classList.toggle("active", mode === "dark");
}

async function setTheme(mode: ThemeMode): Promise<void> {
    applyThemeMode(mode);
    setActiveThemeButton(mode);
    await saveThemeMode(mode);
}

async function load(): Promise<void> {
    const storedTheme = await getThemeMode();
    const mode = storedTheme ?? getSystemThemeMode();
    applyThemeMode(mode);
    setActiveThemeButton(mode);

    const settings = await getSettings();
    setForm(settings);
}

themeLightButton.addEventListener("click", async () => {
    await setTheme("light");
});

themeDarkButton.addEventListener("click", async () => {
    await setTheme("dark");
});

saveButton.addEventListener("click", async () => {
    try {
        const settings = getForm();
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

resetButton.addEventListener("click", async () => {
    await load();
    showStatus("Form reset to saved values.");
});

load().catch((error) => {
    showStatus(error instanceof Error ? error.message : "Failed to load settings.", true);
});
