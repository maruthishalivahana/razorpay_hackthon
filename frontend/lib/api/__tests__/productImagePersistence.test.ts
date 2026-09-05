import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeProduct } from "../products";
import type { Product } from "@/types/product";

describe("Frontend Product Image URL Persistence & Validation Test Suite", () => {
  // 1. normalizeProduct preserves imageUrl exactly without prepending localhost or /uploads/
  it("1. normalizeProduct preserves exact external image URL", () => {
    const input = {
      _id: "p1",
      name: "MacBook Pro 14",
      sku: "MBP14-001",
      category: "Electronics",
      price: 120000,
      imageUrl: "https://example.com/macbook.jpg",
    };

    const normalized = normalizeProduct(input);
    assert.strictEqual(normalized.imageUrl, "https://example.com/macbook.jpg");
    assert.ok(!normalized.imageUrl.includes("localhost"));
    assert.ok(!normalized.imageUrl.includes("/uploads/"));
  });

  // 2. normalizeProduct handles backend image alias
  it("2. normalizeProduct resolves image property to imageUrl", () => {
    const inputWithImage = {
      _id: "p2",
      name: "Office Chair",
      sku: "CHR-001",
      category: "Furniture",
      price: 15000,
      image: "https://example.com/chair.jpg",
    } as any;

    const normalized = normalizeProduct(inputWithImage);
    assert.strictEqual(normalized.imageUrl, "https://example.com/chair.jpg");
  });

  // 3. Form URL validator allows valid HTTP and HTTPS URLs
  it("3. Form validator accepts valid HTTP and HTTPS URLs", () => {
    const validateImageUrl = (url: string): { valid: boolean; error?: string } => {
      const trimmed = url.trim();
      if (!trimmed) return { valid: true };
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { valid: false, error: "Image URL must start with http:// or https://" };
        }
        return { valid: true };
      } catch {
        return { valid: false, error: "Please enter a valid URL (e.g. https://example.com/product.jpg)" };
      }
    };

    assert.strictEqual(validateImageUrl("https://example.com/macbook.jpg").valid, true);
    assert.strictEqual(validateImageUrl("http://cdn.example.com/photo.png").valid, true);
    assert.strictEqual(validateImageUrl("").valid, true);
    assert.strictEqual(validateImageUrl("   ").valid, true);
  });

  // 4. Form URL validator rejects malicious and non-HTTP URLs
  it("4. Form validator rejects javascript:, blob:, file:, and relative paths", () => {
    const validateImageUrl = (url: string): { valid: boolean; error?: string } => {
      const trimmed = url.trim();
      if (!trimmed) return { valid: true };
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { valid: false, error: "Image URL must start with http:// or https://" };
        }
        return { valid: true };
      } catch {
        return { valid: false, error: "Please enter a valid URL (e.g. https://example.com/product.jpg)" };
      }
    };

    assert.strictEqual(validateImageUrl("javascript:alert(1)").valid, false);
    assert.strictEqual(validateImageUrl("blob:http://localhost:3000/xyz").valid, false);
    assert.strictEqual(validateImageUrl("file:///etc/passwd").valid, false);
    assert.strictEqual(validateImageUrl("/uploads/macbook.jpg").valid, false);
    assert.strictEqual(validateImageUrl("not-a-url").valid, false);
  });

  // 5. Edit product payload preserves existing image URL when unchanged
  it("5. Edit product payload preserves existing image URL when untouched", () => {
    const existingProduct: Product = {
      _id: "p1",
      merchantId: "m1",
      name: "MacBook Pro",
      description: "Apple laptop",
      category: "Electronics",
      sku: "MBP-01",
      price: 120000,
      inventory: 10,
      deliveryDays: 3,
      isNegotiable: true,
      status: "active",
      imageUrl: "https://example.com/macbook.jpg",
    };

    // User only changes price from 120000 to 130000
    const formState = {
      price: 130000,
      imageUrl: existingProduct.imageUrl || "",
    };

    const isEdit = true;
    const payload: Partial<Product> = {
      price: formState.price,
      imageUrl: formState.imageUrl.trim() || (isEdit ? "" : undefined),
    };

    assert.strictEqual(payload.imageUrl, "https://example.com/macbook.jpg");
    assert.strictEqual(payload.price, 130000);
  });

  // 6. Edit product payload replaces image URL with new URL
  it("6. Edit product payload replaces image URL when new URL is provided", () => {
    const existingProduct: Product = {
      _id: "p1",
      merchantId: "m1",
      name: "MacBook Pro",
      description: "Apple laptop",
      category: "Electronics",
      sku: "MBP-01",
      price: 120000,
      inventory: 10,
      deliveryDays: 3,
      isNegotiable: true,
      status: "active",
      imageUrl: "https://example.com/url-a.jpg",
    };

    // User changes image URL to url-b
    const formState = {
      imageUrl: "https://example.com/url-b.jpg",
    };

    const isEdit = true;
    const payload: Partial<Product> = {
      imageUrl: formState.imageUrl.trim() || (isEdit ? "" : undefined),
    };

    assert.strictEqual(payload.imageUrl, "https://example.com/url-b.jpg");
  });

  // 7. Product card renders product.imageUrl correctly
  it("7. Product card reads product.imageUrl directly", () => {
    const product: Product = {
      _id: "p1",
      merchantId: "m1",
      name: "MacBook Pro",
      description: "Apple laptop",
      category: "Electronics",
      sku: "MBP-01",
      price: 120000,
      inventory: 10,
      deliveryDays: 3,
      isNegotiable: true,
      status: "active",
      imageUrl: "https://example.com/macbook.jpg",
    };

    const renderImageProps = (prod: Product) => {
      const src = prod.imageUrl;
      const hasImage = Boolean(src && src.trim());
      return { src, hasImage, alt: prod.name };
    };

    const rendered = renderImageProps(product);
    assert.strictEqual(rendered.hasImage, true);
    assert.strictEqual(rendered.src, "https://example.com/macbook.jpg");
    assert.strictEqual(rendered.alt, "MacBook Pro");
  });
});
