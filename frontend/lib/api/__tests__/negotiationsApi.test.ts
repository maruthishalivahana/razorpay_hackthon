import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchNegotiations,
  fetchNegotiationById,
} from "../negotiations.js";
import type {
  Negotiation,
  NegotiationsListApiResponse,
  SingleNegotiationApiResponse,
} from "@/types/negotiation";

describe("Negotiations API Client", () => {
  // 1. List URL
  it("1. builds list URL with merchant scoping and default parameters", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: NegotiationsListApiResponse = {
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchNegotiations({
        merchantId: "m123",
      });

      assert.ok(requestedUrl.includes("/api/negotiations?merchantId=m123"));
      assert.strictEqual(res.success, true);
      assert.deepEqual(res.data, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Search query
  it("2. passes search query parameter to backend endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: NegotiationsListApiResponse = {
        success: true,
        data: [
          {
            _id: "neg_1",
            merchantId: "m123",
            productId: { name: "Office Chair Pro", sku: "CHAIR-001", price: 10000 },
            status: "ACTIVE",
            quantity: 2,
            currency: "INR",
            originalUnitPrice: 10000,
            currentBuyerOffer: 8500,
            currentMerchantOffer: 9000,
            currentRound: 1,
            maxRounds: 3,
            startedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchNegotiations({
        merchantId: "m123",
        search: "Office Chair",
      });

      assert.ok(requestedUrl.includes("search=Office+Chair") || requestedUrl.includes("search=Office%20Chair"));
      assert.strictEqual(res.data.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Status filter
  it("3. passes status filter when specific status is selected, omits ALL", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrls.push(url.toString());
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await fetchNegotiations({ merchantId: "m123", status: "ACTIVE" });
      await fetchNegotiations({ merchantId: "m123", status: "ALL" });

      assert.ok(requestedUrls[0].includes("status=ACTIVE"));
      assert.ok(!requestedUrls[1].includes("status="));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Pagination
  it("4. includes page and limit pagination parameters correctly", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          pagination: { page: 3, limit: 15, total: 45, totalPages: 3 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await fetchNegotiations({
        page: 3,
        limit: 15,
      });

      assert.ok(requestedUrl.includes("page=3"));
      assert.ok(requestedUrl.includes("limit=15"));
      assert.strictEqual(res.pagination?.page, 3);
      assert.strictEqual(res.pagination?.total, 45);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 5. Detail URL
  it("5. fetches single negotiation details by ID", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    const mockDetail: Negotiation = {
      _id: "neg_detail_1",
      merchantId: { _id: "m123", name: "Merchant Test", businessName: "Acme Store", email: "acme@example.com" },
      productId: { _id: "p1", name: "MacBook Pro 14", sku: "MBP14", price: 120000, category: "Electronics" },
      status: "ACTIVE",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 120000,
      currentBuyerOffer: 110000,
      currentMerchantOffer: 115000,
      currentRound: 2,
      maxRounds: 3,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      freeDeliveryEligible: true,
      conversation: {
        conversationId: "conv_123",
        messages: [
          { role: "user", content: "Can I get a discount?", createdAt: new Date().toISOString() },
          { role: "assistant", content: "I can offer ₹115,000.", createdAt: new Date().toISOString() },
        ],
      },
      auditEvents: [
        {
          eventType: "NEGOTIATION_STARTED",
          actorType: "BUYER",
          description: "Buyer initiated negotiation",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: SingleNegotiationApiResponse = {
        success: true,
        data: mockDetail,
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await fetchNegotiationById("neg_detail_1");

      assert.ok(requestedUrl.includes("/api/negotiations/neg_detail_1"));
      assert.strictEqual(res.data._id, "neg_detail_1");
      assert.strictEqual(res.data.freeDeliveryEligible, true);
      assert.strictEqual(res.data.conversation?.messages.length, 2);
      assert.strictEqual(res.data.auditEvents?.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 6. Response Mapping
  it("6. correctly maps nested product, conversation, and offers", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "neg_map_1",
            productId: {
              name: "Ergonomic Chair",
              sku: "EC-01",
              price: 15000,
            },
            status: "ACCEPTED",
            currentBuyerOffer: 13500,
            currentMerchantOffer: 13500,
            acceptedPrice: 13500,
            finalOrderValue: 27000,
            quantity: 2,
            currency: "INR",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await fetchNegotiationById("neg_map_1");
      assert.strictEqual(res.data.status, "ACCEPTED");
      assert.strictEqual(res.data.acceptedPrice, 13500);
      assert.strictEqual(res.data.finalOrderValue, 27000);
      assert.strictEqual(res.data.quantity, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7. Error Handling
  it("7. handles HTTP error responses cleanly without crashing", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Negotiation not found",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => fetchNegotiationById("non_existent_id"),
        (err: Error) => err.message.includes("404") || err.message.includes("Negotiation not found") || err.message.includes("API request failed")
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
