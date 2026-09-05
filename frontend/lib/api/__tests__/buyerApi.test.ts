import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sendBuyerMessage } from "../buyer.js";
import type { BuyerChatApiResponse } from "@/types/buyer";

describe("Buyer Agent API Client", () => {
  // 1. New message request
  it("1. sends new message request to /api/agents/buyer/chat", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = url.toString();
      requestBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      const mockResponse: BuyerChatApiResponse = {
        success: true,
        data: {
          conversationId: "conv_123",
          message: "I found 2 laptops matching your request.",
          products: [
            {
              id: "p1",
              name: "MacBook Pro 14",
              category: "Electronics",
              price: 120000,
              inventory: 10,
              deliveryDays: 3,
              isNegotiable: true,
              specifications: { ram: "16GB", storage: "512GB" },
            },
          ],
          searchState: { topic: "laptop", maxPrice: 150000 },
          actions: [],
        },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await sendBuyerMessage({
        message: "Find me a MacBook under ₹150,000",
      });

      const body = requestBody as Record<string, unknown> | null;
      assert.ok(requestedUrl.includes("/api/agents/buyer/chat"));
      assert.strictEqual(body?.message, "Find me a MacBook under ₹150,000");
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.conversationId, "conv_123");
      assert.strictEqual(res.data.products.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Includes conversationId in subsequent requests
  it("2. includes conversationId in subsequent requests for state continuity", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            conversationId: "conv_123",
            message: "I can offer ₹115,000.",
            products: [],
            searchState: {},
            actions: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await sendBuyerMessage({
        conversationId: "conv_123",
        message: "Can you give me a better price?",
      });

      const body = requestBody as Record<string, unknown> | null;
      assert.strictEqual(body?.conversationId, "conv_123");
      assert.strictEqual(body?.message, "Can you give me a better price?");
      assert.strictEqual(res.data.conversationId, "conv_123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Action request
  it("3. sends action payload for negotiation acceptance and order placement", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            conversationId: "conv_123",
            message: "Your negotiated price of ₹115,000 has been accepted.",
            products: [],
            searchState: { negotiationStatus: "ACCEPTED" },
            actions: [
              {
                id: "place_order",
                label: "Place Order",
                type: "PLACE_ORDER",
                negotiationId: "neg_1",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await sendBuyerMessage({
        conversationId: "conv_123",
        action: {
          type: "ACCEPT_NEGOTIATION",
          negotiationId: "neg_1",
        },
      });

      const body = requestBody as Record<string, unknown> | null;
      const act = (body?.action as Record<string, unknown>) || {};
      assert.strictEqual(act.type, "ACCEPT_NEGOTIATION");
      assert.strictEqual(act.negotiationId, "neg_1");
      assert.strictEqual(res.data.actions?.length, 1);
      assert.strictEqual(res.data.actions?.[0].type, "PLACE_ORDER");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Error mapping
  it("4. throws clean errors when backend returns HTTP error", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: { message: "No products found matching your search" },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await sendBuyerMessage({ message: "xyz non-existent product" });
        },
        /No products found matching your search/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
