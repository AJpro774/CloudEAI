import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  DEFAULT_PREFERENCES,
  GEMINI_MODEL,
  LOCAL_MODEL,
  MODE_CONFIGS,
  type MasterMode,
} from "./index";

describe("CloudEAI model contracts", () => {
  it("pins the verified local and cloud models", () => {
    expect(GEMINI_MODEL).toBe("gemini-3.7-flash");
    expect(LOCAL_MODEL.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(LOCAL_MODEL.expectedBytes).toBeGreaterThan(5_000_000_000);
  });

  it.each(Object.keys(MODE_CONFIGS) as MasterMode[])(
    "builds a distinct %s master prompt",
    (mode) => {
      const prompt = buildSystemPrompt(
        mode,
        {
          ...DEFAULT_PREFERENCES,
          displayName: "Casey",
          expertise: "beginner",
          answerLength: "detailed",
        },
        "Casey prefers keyboard-first instructions.",
      );

      expect(prompt).toContain(MODE_CONFIGS[mode].systemPrompt);
      expect(prompt).toContain("Casey");
      expect(prompt).toContain("beginner");
      expect(prompt).toContain("detailed");
      expect(prompt).toContain("keyboard-first");
      expect(prompt).toContain("Do not ask for passwords");
    },
  );

  it("uses a unique system prompt and temperature for each mode", () => {
    const values = Object.values(MODE_CONFIGS);
    expect(new Set(values.map((mode) => mode.systemPrompt)).size).toBe(4);
    expect(new Set(values.map((mode) => mode.temperature)).size).toBe(4);
  });
});
