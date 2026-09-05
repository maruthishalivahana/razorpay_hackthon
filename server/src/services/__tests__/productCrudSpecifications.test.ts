import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import {
  createProduct,
  getProductById,
  updateProduct,
  searchProducts,
} from "../productService.js";

describe("Product CRUD with Specifications & Tags Integration Test", () => {
  let merchant: IMerchant;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-crud-specs-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-CRUD-SPECS-.*/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-crud-specs-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-CRUD-SPECS-.*/ });

    const ts = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Specs Merchant",
      businessName: "Specs Business",
      email: `test-crud-specs-${ts}@example.com`,
      currency: "INR",
      status: "active",
    });
  });

  // 1. Create a MacBook with tags and specifications
  test("1. Create a MacBook with tags and specifications persists all structured data", async () => {
    const ts = Date.now();
    const created = await createProduct({
      merchantId: merchant._id,
      name: "MacBook Pro 14",
      description: "Apple laptop suitable for professional video editing and development",
      category: "Electronics",
      sku: `SKU-CRUD-SPECS-MBP-${ts}`,
      price: 120000,
      costPrice: 95000,
      currency: "INR",
      inventory: 10,
      deliveryDays: 5,
      isNegotiable: true,
      tags: ["apple", "macbook", "laptop", "editing"],
      specifications: new Map<string, any>([
        ["brand", "Apple"],
        ["model", "MacBook Pro"],
        ["ram", "16GB"],
        ["storage", "512GB"],
        ["color", "silver"],
      ]),
    });

    assert.ok(created._id);
    assert.equal(created.name, "MacBook Pro 14");
    assert.deepEqual(created.tags, ["apple", "macbook", "laptop", "editing"]);

    // Fetch from database
    const fetched = await getProductById(created._id.toString());
    assert.ok(fetched);
    assert.equal(fetched.name, "MacBook Pro 14");
    assert.deepEqual(fetched.tags, ["apple", "macbook", "laptop", "editing"]);

    // Verify specifications Map
    assert.ok(fetched.specifications);
    assert.equal(fetched.specifications.get("brand"), "Apple");
    assert.equal(fetched.specifications.get("model"), "MacBook Pro");
    assert.equal(fetched.specifications.get("ram"), "16GB");
    assert.equal(fetched.specifications.get("storage"), "512GB");
    assert.equal(fetched.specifications.get("color"), "silver");
  });

  // 2. Search finds created MacBook by brand and RAM requirements
  test("2. Generic search finds created MacBook using structured specifications (brand=Apple, ram=16GB)", async () => {
    const ts = Date.now();
    await createProduct({
      merchantId: merchant._id,
      name: "MacBook Pro 14",
      description: "Apple laptop suitable for professional video editing",
      category: "Electronics",
      sku: `SKU-CRUD-SPECS-SEARCH-${ts}`,
      price: 120000,
      costPrice: 95000,
      currency: "INR",
      inventory: 5,
      deliveryDays: 3,
      isNegotiable: true,
      tags: ["apple", "macbook", "laptop"],
      specifications: new Map<string, any>([
        ["brand", "Apple"],
        ["ram", "16GB"],
        ["storage", "512GB"],
      ]),
    });

    // Search with brand=Apple and ram=16GB
    const searchRes = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      hardRequirements: { brand: "Apple", ram: "16GB" },
    });

    assert.equal(searchRes.returned, 1);
    assert.equal(searchRes.products[0].name, "MacBook Pro 14");
    assert.equal(searchRes.products[0].specifications?.brand, "Apple");
    assert.equal(searchRes.products[0].specifications?.ram, "16GB");
  });

  // 3. Update RAM from 16GB to 32GB and verify search reflects updated specs
  test("3. Updating specifications (ram: 16GB -> 32GB) persists and updates search results", async () => {
    const ts = Date.now();
    const created = await createProduct({
      merchantId: merchant._id,
      name: "MacBook Pro 14",
      description: "Apple laptop",
      category: "Electronics",
      sku: `SKU-CRUD-SPECS-UPDATE-${ts}`,
      price: 120000,
      costPrice: 95000,
      currency: "INR",
      inventory: 5,
      deliveryDays: 3,
      isNegotiable: true,
      tags: ["apple", "macbook"],
      specifications: new Map<string, any>([
        ["brand", "Apple"],
        ["ram", "16GB"],
        ["storage", "512GB"],
      ]),
    });

    // Update RAM to 32GB
    const updated = await updateProduct(created._id.toString(), {
      price: 150000,
      specifications: new Map<string, any>([
        ["brand", "Apple"],
        ["ram", "32GB"],
        ["storage", "1TB"],
      ]),
    });

    assert.equal(updated.price, 150000);
    assert.equal(updated.specifications?.get("ram"), "32GB");
    assert.equal(updated.specifications?.get("storage"), "1TB");

    // Search for 16GB should now return 0 results
    const search16 = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { brand: "Apple", ram: "16GB" },
    });
    assert.equal(search16.returned, 0);

    // Search for 32GB should return the updated product
    const search32 = await searchProducts({
      merchantId: merchant._id.toString(),
      hardRequirements: { brand: "Apple", ram: "32GB" },
    });
    assert.equal(search32.returned, 1);
    assert.equal(search32.products[0].name, "MacBook Pro 14");
    assert.equal(search32.products[0].specifications?.ram, "32GB");
  });
});
