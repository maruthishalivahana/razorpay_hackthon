import OpenAI from "openai";
import type { LLMProvider, LLMGenerateIntentInput, LLMGenerateResponseInput } from "./llmProvider.js";
import type { BuyerIntent, BuyerState } from "../agents/buyerState.js";
import type { PublicProduct } from "../services/productService.js";
import {
  sanitizeIntent,
  localFallbackIntent,
  buildIntentSystemInstruction,
  buildStateContext,
} from "../agents/intentNormalizer.js";

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  private client: OpenAI | null = null;
  private modelName: string;

  constructor(clientInstance?: OpenAI) {
    this.modelName = process.env.OPENROUTER_MODEL || "openrouter/free";
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (clientInstance) {
      this.client = clientInstance;
    } else if (apiKey) {
      this.client = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://localhost:5000",
          "X-Title": process.env.OPENROUTER_TITLE || "Razorpay Agentic Commerce Prototype",
        },
      });
    }
  }

  async generateIntent(input: LLMGenerateIntentInput): Promise<BuyerIntent> {
    const { message, currentState, conversationHistory } = input;

    if (!this.client && !process.env.OPENROUTER_API_KEY) {
      this.logStatus("intent", "fallback", "LLM_MISSING_API_KEY");
      return localFallbackIntent(message, currentState);
    }

    try {
      const client = this.client || new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
      });

      const stateContext = buildStateContext(currentState);
      const recentHistory = conversationHistory.slice(-6);
      const historyText = recentHistory.length > 0
        ? `RECENT CONVERSATION:\n${recentHistory.map((turn) => `${turn.role === "user" ? "Buyer" : "Agent"}: ${turn.content}`).join("\n")}\n\n`
        : "";

      const prompt = `${stateContext}\n\n${historyText}BUYER'S LATEST MESSAGE: "${message}"\n\nReturn JSON intent according to system instructions.`;

      const completion = await client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: "system", content: buildIntentSystemInstruction() },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const rawText = completion.choices[0]?.message?.content;
      if (!rawText) {
        this.logStatus("intent", "fallback", "LLM_INVALID_RESPONSE");
        return localFallbackIntent(message, currentState);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Try extracting JSON snippet if wrapped in code blocks
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          this.logStatus("intent", "fallback", "LLM_INVALID_RESPONSE");
          return localFallbackIntent(message, currentState);
        }
      }

      const sanitized = sanitizeIntent(parsed);
      if (!sanitized) {
        this.logStatus("intent", "fallback", "LLM_INVALID_RESPONSE");
        return localFallbackIntent(message, currentState);
      }

      this.logStatus("intent", "success");
      return sanitized;
    } catch (error: any) {
      const reason = this.classifyError(error);
      this.logStatus("intent", "fallback", reason);
      return localFallbackIntent(message, currentState);
    }
  }

  async generateResponse(input: LLMGenerateResponseInput): Promise<string> {
    const { message, products, buyerState, conversationHistory } = input;

    if (!this.client && !process.env.OPENROUTER_API_KEY) {
      this.logStatus("response", "fallback", "LLM_MISSING_API_KEY");
      return this.buildFallbackResponse(products, buyerState);
    }

    try {
      const client = this.client || new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
      });

      // Filter products to ONLY buyer-safe fields
      const safeProducts = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        currency: p.currency,
        category: p.category,
        inventory: p.inventory,
        description: p.description,
      }));

      const systemPrompt = `You are the Buyer Agent for an agentic commerce platform.
Your role is to communicate backend decisions clearly and naturally, not to make financial or commercial decisions.

RESPONSE GENERATION RULES:
1. The backend is the ONLY source of truth for: prices, discounts, quantities, inventory, delivery, shipping, merchant policy, negotiation state, agreement state, payment readiness.
2. Never invent or modify backend-provided commercial facts.
3. When backend provides a commercial result, communicate ALL relevant terms in a natural conversational response.
4. Do not use generic hardcoded responses when backend data contains additional commercial terms.
5. If the backend result contains freeDelivery: true, explicitly mention that free delivery is included.
6. If the backend result contains freeDelivery: false, explicitly say that free delivery is not included/available when relevant.
7. If the backend provides unitPrice, quantity, discount, freeDelivery, negotiationStatus, preserve those facts in the response.
8. Never call an offer "final" while negotiationStatus is ACTIVE. Use "current offer" instead.
9. Only describe an offer as accepted/final after the backend says: negotiationStatus = ACCEPTED.
10. Never decide whether an offer is valid yourself. The Economic Engine, Policy Engine, and Negotiation Engine are authoritative.
11. If the backend says the buyer's proposal is valid but still awaiting acceptance, ask whether the buyer wants to accept.
12. If the backend says the proposal is rejected or countered, explain the backend result without changing the values.
13. If the backend result contains free delivery, price, and quantity, communicate the complete commercial offer naturally.
14. If backend data is missing, do not guess it. Present prices in INR (₹).`;

      const recentHistory = conversationHistory.slice(-6);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
      ];

      for (const turn of recentHistory) {
        messages.push({
          role: turn.role === "user" ? "user" : "assistant",
          content: turn.content,
        });
      }

      let contextMsg: string;
      if (input.commercialResult) {
        contextMsg = `USER MESSAGE: "${message}"
COMMERCIAL RESULT FROM BACKEND:
${JSON.stringify(input.commercialResult, null, 2)}
${safeProducts.length > 0 ? `\nPRODUCT INFO:\n${JSON.stringify(safeProducts, null, 2)}` : ""}

Generate a natural, clear, and friendly conversational response to the buyer communicating these backend commercial results accurately. Follow all response generation rules.`;
      } else {
        contextMsg = `USER MESSAGE: "${message}"
SEARCH RESULTS FOUND (${safeProducts.length} items):
${JSON.stringify(safeProducts, null, 2)}

Provide a friendly, helpful, and concise response summarizing the matching products to the buyer.`;
      }

      messages.push({ role: "user", content: contextMsg });

      const completion = await client.chat.completions.create({
        model: this.modelName,
        messages: messages,
        temperature: 0.3,
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        this.logStatus("response", "fallback", "LLM_INVALID_RESPONSE");
        return this.buildFallbackResponse(products, buyerState);
      }

      this.logStatus("response", "success");
      return responseText.trim();
    } catch (error: any) {
      const reason = this.classifyError(error);
      this.logStatus("response", "fallback", reason);
      return this.buildFallbackResponse(products, buyerState);
    }
  }

  private classifyError(error: any): string {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) return "LLM_AUTH_ERROR";
      if (error.status === 429) return "LLM_RATE_LIMITED";
      if (error.status === 400 || error.status === 404) return "LLM_UNAVAILABLE";
      return `LLM_HTTP_${error.status}`;
    }
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.toLowerCase().includes("timeout")) {
        return "LLM_TIMEOUT";
      }
      if (error.message.toLowerCase().includes("fetch failed") || error.message.toLowerCase().includes("econnrefused")) {
        return "LLM_UNAVAILABLE";
      }
    }
    return "LLM_UNKNOWN_ERROR";
  }

  private logStatus(operation: "intent" | "response", status: "success" | "fallback", reason?: string) {
    const logData = {
      tag: "[LLM]",
      provider: "OpenRouter",
      model: this.modelName,
      operation,
      status,
      ...(reason ? { reason } : {}),
    };
    console.log(JSON.stringify(logData));
  }

  private buildFallbackResponse(products: PublicProduct[], state: BuyerState): string {
    if (products.length === 0) {
      return `I couldn't find any products matching your requirements.`;
    }
    const topicStr = state.topic ? ` matching "${state.topic}"` : "";
    const listStr = products
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.name} — ₹${p.price.toLocaleString("en-IN")}`)
      .join("\n");
    return `I found ${products.length} product${products.length > 1 ? "s" : ""}${topicStr}.\n\n${listStr}`;
  }
}
