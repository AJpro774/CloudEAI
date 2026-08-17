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

export interface ChatRequest {
  deviceId: string;
  messages: ModelMessage[];
  systemPrompt: string;
  temperature: number;
}

export interface ChatResponse {
  text: string;
  model: string;
  remaining?: number;
}

export const GEMINI_MODEL = "gemini-3.7-flash";
export const CLOUD_LIMITS = {
  requestsPerDay: 25,
  requestsPerMinute: 4,
  maxMessages: 40,
  maxMessageCharacters: 24_000,
  maxRequestCharacters: 80_000,
} as const;

export const LOCAL_MODEL = {
  id: "gemma-4-e4b-it-q4",
  label: "Gemma 4 E4B",
  repo: "google/gemma-4-E4B-it-qat-q4_0-gguf",
  file: "gemma-4-E4B_q4_0-it.gguf",
  projectorFile: "gemma-4-E4B-it-mmproj.gguf",
  downloadUrl:
    "https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf/resolve/main/gemma-4-E4B_q4_0-it.gguf",
  expectedBytes: 5_154_941_280,
  sha256: "676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee",
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
