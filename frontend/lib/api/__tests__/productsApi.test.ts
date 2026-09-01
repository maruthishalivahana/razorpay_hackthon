import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchProducts, createProduct, updateProduct, deleteProduct } from "../products.js";

describe("fetchProducts API client", () => {
  it("builds query parameters correctly", async () => {
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
      await fetchProducts({
        merchantId: "m123",
        search: "chair",
        category: "Furniture",
        status: "active",
        page: 2,
        limit: 10,
      });

      assert.ok(requestedUrl.includes("merchantId=m123"));
      assert.ok(requestedUrl.includes("search=chair"));
      assert.ok(requestedUrl.includes("category=Furniture"));
      assert.ok(requestedUrl.includes("status=active"));
      assert.ok(requestedUrl.includes("page=2"));
      assert.ok(requestedUrl.includes("limit=10"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles 'all' filters by omitting query params", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await fetchProducts({
        category: "all",
        status: "all",
      });

      assert.ok(!requestedUrl.includes("category="));
      assert.ok(!requestedUrl.includes("status="));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates a product using POST request", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestBody = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestBody = init?.body ? String(init.body) : "";
      return new Response(
        JSON.stringify({
          success: true,
          data: { _id: "p1", name: "New Chair", sku: "CHAIR-101", price: 20000 },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await createProduct({
        merchantId: "m123",
        name: "New Chair",
        sku: "CHAIR-101",
        price: 20000,
      });

      assert.equal(requestedMethod, "POST");
      assert.ok(requestBody.includes('"name":"New Chair"'));
      assert.equal(res.data.name, "New Chair");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates a product using PUT request", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestBody = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestBody = init?.body ? String(init.body) : "";
      return new Response(
        JSON.stringify({
          success: true,
          data: { _id: "p1", price: 22000 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await updateProduct("p1", { price: 22000 });

      assert.equal(requestedMethod, "PUT");
      assert.ok(requestBody.includes('"price":22000'));
      assert.equal(res.data.price, 22000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deletes a product using DELETE request", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      return new Response(
        JSON.stringify({
          success: true,
          message: "Product deleted successfully",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await deleteProduct("p1");
      assert.equal(requestedMethod, "DELETE");
      assert.equal(res.success, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
