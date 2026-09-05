import { GoogleGenAI, Type } from "@google/genai";
import type { LLMProvider, LLMGenerateIntentInput, LLMGenerateResponseInput } from "./llmProvider.js";
import type { BuyerIntent } from "../agents/buyerState.js";
import {
  sanitizeIntent,
  localFallbackIntent,
  buildIntentSystemInstruction,
  buildStateContext,
} from "../agents/intentNormalizer.js";

const intentResponseSchema = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      enum: [
        "NEW_SEARCH",
        "UPDATE_SEARCH",
        "SELECT_PRODUCT",
        "PRODUCT_DETAILS",
        "START_NEGOTIATION",
        "CONTINUE_NEGOTIATION",
        "BUYER_OFFER",
        "ACCEPT_NEGOTIATION",
        "REQUEST_FREE_DELIVERY",
        "PLACE_ORDER",
        "COMMERCE_QUERY",
        "CLARIFICATION_REQUIRED",
        "OUT_OF_SCOPE",
      ],
    },
    updates: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, nullable: true },
        category: { type: Type.STRING, nullable: true },
        minPrice: { type: Type.NUMBER, nullable: true },
        maxPrice: { type: Type.NUMBER, nullable: true },
        quantity: { type: Type.NUMBER, nullable: true },
        sortBy: { type: Type.STRING, enum: ["relevance", "price_asc", "price_desc"] },
        requirements: { type: Type.OBJECT },
        selectedProductIndex: { type: Type.NUMBER, nullable: true },
        selectedProductReference: { type: Type.STRING, nullable: true },
        buyerOffer: { type: Type.NUMBER, nullable: true },
        discountPercent: { type: Type.NUMBER, nullable: true },
        requestedFreeDelivery: { type: Type.BOOLEAN, nullable: true },
        query: { type: Type.OBJECT },
      },
    },
    clearFields: { type: Type.ARRAY, items: { type: Type.STRING } },
    clarificationQuestion: { type: Type.STRING, nullable: true },
    outOfScopeMessage: { type: Type.STRING, nullable: true },
  },
  required: ["type", "updates"],
};

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private apiKey: string;
  private modelName: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  async generateIntent(input: LLMGenerateIntentInput): Promise<BuyerIntent> {
    const { message, currentState, conversationHistory } = input;

    if (!this.apiKey) {
      return localFallbackIntent(message, currentState);
    }

    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const stateContext = buildStateContext(currentState);
      const recentHistory = conversationHistory.slice(-6);

      const prompt = [
        stateContext,
        "",
        recentHistory.length > 0 ? `RECENT CONVERSATION:\n${recentHistory.map((turn) => `${turn.role === "user" ? "Buyer" : "Agent"}: ${turn.content}`).join("\n")}` : "",
        "",
        `BUYER'S LATEST MESSAGE: "${message}"`,
        "",
        "Analyse the message in context of the current state and produce the intent JSON.",
      ].filter(Boolean).join("\n");

      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: buildIntentSystemInstruction(),
          responseMimeType: "application/json",
          responseSchema: intentResponseSchema,
          temperature: 0.1,
        },
      });

      const rawText = response.text;
      if (!rawText) return localFallbackIntent(message, currentState);

      const parsed = JSON.parse(rawText);
      const sanitized = sanitizeIntent(parsed);
      return sanitized || localFallbackIntent(message, currentState);
    } catch (error: any) {
      console.warn("[GEMINI_PROVIDER] Error generating intent:", error.message || error);
      return localFallbackIntent(message, currentState);
    }
  }

  async generateResponse(input: LLMGenerateResponseInput): Promise<string> {
    const { message, products, buyerState, conversationHistory } = input;

    if (!this.apiKey) {
      return this.buildFallbackResponse(products, buyerState);
    }

    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const safeProducts = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        currency: p.currency,
        category: p.category,
        inventory: p.inventory,
        description: p.description,
      }));

      const systemInstruction = `You are the Buyer Agent for an agentic commerce platform.
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

      let prompt: string;
      if (input.commercialResult) {
        prompt = `USER MESSAGE: "${message}"
COMMERCIAL RESULT FROM BACKEND:
${JSON.stringify(input.commercialResult, null, 2)}
${safeProducts.length > 0 ? `\nPRODUCT INFO:\n${JSON.stringify(safeProducts, null, 2)}` : ""}

Generate a natural, clear, and friendly conversational response to the buyer communicating these backend commercial results accurately. Follow all response generation rules.`;
      } else {
        prompt = `USER MESSAGE: "${message}"
SEARCH RESULTS FOUND (${safeProducts.length} items):
${JSON.stringify(safeProducts, null, 2)}

Provide a friendly, helpful response summarizing the matching products to the buyer.`;
      }

      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
        },
      });

      return response.text || this.buildFallbackResponse(products, buyerState);
    } catch (error: any) {
      console.warn("[GEMINI_PROVIDER] Error generating response:", error.message || error);
      return this.buildFallbackResponse(products, buyerState);
    }
  }

  private buildFallbackResponse(products: any[], state: any): string {
    if (products.length === 0) {
      return `I couldn't find any products matching your requirements.`;
    }
    const listStr = products
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.name} — ₹${p.price.toLocaleString("en-IN")}`)
      .join("\n");
    return `I found ${products.length} products.\n\n${listStr}`;
  }
}
