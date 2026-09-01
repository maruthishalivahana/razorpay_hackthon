import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Conversation from "../../models/Conversation.js";
import { runBuyerAgent } from "../buyerAgent.js";
import {
  createConversation,
  getConversation,
} from "../../services/conversationService.js";
import type { LLMProvider } from "../../llm/llmProvider.js";
import { localFallbackIntent } from "../intentNormalizer.js";

const testMockProvider: LLMProvider = {
  name: "test-mock-provider",
  async generateIntent({ message, currentState }) {
    return localFallbackIntent(message, currentState);
  },
  async generateResponse({ products }) {
    if (products.length === 1) {
      const p = products[0];
      return `You selected ${p.name} at ₹${p.price.toLocaleString("en-IN")}.`;
    }
    if (products.length === 0) {
      return "No matching products found.";
    }
    return `Found ${products.length} products.`;
  },
};

describe("Buyer Agent Product Selection & Details Tests", () => {
  let merchant: IMerchant;
  let p1: any;
  let p2: any;
  let p3: any;
  let pOut: any;
  let pLow: any;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-sel-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-(SEL|DUP)-.*/ });
    await Conversation.deleteMany({ conversationId: /^conv_sel_/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-sel-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-(SEL|DUP)-.*/ });
    await Conversation.deleteMany({ conversationId: /^conv_sel_/ });

    const ts = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Selection Merchant",
      businessName: "Selection Business",
      email: `test-sel-${ts}@example.com`,
      currency: "INR",
      status: "active",
    });

    await Policy.create({
      merchantId: merchant._id,
      name: "Selection Policy",
      isActive: true,
      negotiationEnabled: true,
      maxDiscountPercent: 20,
      minMarginPercent: 15,
      maxQuantityPerOrder: 50,
      minOrderValue: 100,
      maxOrderValue: 1000000,
      maxNegotiationRounds: 3,
      allowedCurrencies: ["INR"],
    });

    const now = Date.now();

    // Create products with staggered timestamps to guarantee deterministic relevance order
    p1 = await Product.create({
      merchantId: merchant._id,
      name: "Alpha Mesh Dining Table",
      description: "Entry-level mesh dining table",
      category: "Office Furniture",
      sku: `SKU-SEL-1-${ts}`,
      price: 7500,
      costPrice: 5000,
      currency: "INR",
      inventory: 10,
      status: "active",
      createdAt: new Date(now - 1000),
    });

    p2 = await Product.create({
      merchantId: merchant._id,
      name: "Beta Ergonomic Dining Table",
      description: "Mid-range ergonomic dining table with lumbar support",
      category: "Office Furniture",
      sku: `SKU-SEL-2-${ts}`,
      price: 8500,
      costPrice: 6000,
      currency: "INR",
      inventory: 15,
      status: "active",
      createdAt: new Date(now - 2000),
    });

    p3 = await Product.create({
      merchantId: merchant._id,
      name: "Gamma Executive Dining Table",
      description: "Premium high-back leather executive dining table",
      category: "Office Furniture",
      sku: `SKU-SEL-3-${ts}`,
      price: 12000,
      costPrice: 8500,
      currency: "INR",
      inventory: 5,
      status: "active",
      createdAt: new Date(now - 3000),
    });

    pOut = await Product.create({
      merchantId: merchant._id,
      name: "Delta Out Of Stock Chair",
      description: "Unavailable dining table",
      category: "Office Furniture",
      sku: `SKU-SEL-4-${ts}`,
      price: 9000,
      costPrice: 6500,
      currency: "INR",
      inventory: 0,
      status: "active",
      createdAt: new Date(now - 4000),
    });

    pLow = await Product.create({
      merchantId: merchant._id,
      name: "Epsilon Limited Stock Chair",
      description: "Chair with limited inventory",
      category: "Office Furniture",
      sku: `SKU-SEL-5-${ts}`,
      price: 8000,
      costPrice: 5500,
      currency: "INR",
      inventory: 3,
      status: "active",
      createdAt: new Date(now - 5000),
    });
  });

  test("TEST 1: Select first product ('the first one')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    assert.ok(res1.products.length >= 3);
    const expectedFirst = res1.products[0];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.id, expectedFirst.id);
    assert.equal(res2.searchState.selectedProductId, expectedFirst.id);
  });

  test("TEST 2: Select second product ('the second one')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    assert.ok(res1.products.length >= 2);
    const expectedSecond = res1.products[1];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I want the second one",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.id, expectedSecond.id);
    assert.equal(res2.searchState.selectedProductId, expectedSecond.id);
  });

  test("TEST 3: Select third product ('the third one')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    assert.ok(res1.products.length >= 3);
    const expectedThird = res1.products[2];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the third one",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.id, expectedThird.id);
    assert.equal(res2.searchState.selectedProductId, expectedThird.id);
  });

  test("TEST 4: Select by 'option 2'", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const expectedSecond = res1.products[1];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "option 2",
      provider: testMockProvider,
    });
    console.log("TEST 4 RES2", JSON.stringify(res2, null, 2));
    
    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.id, expectedSecond.id);
  });

  test("TEST 5: Select by 'number 3'", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const expectedThird = res1.products[2];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "number 3",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.id, expectedThird.id);
  });

  test("TEST 6: Select cheapest ('the cheapest one')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the cheapest one",
      provider: testMockProvider,
    });

    if (res2.selectedProduct?.price !== 7500) {
      console.log("WRONG PRODUCT IN TEST 6:", res2.selectedProduct);
    }
    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.price, 7500);
  });

  test("TEST 7: Select most expensive ('the most expensive one')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the most expensive one",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.price, 12000);
  });

  test("TEST 8: Select last product ('the last one')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const expectedLast = res1.products[res1.products.length - 1];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the last one",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.id, expectedLast.id);
  });

  test("TEST 9: Invalid product index (out of range)", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the 10th one",
      provider: testMockProvider,
    });

    assert.equal(res2.selectedProduct, undefined);
    assert.ok(res2.message.includes("There are only"));
  });

  test("TEST 10: Ambiguous 'that one' with no context asks for clarification", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I want that one",
      provider: testMockProvider,
    });

    assert.equal(res2.selectedProduct, undefined);
    assert.ok(res2.message.includes("Which product would you like"));
  });

  test("TEST 11: Product name selection ('Gamma Executive Dining Table')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Gamma Executive Dining Table",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.name, "Gamma Executive Dining Table");
  });

  test("TEST 12: Duplicate product names handled safely", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Chair",
      provider: testMockProvider,
    });

    assert.equal(res2.selectedProduct, undefined);
    assert.ok(res2.message.includes("Multiple products match"));
  });

  test("TEST 13: Price-based reference with unique price ('at ₹8,500')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the one at ₹8,500",
      provider: testMockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.price, 8500);
  });

  test("TEST 14: Price-based reference ambiguous when multiple match", async () => {
    await Product.create({
      merchantId: merchant._id,
      name: "Duplicate Price Chair",
      description: "Another dining table",
      category: "Office Furniture",
      sku: `SKU-DUP-8500-${Date.now()}`,
      price: 8500,
      costPrice: 6000,
      currency: "INR",
      inventory: 10,
      status: "active",
    });

    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the one at ₹8,500",
      provider: testMockProvider,
    });

    assert.equal(res2.selectedProduct, undefined);
    assert.ok(res2.message.includes("Multiple products match price"));
  });

  test("TEST 15: Selection persists in BuyerState", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const target = res1.products[1];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the second one",
      provider: testMockProvider,
    });

    assert.equal(res2.searchState.selectedProductId, target.id);
    assert.equal(res2.searchState.selectedProductName, target.name);
  });

  test("TEST 16: Selection persists in MongoDB", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const target = res1.products[1];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the second one",
      provider: testMockProvider,
    });

    const doc = await Conversation.findOne({ conversationId: res2.conversationId });
    assert.ok(doc);
    assert.equal(doc?.buyerState.selectedProductId?.toString(), target.id);
    assert.equal(doc?.buyerState.selectedProductName, target.name);
  });

  test("TEST 17: Selection survives simulated server restart", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;
    const target = res1.products[1];

    await runBuyerAgent({ conversationId: convId, message: "the second one", provider: testMockProvider });

    // SIMULATE SERVER RESTART: fetch directly from MongoDB
    const doc = await getConversation(convId);
    assert.ok(doc);
    assert.equal(doc.buyerState.selectedProductId?.toString(), target.id);

    // Follow-up after restart
    const res3 = await runBuyerAgent({ conversationId: convId, message: "Tell me more", provider: testMockProvider });
    assert.ok(res3.selectedProduct);
    assert.equal(res3.selectedProduct?.id, target.id);
  });

  test("TEST 18: Changing selected product works", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;
    const targetFirst = res1.products[0];

    await runBuyerAgent({ conversationId: convId, message: "the second one", provider: testMockProvider });
    const res3 = await runBuyerAgent({
      conversationId: convId,
      message: "I want the first one instead",
      provider: testMockProvider,
    });

    assert.ok(res3.selectedProduct);
    assert.equal(res3.selectedProduct?.id, targetFirst.id);
    assert.equal(res3.searchState.selectedProductId, targetFirst.id);
  });

  test("TEST 19: Clear selection works ('Actually, show me another one')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;

    await runBuyerAgent({ conversationId: convId, message: "the second one", provider: testMockProvider });
    const res3 = await runBuyerAgent({
      conversationId: convId,
      message: "Actually, show me another one",
      provider: testMockProvider,
    });

    assert.equal(res3.searchState.selectedProductId, null);
    assert.equal(res3.searchState.selectedProductName, null);
  });

  test("TEST 20: Start over clears selection", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;

    await runBuyerAgent({ conversationId: convId, message: "the second one", provider: testMockProvider });
    const res3 = await runBuyerAgent({ conversationId: convId, message: "Start over", provider: testMockProvider });

    assert.equal(res3.searchState.selectedProductId, null);
    assert.equal(res3.searchState.topic, null);
  });

  test("TEST 21: Selected product details fetched ('Tell me more about it')", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;
    const target = res1.products[1];

    await runBuyerAgent({ conversationId: convId, message: "the second one", provider: testMockProvider });
    const res3 = await runBuyerAgent({ conversationId: convId, message: "Tell me more about it", provider: testMockProvider });

    assert.ok(res3.selectedProduct);
    assert.equal(res3.selectedProduct?.id, target.id);
    assert.ok(res3.message);
  });

  test("TEST 22: Missing product returns clear error / message", async () => {
    const res = await runBuyerAgent({
      message: "the first one",
      conversationContext: [],
      provider: testMockProvider,
    });

    assert.ok(res.message);
  });

  test("TEST 23: Out-of-stock product handled (inventory = 0)", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;

    await Product.findByIdAndUpdate(p1._id, { inventory: 0 });

    const res2 = await runBuyerAgent({
      conversationId: convId,
      message: "the first one",
      provider: testMockProvider,
    });

    assert.ok(res2.message.includes("out of stock"));
  });

  test("TEST 24: Insufficient inventory handled (requested 5, only 3 available)", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;

    await runBuyerAgent({ conversationId: convId, message: "I need 5", provider: testMockProvider });

    const res3 = await runBuyerAgent({
      conversationId: convId,
      message: "Epsilon Limited Stock Chair",
      provider: testMockProvider,
    });

    assert.ok(res3.message.includes("only has 3 units available, but you requested 5"));
    assert.equal(res3.searchState.quantity, 5);
  });

  test("TEST 25: Current price re-fetched from MongoDB (stale price check)", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;

    const res2 = await runBuyerAgent({ conversationId: convId, message: "the second one", provider: testMockProvider });
    const initialPrice = res2.selectedProduct?.price;

    await Product.findByIdAndUpdate(res2.selectedProduct?.id, { price: 9500 });

    const res3 = await runBuyerAgent({ conversationId: convId, message: "Tell me details about it", provider: testMockProvider });
    assert.equal(res3.selectedProduct?.price, 9500);
    assert.notEqual(res3.selectedProduct?.price, initialPrice);
  });

  test("TEST 26: Search state preserved after selection", async () => {
    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = res1.conversationId;

    await runBuyerAgent({ conversationId: convId, message: "Under ₹10,000", provider: testMockProvider });
    const res3 = await runBuyerAgent({ conversationId: convId, message: "the second one", provider: testMockProvider });

    assert.equal(res3.searchState.topic, "dining table");
    assert.equal(res3.searchState.maxPrice, 10000);
    assert.ok(res3.searchState.selectedProductId);
  });

  test("TEST 27: Multiple conversation isolation", async () => {
    const resA1 = await runBuyerAgent({ message: "I want dining tables", provider: testMockProvider });
    const resB1 = await runBuyerAgent({ message: "I want dining tables", provider: testMockProvider });

    const targetA = resA1.products[0];
    const targetB = resB1.products[2];

    await runBuyerAgent({ conversationId: resA1.conversationId, message: "the first one", provider: testMockProvider });
    await runBuyerAgent({ conversationId: resB1.conversationId, message: "the third one", provider: testMockProvider });

    const docA = await getConversation(resA1.conversationId);
    const docB = await getConversation(resB1.conversationId);

    assert.equal(docA?.buyerState.selectedProductId?.toString(), targetA.id);
    assert.equal(docB?.buyerState.selectedProductId?.toString(), targetB.id);
  });

  test("TEST 28: Fallback selection extraction", async () => {
    const state = {
      topic: "dining table",
      category: null,
      minPrice: null,
      maxPrice: null,
      quantity: null,
      sortBy: "relevance" as const,
      requirements: {},
      hardRequirements: {},
      softPreferences: {},
      lastProducts: [],
      lastQuery: null,
      turnCount: 1,
      searchResults: [],
      selectedProductId: null,
      selectedProductName: null,
      negotiationId: null,
      negotiationStatus: null,
    };

    const intent = localFallbackIntent("the second one", state);
    assert.equal(intent.type, "SELECT_PRODUCT");
    assert.equal(intent.updates.selectedProductIndex, 2);
  });

  test("TEST 29: LLM SELECT_PRODUCT intent", async () => {
    const mockProvider: LLMProvider = {
      name: "mock-llm",
      async generateIntent({ message }) {
        if (message.toLowerCase().includes("dining table")) {
          return { type: "NEW_SEARCH", updates: { topic: "dining table" } };
        }
        return {
          type: "SELECT_PRODUCT",
          updates: {
            selectedProductIndex: 2,
          },
        };
      },
      async generateResponse() {
        return "Selected Ergonomic Chair Pro";
      },
    };

    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: mockProvider });
    const target = res1.products[1];

    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I want the second one",
      provider: mockProvider,
    });

    assert.ok(res2.selectedProduct);
    assert.equal(res2.selectedProduct?.id, target.id);
  });

  test("TEST 30: Malformed selection intent falls back gracefully", async () => {
    const mockProvider: LLMProvider = {
      name: "mock-llm-malformed",
      async generateIntent() {
        return {
          type: "SELECT_PRODUCT",
          updates: {
            selectedProductIndex: 999, // Out of bounds
          },
        };
      },
      async generateResponse() {
        return "Fallback response";
      },
    };

    const res1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the second one",
      provider: mockProvider,
    });

    assert.ok(res2.message.includes("There are only"));
  });

  test("FULL USER FLOW TEST (Section 32): 7-turn integration flow", async () => {
    // TURN 1: "I want an dining table"
    const t1 = await runBuyerAgent({ message: "I want an dining table", provider: testMockProvider });
    const convId = t1.conversationId;
    assert.equal(t1.searchState.topic, "dining table");
    assert.ok(t1.products.length >= 3);

    // TURN 2: "Under ₹9,000"
    const t2 = await runBuyerAgent({ conversationId: convId, message: "Under ₹9,000", provider: testMockProvider });
    assert.equal(t2.searchState.topic, "dining table");
    assert.equal(t2.searchState.maxPrice, 9000);

    // TURN 3: "I want the second one"
    const t3 = await runBuyerAgent({ conversationId: convId, message: "I want the second one", provider: testMockProvider });
    assert.ok(t3.selectedProduct);
    assert.ok(t3.searchState.selectedProductId);

    // TURN 4: "Tell me more about it"
    const t4 = await runBuyerAgent({ conversationId: convId, message: "Tell me more about it", provider: testMockProvider });
    assert.ok(t4.selectedProduct);
    assert.ok(t4.message);

    // TURN 5: "How much is it?"
    const t5 = await runBuyerAgent({ conversationId: convId, message: "How much is it?", provider: testMockProvider });
    assert.ok(t5.selectedProduct);
    assert.ok(t5.message);

    // TURN 6: "Actually I want the first one"
    const t6 = await runBuyerAgent({ conversationId: convId, message: "Actually I want the first one", provider: testMockProvider });
    assert.ok(t6.selectedProduct);
    assert.equal(t6.selectedProduct?.id, t1.products[0].id);

    // TURN 7: "Can you give me a better price?"
    const t7 = await runBuyerAgent({ conversationId: convId, message: "Can you give me a better price?", provider: testMockProvider });
    assert.equal(t7.nextAction, "ASK_BUYER_TARGET");
    assert.equal(t7.searchState.negotiationStatus, "ACTIVE");
  });
});
