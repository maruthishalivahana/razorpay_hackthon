import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import {
  createProduct,
  getProductById,
  getProducts,
  updateProduct,
  toPublicProduct,
} from "../productService.js";
import { createProductSchema, updateProductSchema, imageUrlSchema } from "../../utils/validation.js";

describe("Product Image URL Persistence & Validation Test Suite", () => {
  let merchant: IMerchant;

  before(async () => {
    await connectDB();
    const ts = Date.now();
    merchant = await Merchant.create({
      name: "Image Persistence Merchant",
      businessName: "Image Tech Store",
      email: `img-persistence-${ts}@example.com`,
      currency: "INR",
      status: "active",
    });
  });

  after(async () => {
    await Merchant.deleteMany({ email: /img-persistence-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-PERSIST-.*/ });
    await mongoose.disconnect();
  });

  // 1. Create product with image URL
  test("1. Create product with valid HTTP/HTTPS image URL", async () => {
    const sku = `SKU-PERSIST-1-${Date.now()}`;
    const testUrl = "https://example.com/macbook.jpg";

    const created = await createProduct({
      merchantId: merchant._id,
      name: "MacBook Pro 14",
      description: "Apple M3 Pro laptop with Liquid Retina XDR",
      category: "Electronics",
      sku,
      price: 150000,
      costPrice: 120000,
      imageUrl: testUrl,
    });

    assert.ok(created._id);
    assert.strictEqual(created.imageUrl, testUrl);
  });

  // 2. Image URL is persisted to MongoDB
  test("2. Image URL is persisted exactly to MongoDB document without corruption", async () => {
    const sku = `SKU-PERSIST-2-${Date.now()}`;
    const testUrl = "https://cdn.example.com/products/macbook-pro.png";

    const created = await createProduct({
      merchantId: merchant._id,
      name: "MacBook Pro 16",
      description: "Apple M3 Max laptop",
      category: "Electronics",
      sku,
      price: 250000,
      costPrice: 200000,
      imageUrl: testUrl,
    });

    const rawMongoDoc = await Product.findById(created._id).lean();
    assert.ok(rawMongoDoc);
    assert.strictEqual((rawMongoDoc as any).imageUrl, testUrl);
    // Preserves exact external URL without prepending localhost or /uploads/
    assert.ok(!((rawMongoDoc as any).imageUrl.includes("localhost")));
    assert.ok(!((rawMongoDoc as any).imageUrl.includes("/uploads/")));
  });

  // 3. GET /api/products returns image URL
  test("3. GET /api/products list query returns exact imageUrl in product object", async () => {
    const sku = `SKU-PERSIST-3-${Date.now()}`;
    const testUrl = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8";

    await createProduct({
      merchantId: merchant._id,
      name: "Desk Setup Chair",
      description: "Ergonomic chair",
      category: "Furniture",
      sku,
      price: 18000,
      costPrice: 12000,
      imageUrl: testUrl,
    });

    const listRes = await getProducts({ search: "Desk Setup Chair" });
    const item = listRes.data.find((p) => p.sku === sku);
    assert.ok(item, "Product should be found in getProducts list");
    assert.strictEqual(item.imageUrl, testUrl, "Product list item must include exact imageUrl");
  });

  // 4. Product card projection displays image URL (toPublicProduct)
  test("4. Buyer and client product card projection retains imageUrl", () => {
    const mockProduct = {
      _id: new mongoose.Types.ObjectId(),
      merchantId: merchant._id,
      name: "MacBook Air M2",
      description: "Thin and light laptop",
      category: "Electronics",
      sku: "MBA-M2-001",
      price: 99900,
      currency: "INR",
      inventory: 15,
      deliveryDays: 2,
      imageUrl: "https://example.com/macbook-air.jpg",
      isNegotiable: true,
    } as any;

    const publicProduct = toPublicProduct(mockProduct);
    assert.strictEqual(publicProduct.imageUrl, "https://example.com/macbook-air.jpg");
    assert.strictEqual(publicProduct.name, "MacBook Air M2");
  });

  // 5. Refresh / repeated fetch preserves image
  test("5. Re-fetching product by ID preserves exact image URL (simulating page refresh)", async () => {
    const sku = `SKU-PERSIST-5-${Date.now()}`;
    const testUrl = "https://example.com/persistent-macbook.jpg";

    const created = await createProduct({
      merchantId: merchant._id,
      name: "Persistent MacBook",
      description: "Testing refresh resilience",
      category: "Electronics",
      sku,
      price: 110000,
      costPrice: 85000,
      imageUrl: testUrl,
    });

    // Simulate first fetch
    const fetch1 = await getProductById(created._id.toString());
    assert.strictEqual(fetch1.imageUrl, testUrl);

    // Simulate second fetch (page refresh)
    const fetch2 = await getProductById(created._id.toString());
    assert.strictEqual(fetch2.imageUrl, testUrl);
  });

  // 6. Edit price preserves image URL
  test("6. Updating product price without touching imageUrl preserves existing image URL", async () => {
    const sku = `SKU-PERSIST-6-${Date.now()}`;
    const originalUrl = "https://example.com/original-image.jpg";

    const created = await createProduct({
      merchantId: merchant._id,
      name: "Price Edit Test",
      description: "Testing partial updates",
      category: "Electronics",
      sku,
      price: 50000,
      costPrice: 35000,
      imageUrl: originalUrl,
    });

    // Partial update editing ONLY price
    const updated = await updateProduct(created._id.toString(), { price: 54000 });
    assert.strictEqual(updated.price, 54000);
    assert.strictEqual(updated.imageUrl, originalUrl, "imageUrl must not be cleared or lost on price change");

    // Verify in MongoDB directly
    const reloaded = await Product.findById(created._id).lean();
    assert.strictEqual((reloaded as any).imageUrl, originalUrl);
  });

  // 7. Edit image URL replaces old URL
  test("7. Updating image URL replaces old URL with new URL", async () => {
    const sku = `SKU-PERSIST-7-${Date.now()}`;
    const urlA = "https://example.com/url-a.jpg";
    const urlB = "https://example.com/url-b.jpg";

    const created = await createProduct({
      merchantId: merchant._id,
      name: "Image Swap Test",
      description: "Testing image URL replacement",
      category: "Electronics",
      sku,
      price: 60000,
      costPrice: 42000,
      imageUrl: urlA,
    });

    assert.strictEqual(created.imageUrl, urlA);

    // Update with urlB
    const updated = await updateProduct(created._id.toString(), { imageUrl: urlB });
    assert.strictEqual(updated.imageUrl, urlB, "imageUrl must be replaced with urlB");

    // Verify in MongoDB directly
    const reloaded = await Product.findById(created._id).lean();
    assert.strictEqual((reloaded as any).imageUrl, urlB);
  });

  // 8. Invalid URL is handled appropriately
  test("8. Validation rejects invalid URLs (javascript:, blob:, file:, non-URLs)", () => {
    const validHttp = imageUrlSchema.safeParse("http://example.com/item.png");
    assert.equal(validHttp.success, true);

    const validHttps = imageUrlSchema.safeParse("https://cdn.example.com/item.jpg");
    assert.equal(validHttps.success, true);

    const emptyUrl = imageUrlSchema.safeParse("");
    assert.equal(emptyUrl.success, true);

    const undefinedUrl = imageUrlSchema.safeParse(undefined);
    assert.equal(undefinedUrl.success, true);

    const nullUrl = imageUrlSchema.safeParse(null);
    assert.equal(nullUrl.success, true);

    // Security rejections:
    const jsUrl = imageUrlSchema.safeParse("javascript:alert(1)");
    assert.equal(jsUrl.success, false, "Must reject javascript: pseudo-protocol");

    const blobUrl = imageUrlSchema.safeParse("blob:http://localhost:3000/1234");
    assert.equal(blobUrl.success, false, "Must reject blob: URLs");

    const fileUrl = imageUrlSchema.safeParse("file:///etc/passwd");
    assert.equal(fileUrl.success, false, "Must reject file: URLs");

    const relativePath = imageUrlSchema.safeParse("/uploads/product.png");
    assert.equal(relativePath.success, false, "Must reject relative filesystem paths");

    const notAUrl = imageUrlSchema.safeParse("not a url");
    assert.equal(notAUrl.success, false, "Must reject arbitrary non-URL strings");
  });
});
