export type TriggerSource = "popup" | "context-menu" | "shortcut";
export type SaveMode = "local" | "cloud";
export type ThemeMode = "light" | "dark";

export interface ExtensionSettings {
    apiEndpoint: string;
    apiToken: string;
    s3Location: string;
    saveMode: SaveMode;
}

export interface ExtractionResult {
    title: string;
    url: string;
    text: string;
    charCount: number;
}

export interface ExtractionResponse {
    ok: boolean;
    error?: string;
    data?: ExtractionResult;
}

export interface ApiSuccess {
    ok: true;
    message?: string;
    mediaUrl?: string;
    mp4Base64?: string;
    audioBase64?: string;
    mimeType?: string;
    fileName?: string;
}

export interface ApiFailure {
    ok: false;
    error: string;
}

export type ApiPayload = ApiSuccess | ApiFailure;

export interface CachedAudio {
    audioBase64: string;
    mimeType: string;
    fileName: string;
}

export type RuntimeRequest =
    | { type: "RUN_ACTIVE_TAB"; tabId?: number; mode?: SaveMode; localPlay?: boolean }
    | { type: "EXTRACT_PAGE" }
    | { type: "GET_CACHED_AUDIO" }
    | { type: "CONFIRM_DOWNLOAD"; fileName: string; source: string }
    | {
        type: "PLAY_AUDIO";
        audioBase64?: string;
        audioUrl?: string;
        mimeType?: string;
        fileName?: string;
    }
    | { type: "SHOW_ALERT"; message: string };

export interface RuntimeResponse {
    ok: boolean;
    message: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
    apiEndpoint: "",
    apiToken: "",
    s3Location: "",
    saveMode: "local"
};
