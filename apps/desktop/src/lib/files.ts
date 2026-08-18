import { FILE_UPLOAD } from "@cloudeai/shared";

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: "text" | "image" | "pdf" | "binary";
  bytes: number;
  text?: string;
  dataBase64?: string;
}

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "rs",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "swift",
  "kt",
  "kts",
  "java",
  "go",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "toml",
  "yml",
  "yaml",
  "sql",
  "sh",
  "zsh",
  "bash",
  "rb",
  "php",
  "lua",
  "r",
  "log",
  "env",
  "ini",
  "cfg",
  "conf",
]);

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

export function mimeForFile(file: File): string {
  if (file.type) return file.type;
  const ext = extensionOf(file.name);
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (TEXT_EXTENSIONS.has(ext)) return "text/plain";
  return "application/octet-stream";
}

export function kindForMime(mimeType: string): ChatAttachment["kind"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return "text";
  }
  return "binary";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.includes(0)) return false;
  let printable = 0;
  for (const value of sample) {
    if (value === 9 || value === 10 || value === 13 || (value >= 32 && value !== 127)) {
      printable += 1;
    }
  }
  return sample.length === 0 || printable / sample.length > 0.85;
}

export async function readAttachment(
  file: File,
  existingBytes: number,
): Promise<ChatAttachment> {
  if (file.size <= 0) {
    throw new Error(`${file.name} is empty.`);
  }
  if (file.size > FILE_UPLOAD.maxFileBytes) {
    throw new Error(`${file.name} is larger than 12 MB.`);
  }
  if (existingBytes + file.size > FILE_UPLOAD.maxTotalBytes) {
    throw new Error("Those files together are larger than 20 MB.");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const mimeType = mimeForFile(file);
  let kind = kindForMime(mimeType);

  if (kind === "binary" && looksLikeText(buffer)) {
    kind = "text";
  }

  if (kind === "binary") {
    throw new Error(
      `${file.name} isn’t a supported type. Attach an image, PDF, or a text/code file.`,
    );
  }

  if (kind === "text") {
    const text = new TextDecoder("utf-8", { fatal: false })
      .decode(buffer)
      .replace(/\u0000/g, "");
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: mimeType === "application/octet-stream" ? "text/plain" : mimeType,
      kind,
      bytes: file.size,
      text: text.slice(0, FILE_UPLOAD.maxTextChars),
    };
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType,
    kind,
    bytes: file.size,
    dataBase64: bytesToBase64(buffer),
  };
}

export function historyLabel(text: string, files: ChatAttachment[]): string {
  const names = files.map((file) => file.name).join(", ");
  const attached = names ? `Attached: ${names}` : "";
  return [text.trim(), attached].filter(Boolean).join("\n\n");
}

export function localPrompt(text: string, files: ChatAttachment[]): string {
  const blocks = files
    .filter((file) => file.text)
    .map((file) => `Attached file: ${file.name}\n\`\`\`\n${file.text}\n\`\`\``);
  return [text.trim(), ...blocks].filter(Boolean).join("\n\n");
}
