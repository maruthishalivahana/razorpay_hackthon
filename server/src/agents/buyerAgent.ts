import { GoogleGenAI } from "@google/genai";
import {
  searchProductsTool,
  searchProductsToolDeclaration,
} from "./tools/buyerTools.js";
import type { PublicProduct } from "../services/productService.js";
import { AppCustomError } from "../services/negotiationService.js";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BuyerAgentResult {
  message: string;
  products: PublicProduct[];
}

export const BUYER_AGENT_SYSTEM_INSTRUCTION = `You are a shopping assistant for an agentic commerce platform.

Your job is to help buyers discover products from merchants connected to this platform.

You may use the available product search tool to find products.

Never invent products, prices, inventory, specifications, discounts, shipping information, or merchant policies.

If the buyer specifies a hard constraint such as a maximum price, do not recommend products that violate it.

If search results do not satisfy the buyer's requirements, clearly say that no matching product was found.

Do not negotiate prices unless a negotiation tool is explicitly available.

Do not make payment decisions.

Do not claim that a purchase has happened.

Present search results clearly and concisely.

You are an orchestration layer. Financial and transaction decisions are controlled by deterministic backend services.`;

export const runBuyerAgent = async (
  message: string,
  conversationContext: ConversationTurn[] = []
): Promise<BuyerAgentResult> => {
  console.log("[BUYER_AGENT] User intent detected: PRODUCT_SEARCH");
  console.log(`[BUYER_AGENT] Message: "${message}"`);

  if (!message || message.trim().length === 0) {
    throw new AppCustomError("INVALID_INPUT", "Message text is required", 400);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[BUYER_AGENT] Missing GEMINI_API_KEY in environment");
    throw new AppCustomError(
      "BUYER_AGENT_UNAVAILABLE",
      "The shopping assistant is temporarily unavailable.",
      503
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Format conversation history for Gemini API
    const contents: any[] = [];

    for (const turn of conversationContext) {
      contents.push({
        role: turn.role === "user" ? "user" : "model",
        parts: [{ text: turn.content }],
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    let retrievedProducts: PublicProduct[] = [];

    // Call Gemini with function declarations
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: BUYER_AGENT_SYSTEM_INSTRUCTION,
        tools: [
          {
            functionDeclarations: [searchProductsToolDeclaration],
          },
        ],
      },
    });

    // Check for tool function call
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === "searchProducts") {
        const args = (call.args as any) || {};
        console.log("[BUYER_AGENT] Gemini triggered searchProducts with args:", args);

        const toolResult = await searchProductsTool(args);
        retrievedProducts = toolResult.products;

        // Provide function execution result back to Gemini to generate final response
        contents.push({
          role: "model",
          parts: [
            {
              functionCall: {
                name: call.name,
                args: call.args,
              },
            },
          ],
        });

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: call.name,
                response: {
                  output: toolResult,
                },
              },
            },
          ],
        });

        const secondResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction: BUYER_AGENT_SYSTEM_INSTRUCTION,
          },
        });

        const finalMessage = secondResponse.text || "Here are the search results.";
        return {
          message: finalMessage,
          products: retrievedProducts,
        };
      }
    }

    const naturalMessage = response.text || "I found no matching products for your request.";
    return {
      message: naturalMessage,
      products: retrievedProducts,
    };
  } catch (error: any) {
    if (error instanceof AppCustomError) {
      throw error;
    }
    console.error("[BUYER_AGENT] Error during Gemini agent execution:", error.message || error);
    throw new AppCustomError(
      "BUYER_AGENT_UNAVAILABLE",
      "The shopping assistant is temporarily unavailable.",
      503
    );
  }
};
