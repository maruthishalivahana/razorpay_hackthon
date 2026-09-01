import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import { searchProductsTool } from "../tools/buyerTools.js";
import { runBuyerAgent } from "../buyerAgent.js";
import { AppCustomError } from "../../services/negotiationService.js";

describe("Buyer Agent & Tools Unit Tests", () => {
  let merchant: IMerchant;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-agent-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-AGENT-.*/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-agent-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-AGENT-.*/ });
    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Agent Merchant",
      businessName: "Agent Business",
      email: `test-agent-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
    });

    await Product.create([
      {
        merchantId: merchant._id,
        name: "Lenovo IdeaPad 5",
        description: "15-inch laptop, 16GB RAM",
        category: "Laptop",
        sku: `SKU-AGENT-1-${timestamp}`,
        price: 45000,
        costPrice: 35000,
        currency: "INR",
        inventory: 10,
        status: "active",
      },
      {
        merchantId: merchant._id,
        name: "ASUS ROG Gaming Laptop",
        description: "High performance gaming laptop",
        category: "Laptop",
        sku: `SKU-AGENT-2-${timestamp}`,
        price: 75000,
        costPrice: 55000,
        currency: "INR",
        inventory: 2,
        status: "active",
      },
    ]);
  });

  test("TEST 1: Laptop under 50k request via Search Tool", async () => {
    const res = await searchProductsTool({
      merchantId: merchant._id.toString(),
      query: "laptop",
      maxPrice: 50000,
      limit: 5,
    });
    assert.equal(res.success, true);
    assert.equal(res.returned, 1);
    assert.equal(res.products[0].name, "Lenovo IdeaPad 5");
  });

  test("TEST 2: Product search tool invocation returns structured data without private fields", async () => {
    const res = await searchProductsTool({
      merchantId: merchant._id.toString(),
      query: "laptop",
    });
    assert.ok(res.products.length > 0);
    const prod: any = res.products[0];
    assert.equal(prod.costPrice, undefined); // Cost price masked
  });

  test("TEST 3: Structured search parameters correctly validated", async () => {
    const res = await searchProductsTool({
      merchantId: merchant._id.toString(),
      category: "Laptop",
      minPrice: 40000,
      maxPrice: 80000,
      limit: 2,
      sortBy: "price_asc",
    });
    assert.equal(res.returned, 2);
    assert.equal(res.products[0].price, 45000);
    assert.equal(res.products[1].price, 75000);
  });

  test("TEST 4: Empty result handling", async () => {
    const res = await searchProductsTool({
      merchantId: merchant._id.toString(),
      query: "NonExistentLaptopModelX",
    });
    assert.equal(res.success, true);
    assert.equal(res.returned, 0);
    assert.equal(res.products.length, 0);
  });

  test("TEST 5: Natural language empty input validation", async () => {
    await assert.rejects(
      async () => runBuyerAgent(""),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_INPUT"
    );
  });

  test("TEST 6: Hard max-price constraint excludes products above maxPrice", async () => {
    const res = await searchProductsTool({
      merchantId: merchant._id.toString(),
      query: "laptop",
      maxPrice: 50000,
    });
    const prices = res.products.map((p) => p.price);
    assert.ok(!prices.includes(75000));
  });

  test("TEST 7: Quantity requirement filters insufficient stock", async () => {
    const res = await searchProductsTool({
      merchantId: merchant._id.toString(),
      query: "laptop",
      quantity: 5,
    });
    // Lenovo has 10 (included), ASUS has 2 (excluded)
    assert.equal(res.returned, 1);
    assert.equal(res.products[0].name, "Lenovo IdeaPad 5");
  });

  test("TEST 8: No fabricated products in tool output", async () => {
    const res = await searchProductsTool({
      query: "SmartPhone123",
    });
    assert.equal(res.products.length, 0);
  });

  test("TEST 9: Invalid search parameter handling", async () => {
    await assert.rejects(
      async () =>
        searchProductsTool({
          minPrice: 50000,
          maxPrice: 30000,
        }),
      (err: any) => err instanceof AppCustomError && err.code === "INVALID_SEARCH_PARAMS"
    );
  });

  test("TEST 10: Missing LLM API key handling in Buyer Agent falls back gracefully", async () => {
    const originalGemini = process.env.GEMINI_API_KEY;
    const originalOpenRouter = process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const res = await runBuyerAgent("Find laptops under 50k");
      assert.ok(res.conversationId);
      assert.equal(res.searchState.topic, "laptop");
      assert.equal(res.searchState.maxPrice, 50000);
      assert.ok(res.message.length > 0);
    } finally {
      if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
      if (originalOpenRouter) process.env.OPENROUTER_API_KEY = originalOpenRouter;
    }
  });
});
