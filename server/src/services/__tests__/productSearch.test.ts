import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product, { type IProduct } from "../../models/Product.js";
import { searchProducts } from "../productService.js";
import { AppCustomError } from "../negotiationService.js";

describe("Product Search Service Tests", () => {
  let merchant: IMerchant;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-search-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-SEARCH-.*/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-search-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-SEARCH-.*/ });
    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Search Merchant",
      businessName: "Search Business",
      email: `test-search-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
    });

    await Product.create([
      {
        merchantId: merchant._id,
        name: "Lenovo IdeaPad Slim 3",
        description: "Intel Core i5, 16GB RAM, 512GB SSD storage",
        category: "Laptop",
        sku: `SKU-SEARCH-1-${timestamp}`,
        price: 45000,
        costPrice: 35000,
        currency: "INR",
        inventory: 10,
        status: "active",
        tags: ["laptop", "16gb", "512gb"],
      },
      {
        merchantId: merchant._id,
        name: "ASUS Vivobook 15",
        description: "AMD Ryzen 7, 16GB RAM, 1TB SSD storage",
        category: "Laptop",
        sku: `SKU-SEARCH-2-${timestamp}`,
        price: 48000,
        costPrice: 38000,
        currency: "INR",
        inventory: 5,
        status: "active",
        tags: ["laptop", "16gb", "ryzen"],
      },
      {
        merchantId: merchant._id,
        name: "Dell XPS 13 Premium Laptop",
        description: "Intel Core i7, 32GB RAM, 1TB SSD",
        category: "Laptop",
        sku: `SKU-SEARCH-3-${timestamp}`,
        price: 85000,
        costPrice: 65000,
        currency: "INR",
        inventory: 3,
        status: "active",
        tags: ["laptop", "32gb", "premium"],
      },
      {
        merchantId: merchant._id,
        name: "Acer Aspire 3 Budget Laptop",
        description: "Intel Core i3, 8GB RAM, out of stock model",
        category: "Laptop",
        sku: `SKU-SEARCH-4-${timestamp}`,
        price: 35000,
        costPrice: 25000,
        currency: "INR",
        inventory: 0, // Out of stock
        status: "active",
        tags: ["laptop", "budget"],
      },
      {
        merchantId: merchant._id,
        name: "Ergonomic Mesh Chair",
        description: "High back ergonomic office chair",
        category: "Office Furniture",
        sku: `SKU-SEARCH-5-${timestamp}`,
        price: 12000,
        costPrice: 8000,
        currency: "INR",
        inventory: 15,
        status: "active",
        tags: ["chair", "office"],
      },
    ]);
  });

  test("TEST 1: Search by product name", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "IdeaPad",
    });
    assert.equal(res.returned, 1);
    assert.equal(res.products[0].name, "Lenovo IdeaPad Slim 3");
  });

  test("TEST 2: Search by category", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Laptop",
    });
    // Out of stock (inventory: 0) is excluded by default
    assert.equal(res.returned, 3);
    assert.ok(res.products.every((p) => p.category === "Laptop"));
  });

  test("TEST 3: Maximum price filter", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      maxPrice: 50000,
    });
    assert.equal(res.returned, 2);
    assert.ok(res.products.every((p) => p.price <= 50000));
  });

  test("TEST 4: Minimum price filter", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      minPrice: 50000,
    });
    assert.equal(res.returned, 1);
    assert.equal(res.products[0].name, "Dell XPS 13 Premium Laptop");
  });

  test("TEST 5: Minimum + maximum price", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      minPrice: 40000,
      maxPrice: 50000,
    });
    assert.equal(res.returned, 2);
    assert.ok(res.products.every((p) => p.price >= 40000 && p.price <= 50000));
  });

  test("TEST 6: Inventory filter", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      minInventory: 8,
    });
    assert.ok(res.products.every((p) => p.inventory >= 8));
  });

  test("TEST 7: Quantity availability", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      quantity: 6,
    });
    // Lenovo has 10, ASUS has 5 (excluded), Dell has 3 (excluded)
    assert.equal(res.returned, 1);
    assert.equal(res.products[0].name, "Lenovo IdeaPad Slim 3");
  });

  test("TEST 8: Limit parameter", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Laptop",
      limit: 2,
    });
    assert.equal(res.returned, 2);
  });

  test("TEST 9: Price ascending sorting", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Laptop",
      sortBy: "price_asc",
    });
    assert.equal(res.products[0].price, 45000);
    assert.equal(res.products[1].price, 48000);
    assert.equal(res.products[2].price, 85000);
  });

  test("TEST 10: Price descending sorting", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Laptop",
      sortBy: "price_desc",
    });
    assert.equal(res.products[0].price, 85000);
    assert.equal(res.products[1].price, 48000);
    assert.equal(res.products[2].price, 45000);
  });

  test("TEST 11: Case-insensitive search", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "lApToP",
    });
    assert.equal(res.returned, 3);
  });

  test("TEST 12: No results found", async () => {
    const res = await searchProducts({ query: "NonExistentGadget999" });
    assert.equal(res.returned, 0);
    assert.equal(res.products.length, 0);
  });

  test("TEST 13: Invalid negative price", async () => {
    await assert.rejects(
      async () => searchProducts({ minPrice: -500 }),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_SEARCH_PARAMS"
    );
  });

  test("TEST 14: Invalid price range (minPrice > maxPrice)", async () => {
    await assert.rejects(
      async () => searchProducts({ minPrice: 60000, maxPrice: 40000 }),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_SEARCH_PARAMS"
    );
  });

  test("TEST 15: Limit above 20 rejected", async () => {
    await assert.rejects(
      async () => searchProducts({ limit: 50 }),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_SEARCH_PARAMS"
    );
  });

  test("TEST 16: Exact price boundary", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      minPrice: 48000,
      maxPrice: 48000,
    });
    assert.equal(res.returned, 1);
    assert.equal(res.products[0].price, 48000);
  });

  test("TEST 17: Product exactly at maxPrice is included", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      maxPrice: 48000,
    });
    const prices = res.products.map((p) => p.price);
    assert.ok(prices.includes(48000));
  });

  test("TEST 18: Product above maxPrice is excluded", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      maxPrice: 48000,
    });
    const prices = res.products.map((p) => p.price);
    assert.ok(!prices.includes(85000));
  });

  test("TEST 19: Product with zero inventory excluded when availability required", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      category: "Laptop",
      minInventory: 1,
    });
    const skus = res.products.map((p) => p.name);
    assert.ok(!skus.includes("Acer Aspire 3 Budget Laptop"));
  });

  test("TEST 20: Specification matching", async () => {
    const res = await searchProducts({
      merchantId: merchant._id.toString(),
      query: "laptop",
      requirements: { ram: "32GB" },
    });
    assert.equal(res.returned, 1);
    assert.equal(res.products[0].name, "Dell XPS 13 Premium Laptop");
  });
});
