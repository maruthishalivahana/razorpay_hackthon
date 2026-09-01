import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchNegotiations, fetchNegotiationById } from "../negotiations.js";

describe("Negotiations API client", () => {
  it("fetches negotiations list with query parameters", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await fetchNegotiations({
        merchantId: "m123",
        status: "ACTIVE",
        search: "chair",
        page: 1,
        limit: 20,
      });

      assert.ok(requestedUrl.includes("/api/negotiations"));
      assert.ok(requestedUrl.includes("merchantId=m123"));
      assert.ok(requestedUrl.includes("status=ACTIVE"));
      assert.ok(requestedUrl.includes("search=chair"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetches single negotiation by ID", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: { _id: "neg123", status: "ACTIVE", quantity: 5, currentRound: 1, maxRounds: 3 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await fetchNegotiationById("neg123");
      assert.ok(requestedUrl.includes("/api/negotiations/neg123"));
      assert.equal(res.data.status, "ACTIVE");
      assert.equal(res.data.quantity, 5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
