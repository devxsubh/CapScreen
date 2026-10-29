import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatModels, latestModels, recommendedCloudModel } from "../src/lib/llm/controlCenter/providers";

describe("cloud model choice", () => {
  it("keeps only the newest Claude generation, one model per tier", () => {
    const listed = [
      "claude-haiku-4-5-20251001",
      "claude-opus-4-5-20251101",
      "claude-sonnet-4-5-20250929",
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-3-5-sonnet-20241022",
      "claude-opus-5-0",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "claude-fable-5-1",
    ];
    assert.deepEqual(chatModels("anthropic", listed), [
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "claude-opus-5-5",
      "claude-fable-5-1",
    ]);
    assert.equal(recommendedCloudModel("anthropic", listed), "claude-sonnet-5-5");
  });

  it("trims OpenAI to the latest GPT and drops snapshots and superseded lines", () => {
    const listed = [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4o-2024-08-06",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-3.5-turbo",
      "gpt-4-0613",
      "o3",
      "o4-mini",
      "chatgpt-4o-latest",
      "gpt-5",
      "gpt-5-2025-08-07",
      "gpt-5.1",
      "gpt-5-mini",
      "gpt-5-nano",
      "text-embedding-3-small",
      "gpt-image-1",
    ];
    assert.deepEqual(chatModels("openai", listed), ["gpt-5-mini", "gpt-5.1", "gpt-5-nano"]);
  });

  it("offers Gemini's free Flash and Flash-Lite models, newest of each", () => {
    // Shape of Google's listing (Oct 2026): the newest model, Gemini 4 Argon, is paid-only.
    const listed = [
      "models/gemini-4-argon",
      "models/gemini-3.8-flash",
      "models/gemini-3.6-flash",
      "models/gemini-3-flash-preview",
      "models/gemini-3.5-flash-lite",
      "models/gemini-3.1-flash-lite",
      "models/gemini-3.1-pro-preview",
      "models/gemini-omni-1.1-flash",
      "models/gemini-2.5-pro",
      "models/gemini-2.5-flash",
      "models/gemini-3.8-live",
      "models/gemini-3.8-flash-tts",
      "models/gemini-3.5-transcribe",
      "models/gemini-3.1-flash-image",
      "models/gemini-robotics-er-2-preview",
      "models/gemini-embedding-001",
      "models/gemma-4-27b-it",
    ];
    assert.deepEqual(chatModels("gemini", listed), ["models/gemini-3.8-flash", "models/gemini-3.5-flash-lite"]);
    assert.equal(recommendedCloudModel("gemini", listed), "models/gemini-3.8-flash");
    assert.deepEqual(latestModels(["claude-haiku-4-5-20251001"]), ["claude-haiku-4-5-20251001"]);
  });

  it("leaves local server listings whole", () => {
    const listed = ["llama-3.1-8b-instruct", "llama-3.2-3b-instruct", "qwen2.5-7b-instruct"];
    assert.deepEqual(chatModels("lmstudio", listed, false), listed);
  });
});
