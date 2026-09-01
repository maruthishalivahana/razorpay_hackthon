import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Conversation from "../../models/Conversation.js";
import { runBuyerAgent } from "../buyerAgent.js";
import {
  createConversation,
  getConversation,
  expireConversation,
} from "../../services/conversationService.js";
import { AppCustomError } from "../../services/negotiationService.js";
import type { LLMProvider } from "../../llm/llmProvider.js";
import { localFallbackIntent } from "../intentNormalizer.js";

const testMockProvider: LLMProvider = {
  name: "test-mock-provider",
  async generateIntent({ message, currentState }) {
    return localFallbackIntent(message, currentState);
  },
  async generateResponse({ products, buyerState }) {
    if (products.length === 0) {
      return "No matching products were found for your request.";
    }
    const topicStr = buyerState.topic ? ` matching "${buyerState.topic}"` : "";
    const listStr = products
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.name} — ₹${p.price.toLocaleString("en-IN")}`)
      .join("\n");
    return `Found ${products.length} product${products.length > 1 ? "s" : ""}${topicStr}.\n\n${listStr}`;
  },
};

describe("Buyer Agent MongoDB Persistence Tests", () => {
  let merchant: IMerchant;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-pers-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-PERS-.*/ });
    await Conversation.deleteMany({ conversationId: /^conv_pers_/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-pers-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-PERS-.*/ });
    await Conversation.deleteMany({ conversationId: /^conv_pers_/ });

    const timestamp = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Persist Merchant",
      businessName: "Persist Business",
      email: `test-pers-${timestamp}@example.com`,
      currency: "INR",
      status: "active",
    });

    await Product.create([
      {
        merchantId: merchant._id,
        name: "Ergonomic laptop",
        description: "High back mesh laptop with lumbar support",
        category: "Office Furniture",
        sku: `SKU-PERS-1-${timestamp}`,
        price: 7500,
        costPrice: 5000,
        currency: "INR",
        inventory: 10,
        status: "active",
      },
      {
        merchantId: merchant._id,
        name: "Executive Leather Chair",
        description: "Premium leather executive chair",
        category: "Office Furniture",
        sku: `SKU-PERS-2-${timestamp}`,
        price: 12000,
        costPrice: 8000,
        currency: "INR",
        inventory: 5,
        status: "active",
      },
      {
        merchantId: merchant._id,
        name: "Dell XPS 15 Laptop",
        description: "15-inch Intel i7 16GB RAM Laptop",
        category: "Laptop",
        sku: `SKU-PERS-3-${timestamp}`,
        price: 95000,
        costPrice: 80000,
        currency: "INR",
        inventory: 4,
        status: "active",
      },
    ]);
  });

  test("1. First message creates new MongoDB conversation and returns conversationId", async () => {
    const res = await runBuyerAgent({ message: "I want an laptop", provider: testMockProvider });

    assert.ok(res.conversationId);
    assert.ok(res.conversationId.startsWith("conv_"));

    const doc = await Conversation.findOne({ conversationId: res.conversationId });
    assert.ok(doc);
    assert.equal(doc?.status, "active");
    assert.equal(doc?.buyerState.topic, "laptop");
    assert.equal(doc?.messages.length, 2); // 1 user + 1 assistant
  });

  test("2. Follow-up loads existing MongoDB state & merges new intent", async () => {
    // Turn 1
    const res1 = await runBuyerAgent({ message: "I want an laptop", provider: testMockProvider });
    const convId = res1.conversationId;

    // Turn 2
    const res2 = await runBuyerAgent({
      conversationId: convId,
      message: "Under ₹8,000",
      provider: testMockProvider,
    });

    assert.equal(res2.conversationId, convId);
    assert.equal(res2.searchState.topic, "laptop");
    assert.equal(res2.searchState.maxPrice, 8000);

    const doc = await Conversation.findOne({ conversationId: convId });
    assert.equal(doc?.buyerState.topic, "laptop");
    assert.equal(doc?.buyerState.maxPrice, 8000);
    assert.equal(doc?.messages.length, 4); // 2 turns = 4 messages
  });

  test("3. Three-turn conversation preserves all state in MongoDB", async () => {
    const res1 = await runBuyerAgent({ message: "I want an laptop", provider: testMockProvider });
    const convId = res1.conversationId;

    await runBuyerAgent({ conversationId: convId, message: "Under ₹8,000", provider: testMockProvider });
    const res3 = await runBuyerAgent({ conversationId: convId, message: "I need 5", provider: testMockProvider });

    assert.equal(res3.searchState.topic, "laptop");
    assert.equal(res3.searchState.maxPrice, 8000);
    assert.equal(res3.searchState.quantity, 5);

    const doc = await Conversation.findOne({ conversationId: convId });
    assert.equal(doc?.buyerState.quantity, 5);
    assert.equal(doc?.messages.length, 6);
  });

  test("4. Invalid supplied conversationId returns CONVERSATION_NOT_FOUND (404)", async () => {
    await assert.rejects(
      async () =>
        runBuyerAgent({
          conversationId: "conv_nonexistent_999999",
          message: "Under 8000",
          provider: testMockProvider,
        }),
      (err: any) =>
        err instanceof AppCustomError &&
        err.code === "CONVERSATION_NOT_FOUND" &&
        err.statusCode === 404
    );
  });

  test("5. Expired conversation returns CONVERSATION_EXPIRED (410)", async () => {
    const newConv = await createConversation({}, "conv_pers_expired_test");
    await expireConversation(newConv.conversationId);

    await assert.rejects(
      async () =>
        runBuyerAgent({
          conversationId: "conv_pers_expired_test",
          message: "Under 8000",
          provider: testMockProvider,
        }),
      (err: any) =>
        err instanceof AppCustomError &&
        err.code === "CONVERSATION_EXPIRED" &&
        err.statusCode === 410
    );
  });

  test("6. Server restart simulation: state retrieves from MongoDB seamlessly", async () => {
    // Turn 1
    const res1 = await runBuyerAgent({ message: "I want an laptop", provider: testMockProvider });
    const convId = res1.conversationId;

    // Turn 2
    await runBuyerAgent({ conversationId: convId, message: "Under ₹8,000", provider: testMockProvider });

    // SIMULATE SERVER RESTART:
    const docBeforeRestart = await getConversation(convId);
    assert.ok(docBeforeRestart);
    assert.equal(docBeforeRestart.buyerState.topic, "laptop");

    // Turn 3 after restart simulation
    const res3 = await runBuyerAgent({
      conversationId: convId,
      message: "I need 5",
      provider: testMockProvider,
    });

    assert.equal(res3.searchState.topic, "laptop");
    assert.equal(res3.searchState.maxPrice, 8000);
    assert.equal(res3.searchState.quantity, 5);
  });

  test("7. Multi-conversation isolation in MongoDB", async () => {
    const resA1 = await runBuyerAgent({ message: "I want laptops", provider: testMockProvider });
    const resB1 = await runBuyerAgent({ message: "I want laptops", provider: testMockProvider });

    const convA = resA1.conversationId;
    const convB = resB1.conversationId;

    await runBuyerAgent({ conversationId: convA, message: "Under 8000", provider: testMockProvider });

    const docA = await getConversation(convA);
    const docB = await getConversation(convB);

    assert.ok(docA?.buyerState.topic?.toLowerCase().startsWith("laptop"));
    assert.equal(docA?.buyerState.maxPrice, 8000);

    assert.ok(docB?.buyerState.topic?.toLowerCase().startsWith("laptop"));
    assert.equal(docB?.buyerState.maxPrice, null);
  });

  test("8. 7-Turn regression flow (Section 38)", async () => {
    // TURN 1: "I want to buy an laptop"
    const t1 = await runBuyerAgent({ message: "I want to buy an laptop", provider: testMockProvider });
    const convId = t1.conversationId;
    assert.equal(t1.searchState.topic, "laptop");

    // TURN 2: "Show me under ₹8,000"
    const t2 = await runBuyerAgent({ conversationId: convId, message: "Show me under ₹8,000", provider: testMockProvider });
    assert.equal(t2.searchState.topic, "laptop");
    assert.equal(t2.searchState.maxPrice, 8000);

    // TURN 3: "I need 5"
    const t3 = await runBuyerAgent({ conversationId: convId, message: "I need 5", provider: testMockProvider });
    assert.equal(t3.searchState.topic, "laptop");
    assert.equal(t3.searchState.maxPrice, 8000);
    assert.equal(t3.searchState.quantity, 5);

    // TURN 4: "Which one is cheapest?"
    const t4 = await runBuyerAgent({ conversationId: convId, message: "Which one is cheapest?", provider: testMockProvider });
    assert.equal(t4.searchState.topic, "laptop");
    assert.equal(t4.searchState.maxPrice, 8000);
    assert.equal(t4.searchState.quantity, 5);
    assert.equal(t4.searchState.sortBy, "price_asc");

    // TURN 5: "Actually make it under ₹10,000"
    const t5 = await runBuyerAgent({ conversationId: convId, message: "Actually make it under ₹10,000", provider: testMockProvider });
    assert.equal(t5.searchState.topic, "laptop");
    assert.equal(t5.searchState.maxPrice, 10000);
    assert.equal(t5.searchState.quantity, 5);
    assert.equal(t5.searchState.sortBy, "price_asc");

    // TURN 6: "Start over"
    const t6 = await runBuyerAgent({ conversationId: convId, message: "Start over", provider: testMockProvider });
    assert.equal(t6.searchState.topic, null);
    assert.equal(t6.searchState.maxPrice, null);

    // TURN 7: "Show me laptops"
    const t7 = await runBuyerAgent({ conversationId: convId, message: "Show me laptops", provider: testMockProvider });
    assert.equal(t7.searchState.topic, "laptop");
    assert.equal(t7.searchState.maxPrice, null);
  });

  test("9. Zero-result search preserves topic and constraints (Section 39)", async () => {
    // Turn 1
    const res1 = await runBuyerAgent({ message: "I want an laptop", provider: testMockProvider });
    const convId = res1.conversationId;
    assert.equal(res1.searchState.topic, "laptop");

    // Turn 2: "Under ₹1" -> Zero results!
    const res2 = await runBuyerAgent({ conversationId: convId, message: "Under ₹1", provider: testMockProvider });
    assert.equal(res2.products.length, 0);
    assert.equal(res2.searchState.topic, "laptop"); // PRESERVED!
    assert.equal(res2.searchState.maxPrice, 1); // PRESERVED!

    // Turn 3: "Make it 8000"
    const res3 = await runBuyerAgent({ conversationId: convId, message: "Make it 8000", provider: testMockProvider });
    assert.equal(res3.searchState.topic, "laptop");
    assert.equal(res3.searchState.maxPrice, 8000);
    assert.ok(res3.products.length > 0);
  });
});
