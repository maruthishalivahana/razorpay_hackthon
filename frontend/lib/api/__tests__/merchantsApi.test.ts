import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchMerchants, updateMerchant } from "../merchants.js";

describe("Merchant API client", () => {
  it("fetches merchants correctly", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: [{ _id: "m123", name: "Test Merchant", businessName: "Test Store", email: "m@test.com" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await fetchMerchants();
      assert.ok(requestedUrl.includes("/api/merchants"));
      assert.equal(res.data.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates merchant correctly using PUT request", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestBody = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestBody = init?.body ? String(init.body) : "";
      return new Response(
        JSON.stringify({
          success: true,
          data: { _id: "m123", agentEnabled: true, agentDescription: "Test agent" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await updateMerchant("m123", {
        agentEnabled: true,
        agentDescription: "Test agent",
      });

      assert.equal(requestedMethod, "PUT");
      assert.ok(requestBody.includes('"agentEnabled":true'));
      assert.equal(res.data.agentEnabled, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
