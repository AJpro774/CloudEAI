import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AppData,
  ChatRequest,
  ChatResponse,
  EncryptedEnvelope,
  ModelMessage,
} from "@cloudeai/shared";
import { LOCAL_DEFAULT_MODEL } from "@cloudeai/shared";

export interface ModelStatus {
  id: string;
  label: string;
  modelDownloaded: boolean;
  downloadedBytes: number;
  expectedBytes: number;
  runtimeReady: boolean;
  runtimeRunning: boolean;
  modelPath: string;
}

export interface ModelDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

const cloudEndpoint =
  (import.meta.env.VITE_CLOUD_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8787";

export function isDesktopRuntime(): boolean {
  return isTauri();
}

export async function loadAppData(): Promise<AppData | null> {
  if (!isDesktopRuntime()) return null;
  const payload = await invoke<string | null>("load_app_data");
  return payload ? (JSON.parse(payload) as AppData) : null;
}

export async function saveAppData(data: AppData): Promise<void> {
  if (!isDesktopRuntime()) return;
  await invoke("save_app_data", {
    payload: JSON.stringify(data),
    updatedAt: data.updatedAt,
  });
}

export async function getModelStatus(modelId?: string): Promise<ModelStatus> {
  if (!isDesktopRuntime()) {
    return {
      id: modelId ?? LOCAL_DEFAULT_MODEL.id,
      label: LOCAL_DEFAULT_MODEL.label,
      modelDownloaded: false,
      downloadedBytes: 0,
      expectedBytes: LOCAL_DEFAULT_MODEL.expectedBytes,
      runtimeReady: false,
      runtimeRunning: false,
      modelPath: "Available in the CloudEAI desktop app",
    };
  }
  return invoke<ModelStatus>("get_model_status", { modelId });
}

export async function downloadLocalModel(modelId?: string): Promise<void> {
  await invoke("download_local_model", { modelId });
}

export async function startLocalModel(modelId?: string): Promise<void> {
  await invoke("start_local_model", { modelId });
}

export async function stopLocalModel(): Promise<void> {
  await invoke("stop_local_model");
}

export async function localChat(
  messages: ModelMessage[],
  systemPrompt: string,
  temperature: number,
  modelId?: string,
  images?: Array<{ mimeType: string; dataBase64: string }>,
): Promise<ChatResponse> {
  const payload = messages.map((message, index) =>
    index === messages.length - 1 && message.role === "user" && images?.length
      ? { ...message, images }
      : message,
  );
  return invoke<ChatResponse>("local_chat", {
    messages: payload,
    systemPrompt,
    temperature,
    modelId,
  });
}

function textFromGeminiChunk(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";

  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== "object") return [];
      const parts = (content as { parts?: unknown }).parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const typed = part as { text?: unknown; thought?: unknown };
      return typed.thought === true || typeof typed.text !== "string"
        ? ""
        : typed.text;
    })
    .join("");
}

function textFromOpenAIChunk(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return "";
  }
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") return "";
  const content = (delta as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function textFromCloudChunk(value: unknown): string {
  return textFromGeminiChunk(value) || textFromOpenAIChunk(value);
}

function cloudUnreachableMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /load failed|failed to fetch|networkerror|network request failed|could not connect/i.test(
      message,
    )
  ) {
    return `Cloud API is unreachable at ${cloudEndpoint}. Start the local worker with npm run dev:sync, or set VITE_CLOUD_API_URL to a deployed Worker.`;
  }
  return message;
}

export async function streamCloudChat(
  request: ChatRequest,
  onText: (text: string) => void,
): Promise<ChatResponse> {
  let response: Response;
  try {
    response = await fetch(`${cloudEndpoint}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new Error(cloudUnreachableMessage(error));
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error ?? `Cloud request failed (HTTP ${response.status}).`,
    );
  }
  if (!response.body) throw new Error("The cloud response did not include a stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const next = textFromCloudChunk(JSON.parse(data));
        if (next) {
          text += next;
          onText(next);
        }
      } catch {
        // A malformed event is ignored; subsequent SSE events can still complete.
      }
    }
  }

  if (!text.trim()) {
    throw new Error("The cloud model returned an empty response.");
  }
  return {
    text,
    model: response.headers.get("X-CloudEAI-Model") ?? "gemini-3.7-flash",
    remaining: Number(response.headers.get("X-RateLimit-Remaining") ?? ""),
  };
}

function randomToken(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function syncHeaders(accountId: string, authToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
    "X-CloudEAI-Account": accountId,
  };
}

export async function createSyncAccount(): Promise<{
  accountId: string;
  authToken: string;
}> {
  const accountId = randomToken(18);
  const authToken = randomToken(32);
  const response = await fetch(`${cloudEndpoint}/v1/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, authToken }),
  });
  if (!response.ok) throw new Error("Could not create encrypted sync.");
  return { accountId, authToken };
}

export async function exportRecoveryKey(): Promise<string> {
  return invoke<string>("export_recovery_key");
}

export async function importRecoveryKey(value: string): Promise<void> {
  await invoke("import_recovery_key", { value });
}

export async function readEncryptedEnvelope(): Promise<EncryptedEnvelope | null> {
  return invoke<EncryptedEnvelope | null>("read_encrypted_envelope");
}

export async function replaceEncryptedEnvelope(
  envelope: EncryptedEnvelope,
): Promise<AppData> {
  const payload = await invoke<string>("replace_encrypted_envelope", { envelope });
  return JSON.parse(payload) as AppData;
}

export async function pushEncryptedHistory(
  accountId: string,
  authToken: string,
  baseRevision: number,
  envelope: EncryptedEnvelope,
): Promise<number> {
  const response = await fetch(`${cloudEndpoint}/v1/sync`, {
    method: "PUT",
    headers: syncHeaders(accountId, authToken),
    body: JSON.stringify({ baseRevision, envelope }),
  });
  const body = (await response.json()) as {
    serverRevision?: number;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Encrypted sync failed.");
  return body.serverRevision ?? baseRevision;
}

export async function pullEncryptedHistory(
  accountId: string,
  authToken: string,
): Promise<{ envelope: EncryptedEnvelope | null; serverRevision: number }> {
  const response = await fetch(`${cloudEndpoint}/v1/sync`, {
    headers: syncHeaders(accountId, authToken),
  });
  const body = (await response.json()) as {
    envelope?: EncryptedEnvelope | null;
    serverRevision?: number;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Could not restore history.");
  return {
    envelope: body.envelope ?? null,
    serverRevision: body.serverRevision ?? 0,
  };
}

export const CLOUD_ENDPOINT = cloudEndpoint;
