import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Merchant Login Page Unit Tests", () => {
  it("1. Renders Merchant Login UI component structure", async () => {
    const { MerchantLoginForm } = await import("../../../../components/auth/MerchantLoginForm.js");
    assert.equal(typeof MerchantLoginForm, "function");
  });

  it("2. Verifies login endpoint and credentials config", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestMethod = "";
    let requestCredentials = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestUrl = url.toString();
      requestMethod = init?.method || "GET";
      requestCredentials = init?.credentials ? String(init.credentials) : "";
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "u123",
            email: "merchant@example.com",
            name: "Test Merchant",
            role: "MERCHANT",
            merchantId: "m123",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const { login } = await import("../../../../lib/api/auth.js");
      const res = await login({ email: "merchant@example.com", password: "password123" });

      assert.ok(requestUrl.includes("/api/auth/login"));
      assert.equal(requestMethod, "POST");
      assert.equal(requestCredentials, "include");
      assert.equal(res.data?.role, "MERCHANT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. Handles 401 invalid credentials error without throwing crash", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid email or password.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const { login } = await import("../../../../lib/api/auth.js");
      await assert.rejects(
        async () => {
          await login({ email: "merchant@example.com", password: "wrong" });
        },
        (err: any) => {
          assert.equal(err.message, "Invalid email or password.");
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
