import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchMerchantPolicy, updatePolicy } from "../policies.js";

describe("Policy API client", () => {
  it("fetches merchant policy correctly", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            merchantId: "m123",
            name: "Default Policy",
            maxDiscountPercent: 10,
            freeShippingThreshold: 5000,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await fetchMerchantPolicy("m123");
      assert.ok(requestedUrl.includes("/api/policies/merchant/m123"));
      assert.equal(res.data.maxDiscountPercent, 10);
      assert.equal(res.data.freeShippingThreshold, 5000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates policy correctly using PUT request", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestBody = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestBody = init?.body ? String(init.body) : "";
      return new Response(
        JSON.stringify({
          success: true,
          data: { id: "p123", maxDiscountPercent: 15, freeShippingThreshold: 10000 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await updatePolicy("p123", {
        maxDiscountPercent: 15,
        freeShippingThreshold: 10000,
      });

      assert.equal(requestedMethod, "PUT");
      assert.ok(requestBody.includes('"maxDiscountPercent":15'));
      assert.ok(requestBody.includes('"freeShippingThreshold":10000'));
      assert.equal(res.data.maxDiscountPercent, 15);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates policy using POST request with credentials included", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestedCredentials = "";
    let requestBody = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestedCredentials = init?.credentials ? String(init.credentials) : "";
      requestBody = init?.body ? String(init.body) : "";
      return new Response(
        JSON.stringify({
          success: true,
          data: { id: "p456", name: "New Policy", maxDiscountPercent: 10 },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const { createPolicy } = await import("../policies.js");
      const res = await createPolicy({
        merchantId: "m123",
        name: "New Policy",
        maxDiscountPercent: 10,
      });

      assert.equal(requestedMethod, "POST");
      assert.equal(requestedCredentials, "include");
      assert.ok(requestBody.includes('"name":"New Policy"'));
      assert.equal(res.data.name, "New Policy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
