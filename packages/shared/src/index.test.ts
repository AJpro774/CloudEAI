import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  DEFAULT_PREFERENCES,
  GEMINI_MODEL,
  LOCAL_MODEL,
  resolveCloudModel,
  resolveLocalModel,
  MODE_CONFIGS,
  type MasterMode,
} from "./index";

describe("CloudEAI model contracts", () => {
  it("pins Gemini cloud and Liquid local models", () => {
    expect(GEMINI_MODEL).toBe("gemini-3.7-flash");
    expect(resolveCloudModel("unknown").id).toBe(GEMINI_MODEL);
    expect(resolveLocalModel("lfm2.5-vl-3b").vision).toBe(true);
    expect(resolveLocalModel("lfm2-1.2b-extract").role).toBe("extract");
    expect(LOCAL_MODEL.file).toContain("LFM2.5-2.6B");
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
