import { DEFAULT_SETTINGS, type ExtensionSettings } from "./contracts";

const STORAGE_KEY = "aloud.settings";

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
