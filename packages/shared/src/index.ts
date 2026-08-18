export type MasterMode = "code" | "writing" | "general" | "data";
export type ModelRoute = "local" | "cloud";
export type MessageRole = "user" | "assistant";
export type AnswerLength = "concise" | "balanced" | "detailed";
export type ExpertiseLevel = "beginner" | "intermediate" | "advanced";

export interface ModeConfig {
  id: MasterMode;
  label: string;
  eyebrow: string;
  description: string;
  placeholder: string;
  accent: string;
  temperature: number;
  systemPrompt: string;
  starterPrompts: string[];
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  modelRoute: ModelRoute;
  mode: MasterMode;
  modelLabel?: string;
}

export interface Conversation {
  id: string;
  title: string;
  mode: MasterMode;
  modelRoute: ModelRoute;
  cloudModelId?: string;
  localModelId?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  displayName: string;
  expertise: ExpertiseLevel;
  answerLength: AnswerLength;
  fontScale: "standard" | "large" | "extra-large";
  highContrast: boolean;
  reduceMotion: boolean;
  speakResponses: boolean;
  cloudDailyLimit: number;
}

export interface AppData {
  version: 1;
  deviceId: string;
  conversations: Conversation[];
  preferences: UserPreferences;
  activeConversationId?: string;
  sync?: {
    accountId: string;
    authToken: string;
    serverRevision: number;
    endpoint: string;
  };
  updatedAt: string;
}

export interface EncryptedEnvelope {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

export interface SyncBundle {
  accountId: string;
  authToken: string;
  encryptionKey: string;
}

export interface ModelMessage {
  role: MessageRole;
  content: string;
}

export interface ChatFilePart {
  name: string;
  mimeType: string;
  text?: string;
  dataBase64?: string;
}

export interface ChatRequest {
  deviceId: string;
  messages: ModelMessage[];
  systemPrompt: string;
  temperature: number;
  model?: string;
  files?: ChatFilePart[];
}

export interface ChatResponse {
  text: string;
  model: string;
  remaining?: number;
}

export const GEMINI_MODEL = "gemini-3.7-flash";

export const CLOUD_MODELS = [
  {
    id: GEMINI_MODEL,
    provider: "gemini" as const,
    label: "Gemini 3.7 Flash",
    family: "Gemini",
  },
] as const;

export type CloudModelId = (typeof CLOUD_MODELS)[number]["id"];

export type ResolvedCloudModel = {
  id: string;
  provider: "gemini";
  label: string;
  family: string;
};

export function resolveCloudModel(id: string | undefined): ResolvedCloudModel {
  return CLOUD_MODELS.find((model) => model.id === id) ?? CLOUD_MODELS[0];
}

export const LOCAL_MODELS = [
  {
    id: "lfm2.5-2.6b",
    label: "LFM2.5 2.6B",
    family: "Liquid",
    role: "chat",
    repo: "LiquidAI/LFM2.5-2.6B-GGUF",
    file: "LFM2.5-2.6B-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/LiquidAI/LFM2.5-2.6B-GGUF/resolve/main/LFM2.5-2.6B-Q4_K_M.gguf",
    expectedBytes: 1_674_454_848,
    sha256: "79fdf00351b46cf26f020aead28d01889886be87c55fa0eb907e6f9b00bfee14",
    vision: false,
  },
  {
    id: "lfm2.5-vl-3b",
    label: "LFM2.5 VL 3B",
    family: "Liquid",
    role: "vision",
    repo: "LiquidAI/LFM2.5-VL-3B-GGUF",
    file: "LFM2.5-VL-3B-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/LiquidAI/LFM2.5-VL-3B-GGUF/resolve/main/LFM2.5-VL-3B-Q4_K_M.gguf",
    expectedBytes: 1_674_454_240,
    sha256: "83c18dfba02c75769cdd63f73e37c343400e82d434ff1b14bcc1cb02fcf2f5f2",
    vision: true,
    mmprojFile: "mmproj-LFM2.5-VL-3B-Q8_0.gguf",
    mmprojUrl:
      "https://huggingface.co/LiquidAI/LFM2.5-VL-3B-GGUF/resolve/main/mmproj-LFM2.5-VL-3B-Q8_0.gguf",
    mmprojBytes: 583_109_120,
    mmprojSha256:
      "8ba27050dc88737db66b856d3b74e0e6cf54bee35fa4d9d9808f69ee556bbd43",
  },
  {
    id: "lfm2-1.2b-extract",
    label: "LFM2 1.2B Extract",
    family: "Liquid",
    role: "extract",
    repo: "LiquidAI/LFM2-1.2B-Extract-GGUF",
    file: "LFM2-1.2B-Extract-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/LiquidAI/LFM2-1.2B-Extract-GGUF/resolve/main/LFM2-1.2B-Extract-Q4_K_M.gguf",
    expectedBytes: 730_894_048,
    sha256: "09b60b507ee7d1698b2b4dfce184c75083d7790c7701910ed60afa2801024702",
    vision: false,
  },
] as const;

export type LocalModelId = (typeof LOCAL_MODELS)[number]["id"];
export const LOCAL_DEFAULT_MODEL = LOCAL_MODELS[0];
export const LOCAL_MODEL = LOCAL_DEFAULT_MODEL;

export function resolveLocalModel(id: string | undefined) {
  return LOCAL_MODELS.find((model) => model.id === id) ?? LOCAL_DEFAULT_MODEL;
}
export const CLOUD_LIMITS = {
  requestsPerDay: 25,
  requestsPerMinute: 4,
  maxMessages: 40,
  maxMessageCharacters: 24_000,
  maxRequestCharacters: 200_000,
} as const;

export const FILE_UPLOAD = {
  maxFiles: 6,
  maxFileBytes: 12 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxTextChars: 120_000,
} as const;

export const DEFAULT_PREFERENCES: UserPreferences = {
  displayName: "",
  expertise: "intermediate",
  answerLength: "balanced",
  fontScale: "large",
  highContrast: false,
  reduceMotion: false,
  speakResponses: false,
  cloudDailyLimit: CLOUD_LIMITS.requestsPerDay,
};

export const MODE_CONFIGS: Record<MasterMode, ModeConfig> = {
  code: {
    id: "code",
    label: "Code",
    eyebrow: "Engineer",
    description: "Build, debug, and explain native software with implementation-ready guidance.",
    placeholder: "Describe the feature, bug, platform, and constraints…",
    accent: "blue",
    temperature: 0.2,
    systemPrompt: `You are CloudEAI Code, a senior native-software engineer and patient technical mentor.

Primary focus:
- Swift and SwiftUI for Apple platforms, Kotlin and Jetpack Compose for Android, Rust and C++ for systems work, and Tauri for secure cross-platform desktop software.
- Produce correct, maintainable, testable code. Prefer platform-native APIs and current stable conventions.
- Begin with the outcome. State assumptions and important trade-offs before implementation.
- For debugging, identify the likely root cause, show the smallest safe fix, and provide a focused verification step.
- Never invent APIs, packages, command output, benchmark results, or successful tests.
- Protect secrets and user data. Flag unsafe shell commands, destructive migrations, insecure storage, and untrusted code execution.
- Use short sections, descriptive names, complete examples, and accessible explanations. Define jargon on first use.
- When requirements are incomplete, ask only the question that materially changes the implementation.`,
    starterPrompts: [
      "Design a SwiftUI settings screen with accessible controls",
      "Explain this Rust compiler error in plain language",
      "Plan a secure Tauri command boundary",
    ],
  },
  writing: {
    id: "writing",
    label: "Writing",
    eyebrow: "Editor",
    description: "Draft clear product copy, documentation, and polished long-form writing.",
    placeholder: "What are we writing, for whom, and in what tone?",
    accent: "violet",
    temperature: 0.65,
    systemPrompt: `You are CloudEAI Writing, a precise editor and collaborative writing partner.

Working method:
- Clarify the audience, purpose, voice, length, and required facts when they are not evident.
- Preserve the user's meaning and personal voice while improving structure, rhythm, clarity, and credibility.
- Lead with the strongest useful point. Prefer concrete language, active voice, and varied but readable sentences.
- Never fabricate quotations, citations, customer claims, metrics, or personal experiences.
- For documentation, make steps scannable and include prerequisites, expected results, and recovery paths.
- For revisions, briefly explain consequential edits and avoid changing facts without permission.
- Keep language inclusive and accessible. Avoid idioms that obscure meaning and define unavoidable specialist terms.
- Return a polished draft rather than a lecture unless the user asks for analysis.`,
    starterPrompts: [
      "Turn these rough notes into a clear README",
      "Rewrite this announcement in a warm, direct voice",
      "Draft accessible onboarding copy for a desktop app",
    ],
  },
  general: {
    id: "general",
    label: "General",
    eyebrow: "Guide",
    description: "Think through everyday questions with clear, grounded, practical answers.",
    placeholder: "Ask a question or describe what you want to accomplish…",
    accent: "green",
    temperature: 0.45,
    systemPrompt: `You are CloudEAI General, a thoughtful, practical, and privacy-respecting assistant.

Response principles:
- Answer the actual question first, then add only the context needed to act confidently.
- Separate verified facts from assumptions, estimates, and opinions.
- Do not pretend to have live access, personal experience, professional credentials, or certainty you do not have.
- Break complicated tasks into a small number of safe steps and mention meaningful risks.
- For medical, legal, financial, or safety-sensitive topics, provide general information and encourage appropriate professional help.
- Respect user autonomy and privacy. Never pressure the user to share personal information.
- Use plain language, generous spacing, short paragraphs, and explicit labels when choices could be confusing.
- If a premise is incorrect, correct it directly and kindly with the technical reason.`,
    starterPrompts: [
      "Compare two options and help me decide",
      "Explain a difficult idea without jargon",
      "Turn this goal into a simple weekly plan",
    ],
  },
  data: {
    id: "data",
    label: "Data",
    eyebrow: "Analyst",
    description: "Analyze evidence, shape queries, and communicate uncertainty without guesswork.",
    placeholder: "Share the data, schema, question, and desired output…",
    accent: "amber",
    temperature: 0.15,
    systemPrompt: `You are CloudEAI Data, a rigorous data analyst and statistics partner.

Analysis contract:
- Restate the decision or question, identify available evidence, and surface missing fields or quality issues.
- Never invent rows, measurements, query results, statistical significance, or causal conclusions.
- Distinguish descriptive findings, inference, prediction, and causality.
- Show formulas, SQL, Python, assumptions, units, filters, and denominators needed to reproduce the result.
- Check for nulls, duplicates, leakage, selection bias, class imbalance, outliers, and misleading aggregations.
- Use uncertainty ranges and sensitivity checks when appropriate. Explain practical significance separately from statistical significance.
- Prefer an understandable chart or compact summary over a dense output, and provide accessible text descriptions.
- End with the most defensible conclusion, limitations, and the next useful validation step.`,
    starterPrompts: [
      "Review this SQL query for correctness and edge cases",
      "Design an analysis plan for this CSV",
      "Explain what this metric can and cannot prove",
    ],
  },
};

export function buildSystemPrompt(
  mode: MasterMode,
  preferences: UserPreferences,
  memorySummary?: string,
): string {
  const config = MODE_CONFIGS[mode];
  const personalization = [
    preferences.displayName ? `The user prefers to be called ${preferences.displayName}.` : "",
    `Their self-described expertise is ${preferences.expertise}.`,
    `They prefer ${preferences.answerLength} answers.`,
    memorySummary ? `Relevant user-approved memory:\n${memorySummary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${config.systemPrompt}

Personalization:
${personalization}

Privacy boundary:
Do not ask for passwords, private keys, API keys, or unnecessary identifying information. Remind the user when a cloud request may contain sensitive material.`;
}
