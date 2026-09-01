import { test, describe } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { OpenRouterProvider } from "../openRouterProvider.js";
import { createEmptyState } from "../../agents/buyerState.js";
import type { PublicProduct } from "../../services/productService.js";

describe("OpenRouterProvider Unit Tests (Mocked)", () => {
  const dummyState = createEmptyState();

  test("1. Successful intent generation with valid JSON", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    type: "NEW_SEARCH",
                    updates: { topic: "office chair" },
                  }),
                },
              },
            ],
          }),
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenRouterProvider(mockOpenAI);
    const intent = await provider.generateIntent({
      message: "I want an office chair",
      currentState: dummyState,
      conversationHistory: [],
    });

    assert.equal(intent.type, "NEW_SEARCH");
    assert.equal(intent.updates.topic, "office chair");
  });

  test("2. Invalid JSON content falls back to local intent", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: "This is not JSON",
                },
              },
            ],
          }),
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenRouterProvider(mockOpenAI);
    const intent = await provider.generateIntent({
      message: "I want an office chair",
      currentState: dummyState,
      conversationHistory: [],
    });

    assert.equal(intent.type, "NEW_SEARCH");
    assert.equal(intent.updates.topic, "office chair");
  });

  test("3. Rate limit (429) triggers fallback", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => {
            throw new OpenAI.APIError(429, { error: { message: "Rate limit exceeded" } }, "Rate limit", {} as any);
          },
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenRouterProvider(mockOpenAI);
    const intent = await provider.generateIntent({
      message: "Under 8k",
      currentState: { ...dummyState, topic: "office chair" },
      conversationHistory: [],
    });

    assert.equal(intent.type, "UPDATE_SEARCH");
    assert.equal(intent.updates.maxPrice, 8000);
  });

  test("4. Authentication error (401) triggers fallback", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => {
            throw new OpenAI.APIError(401, { error: { message: "Unauthorized key" } }, "Unauthorized", {} as any);
          },
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenRouterProvider(mockOpenAI);
    const intent = await provider.generateIntent({
      message: "Under 8k",
      currentState: { ...dummyState, topic: "office chair" },
      conversationHistory: [],
    });

    assert.equal(intent.type, "UPDATE_SEARCH");
    assert.equal(intent.updates.maxPrice, 8000);
  });

  test("5. Network timeout triggers fallback", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => {
            const err = new Error("Network timeout");
            err.name = "AbortError";
            throw err;
          },
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenRouterProvider(mockOpenAI);
    const intent = await provider.generateIntent({
      message: "Under 8k",
      currentState: { ...dummyState, topic: "office chair" },
      conversationHistory: [],
    });

    assert.equal(intent.type, "UPDATE_SEARCH");
    assert.equal(intent.updates.maxPrice, 8000);
  });

  test("6. Empty response content triggers fallback", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "" } }],
          }),
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenRouterProvider(mockOpenAI);
    const intent = await provider.generateIntent({
      message: "Under 8k",
      currentState: { ...dummyState, topic: "office chair" },
      conversationHistory: [],
    });

    assert.equal(intent.type, "UPDATE_SEARCH");
    assert.equal(intent.updates.maxPrice, 8000);
  });

  test("7. Response generation success", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: "Here is your office chair.",
                },
              },
            ],
          }),
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenRouterProvider(mockOpenAI);
    const response = await provider.generateResponse({
      message: "Show me office chairs",
      products: [],
      buyerState: dummyState,
      conversationHistory: [],
    });

    assert.equal(response, "Here is your office chair.");
  });

  test("8. Response generation failure returns deterministic fallback", async () => {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("Service unavailable");
          },
        },
      },
    } as unknown as OpenAI;

    const dummyProduct: PublicProduct = {
      id: "p1",
      merchantId: "m1",
      name: "Ergonomic Chair",
      description: "Good chair",
      category: "Office Furniture",
      sku: "SKU123",
      price: 8000,
      currency: "INR",
      inventory: 5,
      deliveryDays: 3,
      isNegotiable: false,
    };

    const provider = new OpenRouterProvider(mockOpenAI);
    const response = await provider.generateResponse({
      message: "Show me office chairs",
      products: [dummyProduct],
      buyerState: { ...dummyState, topic: "office chair" },
      conversationHistory: [],
    });

    assert.ok(response.includes("I found 1 product matching \"office chair\"."));
    assert.ok(response.includes("Ergonomic Chair — ₹8,000"));
  });

  test("9. Provider model selection uses OPENROUTER_MODEL env var", () => {
    const originalEnv = process.env.OPENROUTER_MODEL;
    process.env.OPENROUTER_MODEL = "meta-llama/llama-3-70b";

    try {
      const provider = new OpenRouterProvider();
      assert.equal((provider as any).modelName, "meta-llama/llama-3-70b");
    } finally {
      process.env.OPENROUTER_MODEL = originalEnv;
    }
  });

  test("10. Missing API key returns fallback gracefully", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const provider = new OpenRouterProvider();
      const intent = await provider.generateIntent({
        message: "Under 8k",
        currentState: { ...dummyState, topic: "office chair" },
        conversationHistory: [],
      });

      assert.equal(intent.type, "UPDATE_SEARCH");
      assert.equal(intent.updates.maxPrice, 8000);
    } finally {
      if (originalApiKey) process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  });
});
