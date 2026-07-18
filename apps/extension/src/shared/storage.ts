import { DEFAULT_SETTINGS, type ExtensionSettings, type ThemeMode } from "./contracts";

const STORAGE_KEY = "aloud.settings";
const THEME_KEY = "aloud.theme";

export async function getSettings(): Promise<ExtensionSettings> {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    const raw = (data[STORAGE_KEY] ?? {}) as Partial<ExtensionSettings>;
    return {
        apiEndpoint: (raw.apiEndpoint ?? DEFAULT_SETTINGS.apiEndpoint).trim(),
        apiToken: (raw.apiToken ?? DEFAULT_SETTINGS.apiToken).trim(),
        s3Location: (raw.s3Location ?? DEFAULT_SETTINGS.s3Location).trim()
    };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
    const sanitized: ExtensionSettings = {
        apiEndpoint: settings.apiEndpoint.trim(),
        apiToken: settings.apiToken.trim(),
        s3Location: settings.s3Location.trim()
    };

    await chrome.storage.sync.set({ [STORAGE_KEY]: sanitized });
}

export async function getThemeMode(): Promise<ThemeMode | null> {
    const data = await chrome.storage.sync.get(THEME_KEY);
    const raw = data[THEME_KEY];
    if (raw === "light" || raw === "dark") {
        return raw;
    }
    return null;
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
    await chrome.storage.sync.set({ [THEME_KEY]: mode });
}

export function getSystemThemeMode(): ThemeMode {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeMode(mode: ThemeMode): void {
    document.documentElement.setAttribute("data-theme", mode);
}

