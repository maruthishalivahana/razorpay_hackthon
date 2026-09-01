import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import Merchant, { type IMerchant } from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Negotiation from "../../models/Negotiation.js";
import Conversation from "../../models/Conversation.js";
import AuditEvent from "../../models/AuditEvent.js";
import { runBuyerAgent } from "../buyerAgent.js";
import type { LLMProvider } from "../../llm/llmProvider.js";
import { localFallbackIntent } from "../intentNormalizer.js";
import { getConversation } from "../../services/conversationService.js";

const testMockProvider: LLMProvider = {
  name: "test-mock-provider",
  async generateIntent({ message, currentState }) {
    return localFallbackIntent(message, currentState);
  },
  async generateResponse({ products, buyerState }) {
    if (buyerState.negotiationId) {
      return `Negotiation active for ${buyerState.selectedProductName}. Status: ${buyerState.negotiationStatus}.`;
    }
    if (products.length === 1) {
      const p = products[0];
      return `You selected ${p.name} at ₹${p.price.toLocaleString("en-IN")}.`;
    }
    return `Found ${products.length} products.`;
  },
};

describe("Buyer Agent Negotiation Engine Integration Tests", () => {
  let merchant: IMerchant;
  let policy: any;
  let negotiableProduct: any;
  let nonNegotiableProduct: any;
  let outOfStockProduct: any;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await Merchant.deleteMany({ email: /test-buyer-neg-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-BUYER-NEG-.*/ });
    await Policy.deleteMany({ merchantId: { $in: await Merchant.find({ email: /test-buyer-neg-.*@example\.com/ }).distinct("_id") } });
    await Conversation.deleteMany({ conversationId: /^conv_neg_/ });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Merchant.deleteMany({ email: /test-buyer-neg-.*@example\.com/ });
    await Product.deleteMany({ sku: /SKU-BUYER-NEG-.*/ });
    await Conversation.deleteMany({ conversationId: /^conv_neg_/ });

    const ts = Date.now() + "-" + Math.floor(Math.random() * 10000);

    merchant = await Merchant.create({
      name: "Negotiation Merchant",
      businessName: "Negotiation Business",
      email: `test-buyer-neg-${ts}@example.com`,
      currency: "INR",
      status: "active",
    });

    policy = await Policy.create({
      merchantId: merchant._id,
      name: "Default Negotiation Policy",
      isActive: true,
      negotiationEnabled: true,
      maxDiscountPercent: 20,
      minMarginPercent: 15,
      maxQuantityPerOrder: 50,
      minOrderValue: 100,
      maxOrderValue: 1000000,
      autoApprovalEnabled: true,
      autoApprovalLimit: 50000,
      freeShippingThreshold: 5000,
      maxNegotiationRounds: 3,
      allowedCurrencies: ["INR", "USD"],
    });

    negotiableProduct = await Product.create({
      merchantId: merchant._id,
      name: "Smart Executive Negotiation Desk",
      description: "Electric height adjustable executive negotiation desk with memory settings",
      category: "Furniture",
      sku: `SKU-BUYER-NEG-1-${ts}`,
      price: 10000,
      costPrice: 6000,
      currency: "INR",
      inventory: 20,
      isNegotiable: true,
      status: "active",
      tags: ["desk", "furniture", "standing", "executive", "negotiation"],
    });

    nonNegotiableProduct = await Product.create({
      merchantId: merchant._id,
      name: "Fixed Price Monitor Arm",
      description: "Non-negotiable heavy duty monitor mount",
      category: "Furniture",
      sku: `SKU-BUYER-NEG-2-${ts}`,
      price: 3000,
      costPrice: 2000,
      currency: "INR",
      inventory: 15,
      isNegotiable: false,
      status: "active",
      tags: ["monitor", "arm"],
    });

    outOfStockProduct = await Product.create({
      merchantId: merchant._id,
      name: "Sold Out Ergonomic Stool",
      description: "Currently out of stock stool",
      category: "Furniture",
      sku: `SKU-BUYER-NEG-3-${ts}`,
      price: 5000,
      costPrice: 3000,
      currency: "INR",
      inventory: 0,
      isNegotiable: true,
      status: "active",
      tags: ["stool"],
    });
  });

  test("TEST 1: Start negotiation with selected product", async () => {
    const res1 = await runBuyerAgent({ message: "I want an executive negotiation desk", provider: testMockProvider });
    const res2 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I'll take the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    assert.ok(res3.searchState.negotiationId);
    assert.equal(res3.searchState.negotiationStatus, "ACTIVE");
    assert.equal(res3.nextAction, "ASK_BUYER_TARGET");
    assert.ok(res3.message.includes("What price were you hoping for?"));
  });

  test("TEST 2: Cannot negotiate without selected product", async () => {
    const res = await runBuyerAgent({
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationId, null);
    assert.ok(res.message.includes("Which product would you like me to negotiate for?"));
  });

  test("TEST 3: Selected product is used", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    const neg = await Negotiation.findById(res3.searchState.negotiationId);
    assert.equal(neg?.productId.toString(), negotiableProduct.id);
  });

  test("TEST 4: LLM cannot override selectedProductId", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    const mockProviderOverride: LLMProvider = {
      name: "override-mock",
      async generateIntent() {
        return {
          type: "START_NEGOTIATION",
          updates: { selectedProductId: "60a1b2c3d4e5f6a7b8c9d0e1" },
        };
      },
      async generateResponse() {
        return "response";
      },
    };

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you negotiate?",
      provider: mockProviderOverride,
    });

    const neg = await Negotiation.findById(res3.searchState.negotiationId);
    assert.equal(neg?.productId.toString(), negotiableProduct.id);
  });

  test("TEST 5: Non-negotiable product rejected", async () => {
    const res1 = await runBuyerAgent({ message: "I want a monitor arm", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    assert.equal(res3.searchState.negotiationId, null);
    assert.ok(res3.message.includes("not currently negotiable"));
  });

  test("TEST 6: Out-of-stock product rejected", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await Product.findByIdAndUpdate(negotiableProduct._id, { inventory: 0 });

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    assert.equal(res3.searchState.negotiationId, null);
    assert.ok(res3.message.includes("out of stock"));
  });

  test("TEST 7: Insufficient inventory rejected", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I need 25",
      provider: testMockProvider,
    });

    await Product.findByIdAndUpdate(negotiableProduct._id, { inventory: 5 });

    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    assert.equal(res4.searchState.negotiationId, null);
    assert.ok(res4.message.includes("only 5 units available"));
  });

  test("TEST 8: Current product data is fetched", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    await Product.findByIdAndUpdate(negotiableProduct._id, { price: 12000 });

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    const neg = await Negotiation.findById(res3.searchState.negotiationId);
    assert.equal(neg?.originalUnitPrice, 12000);
  });

  test("TEST 9: Current product price is used", async () => {
    const res1 = await runBuyerAgent({ message: "I want an executive negotiation desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I'm around ₹8,500",
      provider: testMockProvider,
    });

    assert.ok(res4.message.includes("8,500"));
    assert.equal(res4.searchState.negotiationStatus, "ACCEPTED");
  });

  test("TEST 10: Merchant policy is revalidated", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    await Policy.findByIdAndUpdate(policy._id, { negotiationEnabled: false });

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: testMockProvider,
    });

    assert.equal(res3.searchState.negotiationId, null);
    assert.ok(res3.message.includes("disabled for this merchant"));
  });

  test("TEST 11: Negotiation ID saved in BuyerState", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    assert.ok(res3.searchState.negotiationId);
  });

  test("TEST 12: Negotiation status saved in BuyerState", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    assert.equal(res3.searchState.negotiationStatus, "ACTIVE");
  });

  test("TEST 13: Negotiation result returned", async () => {
    const res1 = await runBuyerAgent({ message: "I want an executive negotiation desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    assert.ok(res3.message);
    assert.equal(res3.nextAction, "ASK_BUYER_TARGET");
    assert.ok(res3.message.includes("What price were you hoping for?"));
  });

  test("TEST 14: Valid target price accepted", async () => {
    const res1 = await runBuyerAgent({ message: "I want an executive negotiation desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });
    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I'm around ₹8,500",
      provider: testMockProvider,
    });

    assert.ok(res4.message.includes("8,500"));
    assert.equal(res4.searchState.negotiationStatus, "ACCEPTED");
  });

  test("TEST 15: Counter-offer returned for low offer", async () => {
    const res1 = await runBuyerAgent({ message: "I want an executive negotiation desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });
    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay ₹4,000",
      provider: testMockProvider,
    });

    // maxDiscount is 20% -> 10000 * 0.8 = 8000
    assert.ok(res4.message.includes("8,000"));
    assert.equal(res4.searchState.negotiationStatus, "ACTIVE");
  });

  test("TEST 16: Private merchant data not exposed", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    assert.ok(!res3.message.includes("costPrice"));
    assert.ok(!res3.message.includes("6000"));
    assert.ok(!res3.message.includes("minMarginPercent"));
    assert.ok(!res3.message.includes("15%"));
  });

  test("TEST 17: Negotiation-start audit event created", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    const events = await AuditEvent.find({ negotiationId: res3.searchState.negotiationId });
    assert.ok(events.some((e) => e.eventType === "NEGOTIATION_STARTED"));
  });

  test("TEST 18: Buyer actor is recorded", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    const events = await AuditEvent.find({ negotiationId: res3.searchState.negotiationId, eventType: "NEGOTIATION_STARTED" });
    assert.equal(events[0].actorType, "BUYER");
  });

  test("TEST 19: LLM 429 fallback still starts negotiation", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    const failingProvider: LLMProvider = {
      name: "failing-llm",
      async generateIntent() {
        throw new Error("429 Too Many Requests");
      },
      async generateResponse() {
        return "response";
      },
    };

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a better price?",
      provider: failingProvider,
    });

    assert.ok(res3.searchState.negotiationId);
    assert.equal(res3.searchState.negotiationStatus, "ACTIVE");
  });

  test("TEST 20: Second negotiation request continues existing negotiation", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });
    const neg1Id = res3.searchState.negotiationId;

    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you do better?",
      provider: testMockProvider,
    });

    assert.equal(res4.searchState.negotiationId, neg1Id);
  });

  test("TEST 21: Does not create duplicate negotiation", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });
    const countBefore = await Negotiation.countDocuments({ productId: negotiableProduct._id });

    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you lower the price?",
      provider: testMockProvider,
    });
    const countAfter = await Negotiation.countDocuments({ productId: negotiableProduct._id });

    assert.equal(countAfter, countBefore);
  });

  test("TEST 22: Buyer offer recognized", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 8500",
      provider: testMockProvider,
    });

    assert.ok(res4.message.includes("8,500"));
  });

  test("TEST 23: Buyer offer uses existing submitBuyerOffer()", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 8500",
      provider: testMockProvider,
    });

    const neg = await Negotiation.findById(res3.searchState.negotiationId);
    assert.equal(neg?.currentBuyerOffer, 8500);
  });

  test("TEST 24: Backend determines offer validity", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    // Offer 8500 >= 8000 (minimum allowed unit price) -> Accepted by backend
    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 8500",
      provider: testMockProvider,
    });

    assert.equal(res4.searchState.negotiationStatus, "ACCEPTED");
  });

  test("TEST 25: Invalid buyer offer rejected/countered by backend rules", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    // Offer 4000 < 8000 (minimum allowed) -> Counter-offered by backend
    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 4000",
      provider: testMockProvider,
    });

    assert.equal(res4.searchState.negotiationStatus, "ACTIVE");
    assert.ok(res4.message.includes("below the merchant's limit"));
  });

  test("TEST 26: Negotiation round limit respected", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    // maxRounds = 3
    // Round 1 submitted: offer 4000 -> Round advances to 2
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 4000",
      provider: testMockProvider,
    });

    // Round 2 submitted: offer 4500 -> Round advances to 3
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 4500",
      provider: testMockProvider,
    });

    // Round 3 submitted: offer 5000 -> Max rounds reached -> EXPIRED
    const res6 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 5000",
      provider: testMockProvider,
    });

    assert.equal(res6.searchState.negotiationStatus, "EXPIRED");
    assert.ok(res6.message.includes("expired"));
  });

  test("TEST 27: Accepted negotiation preserved", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 8500",
      provider: testMockProvider,
    });

    const res5 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 8000",
      provider: testMockProvider,
    });

    assert.equal(res5.searchState.negotiationStatus, "ACCEPTED");
    assert.ok(res5.message.includes("accepted"));
  });

  test("TEST 28: Rejected negotiation handled", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    const negId = res3.searchState.negotiationId!;
    await Negotiation.findByIdAndUpdate(negId, { status: "REJECTED" });

    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 8000",
      provider: testMockProvider,
    });

    assert.ok(res4.message.includes("rejected") || res4.message.includes("not currently negotiable"));
  });

  test("TEST 29: Expired negotiation handled", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });

    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    const negId = res3.searchState.negotiationId!;
    await Negotiation.findByIdAndUpdate(negId, { status: "EXPIRED" });

    const res4 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "I can pay 8000",
      provider: testMockProvider,
    });

    assert.ok(res4.message.includes("expired"));
  });

  test("TEST 30: Conversation persistence preserves negotiationId", async () => {
    const res1 = await runBuyerAgent({ message: "I want a standing desk", provider: testMockProvider });
    await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "the first one",
      provider: testMockProvider,
    });
    const res3 = await runBuyerAgent({
      conversationId: res1.conversationId,
      message: "Can you give me a discount?",
      provider: testMockProvider,
    });

    const doc = await getConversation(res1.conversationId);
    assert.equal(doc?.buyerState.negotiationId?.toString(), res3.searchState.negotiationId);
    assert.equal(doc?.buyerState.negotiationStatus, "ACTIVE");
  });

  test("FULL 9-TURN FLOW TEST: Complete end-to-end buyer negotiation flow", async () => {
    // TURN 1: "I want an executive negotiation desk"
    const t1 = await runBuyerAgent({ message: "I want an executive negotiation desk", provider: testMockProvider });
    const convId = t1.conversationId;
    assert.equal(t1.searchState.topic, "executive negotiation desk");
    assert.ok(t1.products.length >= 1);

    // TURN 2: "Under 15000"
    const t2 = await runBuyerAgent({ conversationId: convId, message: "Under 15000", provider: testMockProvider });
    assert.equal(t2.searchState.maxPrice, 15000);

    // TURN 3: "I'll take the first one"
    const t3 = await runBuyerAgent({ conversationId: convId, message: "I'll take the first one", provider: testMockProvider });
    assert.ok(t3.selectedProduct);
    assert.equal(t3.selectedProduct.id, negotiableProduct.id);

    // TURN 4: "Can you give me a better price?" -> Agent asks for target price
    const t4 = await runBuyerAgent({ conversationId: convId, message: "Can you give me a better price?", provider: testMockProvider });
    assert.ok(t4.searchState.negotiationId);
    assert.equal(t4.searchState.negotiationStatus, "ACTIVE");
    assert.equal(t4.nextAction, "ASK_BUYER_TARGET");
    assert.ok(t4.message.includes("What price were you hoping for?"));

    // TURN 5: "I'm around ₹8,500" -> Backend validates ₹8,500 via Economic Engine & Policy Engine
    const t5 = await runBuyerAgent({ conversationId: convId, message: "I'm around ₹8,500", provider: testMockProvider });
    assert.equal(t5.searchState.negotiationStatus, "ACCEPTED");
    assert.ok(t5.message.includes("8,500"));

    // TURN 6: Backend negotiation state verified
    const neg = await Negotiation.findById(t4.searchState.negotiationId);
    assert.ok(neg);
    assert.equal(neg?.status, "ACCEPTED");
    assert.equal(neg?.acceptedPrice, 8500);

    // TURN 7: Follow-up on accepted negotiation returns accepted notice
    const t7 = await runBuyerAgent({ conversationId: convId, message: "Can you do better?", provider: testMockProvider });
    assert.ok(t7.message.includes("accepted"));

    // TURN 8 & TURN 9: Final status preserved
    const finalNeg = await Negotiation.findById(t4.searchState.negotiationId);
    assert.equal(finalNeg?.status, "ACCEPTED");
    assert.equal(finalNeg?.acceptedPrice, 8500);
  });
});
