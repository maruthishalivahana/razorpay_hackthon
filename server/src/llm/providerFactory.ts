import type { LLMProvider } from "./llmProvider.js";
import { OpenRouterProvider } from "./openRouterProvider.js";
import { GeminiProvider } from "./geminiProvider.js";

export const getLLMProvider = (overrideProvider?: string): LLMProvider => {
  const providerType = (overrideProvider || process.env.LLM_PROVIDER || "openrouter").toLowerCase();

  if (providerType === "gemini") {
    return new GeminiProvider();
  }

  return new OpenRouterProvider();
};
