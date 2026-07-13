export type TriggerSource = "popup" | "context-menu" | "shortcut";

export interface ExtensionSettings {
    apiEndpoint: string;
    apiToken: string;
    s3Location: string;
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
    fileName?: string;
}

export interface ApiFailure {
    ok: false;
    error: string;
}

export type ApiPayload = ApiSuccess | ApiFailure;

export type RuntimeRequest =
    | { type: "RUN_ACTIVE_TAB"; tabId?: number }
    | { type: "EXTRACT_PAGE" }
    | { type: "CONFIRM_DOWNLOAD"; fileName: string; source: string }
    | { type: "SHOW_ALERT"; message: string };

export interface RuntimeResponse {
    ok: boolean;
    message: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
    apiEndpoint: "",
    apiToken: "",
    s3Location: ""
};
