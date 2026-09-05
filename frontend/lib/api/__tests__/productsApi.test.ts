import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchProducts,
  fetchProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  normalizeProduct,
} from "../products.js";
import type { SpecificationValue } from "@/types/product";

type RequestPayload = {
  tags?: string[];
  specifications?: Record<string, SpecificationValue>;
  [key: string]: unknown;
};

describe("Products API Client & Data Mapping", () => {
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

  // 1. Create product with tags
  it("1. Create product with tags using POST request", async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = "";
    let requestBody: RequestPayload | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedMethod = init?.method || "GET";
      requestBody = init?.body ? (JSON.parse(String(init.body)) as RequestPayload) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p1",
            name: "MacBook Pro 14",
            sku: "MBP14-001",
            category: "Electronics",
            price: 120000,
            tags: ["apple", "macbook", "laptop", "editing"],
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await createProduct({
        merchantId: "m123",
        name: "MacBook Pro 14",
        sku: "MBP14-001",
        category: "Electronics",
        price: 120000,
        tags: ["apple", "macbook", "laptop", "editing"],
      });

      const body = requestBody as RequestPayload | null;
      assert.equal(requestedMethod, "POST");
      assert.deepEqual(body?.tags, ["apple", "macbook", "laptop", "editing"]);
      assert.deepEqual(res.data.tags, ["apple", "macbook", "laptop", "editing"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Create product with specifications
  it("2. Create product with structured specifications", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: RequestPayload | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as RequestPayload) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p2",
            name: "MacBook Pro 14",
            sku: "MBP14-002",
            price: 120000,
            specifications: {
              brand: "Apple",
              model: "MacBook Pro",
              ram: "16GB",
              storage: "512GB",
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await createProduct({
        merchantId: "m123",
        name: "MacBook Pro 14",
        sku: "MBP14-002",
        price: 120000,
        specifications: {
          brand: "Apple",
          model: "MacBook Pro",
          ram: "16GB",
          storage: "512GB",
        },
      });

      const body = requestBody as RequestPayload | null;
      const specs = body?.specifications;
      assert.equal(specs?.brand, "Apple");
      assert.equal(specs?.ram, "16GB");
      assert.equal(res.data.specifications?.ram, "16GB");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Update tags
  it("3. Update tags on existing product", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: RequestPayload | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as RequestPayload) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p1",
            tags: ["apple", "macbook", "m3-pro"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await updateProduct("p1", {
        tags: ["apple", "macbook", "m3-pro"],
      });

      const body = requestBody as RequestPayload | null;
      assert.deepEqual(body?.tags, ["apple", "macbook", "m3-pro"]);
      assert.deepEqual(res.data.tags, ["apple", "macbook", "m3-pro"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Update specifications
  it("4. Update specifications on existing product (e.g. ram: 16GB -> 32GB)", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: RequestPayload | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as RequestPayload) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p1",
            specifications: {
              brand: "Apple",
              ram: "32GB",
              storage: "1TB",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await updateProduct("p1", {
        specifications: {
          brand: "Apple",
          ram: "32GB",
          storage: "1TB",
        },
      });

      const body = requestBody as RequestPayload | null;
      const specs = body?.specifications;
      assert.equal(specs?.ram, "32GB");
      assert.equal(res.data.specifications?.ram, "32GB");
      assert.equal(res.data.specifications?.storage, "1TB");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 5. Empty specifications
  it("5. Handles empty specifications cleanly without error", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p3",
            name: "Sugar 5kg",
            specifications: {},
            tags: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await fetchProductById("p3");
      assert.deepEqual(res.data.specifications, {});
      assert.deepEqual(res.data.tags, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 6. Boolean specification
  it("6. Preserves boolean specifications (e.g. ergonomic: true, waterproof: false)", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: RequestPayload | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as RequestPayload) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p4",
            name: "Office Chair",
            specifications: {
              ergonomic: true,
              adjustableHeight: true,
              waterproof: false,
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await createProduct({
        merchantId: "m123",
        name: "Office Chair",
        specifications: {
          ergonomic: true,
          adjustableHeight: true,
          waterproof: false,
        },
      });

      const body = requestBody as RequestPayload | null;
      const specs = body?.specifications;
      assert.strictEqual(specs?.ergonomic, true);
      assert.strictEqual(specs?.waterproof, false);
      assert.strictEqual(res.data.specifications?.ergonomic, true);
      assert.strictEqual(res.data.specifications?.waterproof, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7. Number specification
  it("7. Preserves numeric specifications (e.g. screenSize: 14, seats: 3)", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: RequestPayload | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as RequestPayload) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p5",
            name: "MacBook Pro",
            specifications: {
              screenSize: 14,
              batteryLifeHours: 22,
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await createProduct({
        merchantId: "m123",
        name: "MacBook Pro",
        specifications: {
          screenSize: 14,
          batteryLifeHours: 22,
        },
      });

      const body = requestBody as RequestPayload | null;
      const specs = body?.specifications;
      assert.strictEqual(specs?.screenSize, 14);
      assert.strictEqual(typeof specs?.screenSize, "number");
      assert.strictEqual(res.data.specifications?.screenSize, 14);
      assert.strictEqual(typeof res.data.specifications?.screenSize, "number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 8. String specification
  it("8. Preserves string specifications (e.g. brand: 'Nike', color: 'black')", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p6",
            name: "Nike Shoes",
            specifications: {
              brand: "Nike",
              color: "black",
              size: "10",
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await createProduct({
        merchantId: "m123",
        name: "Nike Shoes",
        specifications: {
          brand: "Nike",
          color: "black",
          size: "10",
        },
      });

      assert.strictEqual(res.data.specifications?.brand, "Nike");
      assert.strictEqual(res.data.specifications?.color, "black");
      assert.strictEqual(res.data.specifications?.size, "10");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 9. Removing specifications
  it("9. Removing specifications sends empty object and clears them", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: RequestPayload | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body ? (JSON.parse(String(init.body)) as RequestPayload) : null;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            _id: "p7",
            specifications: {},
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await updateProduct("p7", {
        specifications: {},
      });

      const body = requestBody as RequestPayload | null;
      assert.deepEqual(body?.specifications, {});
      assert.deepEqual(res.data.specifications, {});
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 10. normalizeProduct with Map/object conversion
  it("10. normalizeProduct converts ES6 Map instance to plain object", () => {
    const specsMap = new Map<string, SpecificationValue>([
      ["brand", "Apple"],
      ["ram", "16GB"],
      ["touchscreen", false],
      ["screenSize", 14],
    ]);

    const rawProduct = {
      _id: "p8",
      name: "MacBook Pro",
      tags: ["apple", "macbook"],
      specifications: specsMap,
    };

    const normalized = normalizeProduct(rawProduct);

    assert.strictEqual(typeof normalized.specifications, "object");
    assert.ok(!(normalized.specifications instanceof Map));
    assert.strictEqual(normalized.specifications?.brand, "Apple");
    assert.strictEqual(normalized.specifications?.ram, "16GB");
    assert.strictEqual(normalized.specifications?.touchscreen, false);
    assert.strictEqual(normalized.specifications?.screenSize, 14);
    assert.deepEqual(normalized.tags, ["apple", "macbook"]);
  });

  // 11. normalizeProduct handles undefined/missing tags and specifications
  it("11. normalizeProduct safely handles missing tags and specifications", () => {
    const rawProduct = {
      _id: "p9",
      name: "Simple Product",
    };

    const normalized = normalizeProduct(rawProduct);

    assert.deepEqual(normalized.tags, []);
    assert.strictEqual(normalized.specifications, undefined);
  });

  // 12. Delete product
  it("12. Deletes a product using DELETE request", async () => {
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
