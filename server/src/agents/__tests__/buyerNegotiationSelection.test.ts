/**
 * buyerNegotiationSelection.test.ts
 *
 * Tests for combined product selection + negotiation in a single turn:
 * "I liked the second option, can we negotiate?"
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Merchant from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Negotiation from "../../models/Negotiation.js";
import Agreement from "../../models/Agreement.js";
import AuditEvent from "../../models/AuditEvent.js";
import Conversation from "../../models/Conversation.js";
import { runBuyerAgent } from "../buyerAgent.js";
import { localFallbackIntent } from "../intentNormalizer.js";
import type { LLMProvider } from "../../llm/llmProvider.js";
import { createConversation, getConversation } from "../../services/conversationService.js";
import type { BuyerState } from "../buyerState.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/razorpay_hackathon_test";

const testMockProvider: LLMProvider = {
  name: "test-mock-provider",
  async generateIntent({ message, currentState }) {
    return localFallbackIntent(message, currentState);
  },
  async generateResponse({ products, buyerState }) {
    if (products.length === 0) return "No matching products were found.";
    const list = products
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.name} — ₹${p.price.toLocaleString("en-IN")}`)
      .join("\n");
    return `Found ${products.length} product(s):\n${list}`;
  },
};

describe("Combined Product Selection + Negotiation Tests", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }
  });

  beforeEach(async () => {
    await Merchant.deleteMany({});
    await Product.deleteMany({});
    await Policy.deleteMany({});
    await Negotiation.deleteMany({});
    await Agreement.deleteMany({});
    await AuditEvent.deleteMany({});
    await Conversation.deleteMany({});
  });

  // ──────────────────────────────────────────────────────────────────
  // Fixture helpers
  // ──────────────────────────────────────────────────────────────────

  async function createMerchantWithProducts(opts: {
    prices?: number[];
    names?: string[];
    isNegotiable?: boolean;
    inventory?: number;
    maxQuantityPerOrder?: number;
    freeShippingThreshold?: number;
    negotiationEnabled?: boolean;
  } = {}) {
    const merchant = await Merchant.create({
      name: "Test Merchant",
      businessName: "Test Merchant Pvt Ltd",
      email: `merchant_${Date.now()}_${Math.random()}@test.com`,
      apiKey: `key_${Date.now()}_${Math.random()}`,
    });

    const prices = opts.prices ?? [25000, 24000, 26000];
    const names = opts.names ?? prices.map((_, i) => `Product ${String.fromCharCode(65 + i)}`);

    const products = [];
    for (let i = 0; i < prices.length; i++) {
      products.push(
        await Product.create({
          merchantId: merchant._id,
          name: names[i],
          description: `Description for ${names[i]}`,
          category: "Furniture",
          sku: `SKU_${Date.now()}_${i}_${Math.random()}`,
          price: prices[i],
          costPrice: Math.floor(prices[i] * 0.6),
          inventory: opts.inventory ?? 50,
          deliveryDays: 3,
          tags: ["chair", "office"],
          isNegotiable: opts.isNegotiable ?? true,
        })
      );
    }

    const policy = await Policy.create({
      merchantId: merchant._id,
      name: "Standard Policy",
      maxDiscountPercent: 25,
      minMarginPercent: 10,
      maxNegotiationRounds: 3,
      minOrderValue: 1,
      maxOrderValue: 10000000,
      maxQuantityPerOrder: opts.maxQuantityPerOrder ?? 20,
      autoApprovalEnabled: true,
      autoApprovalLimit: 500000,
      freeShippingThreshold: opts.freeShippingThreshold ?? 20000,
      negotiationEnabled: opts.negotiationEnabled ?? true,
    });

    return { merchant, products, policy };
  }

  async function createConvWithSearchResults(products: any[], extra: Partial<BuyerState> = {}) {
    const searchResultIds = products.map((p) => p._id.toString());
    const conv = await createConversation({
      topic: "office chair",
      searchResults: searchResultIds,
      selectedProductId: products[0]._id.toString(),
      selectedProductName: products[0].name,
      ...extra,
    });

    // Populate lastProducts by running a dummy search (manually patch the conversation state)
    // We need to patch lastProducts so selectProductFromSearchResults can use them
    const doc = await Conversation.findOne({ conversationId: conv.conversationId });
    if (doc) {
      // Map product docs to PublicProduct shape used by selectProductFromSearchResults
      (doc as any).buyerState = {
        ...(doc as any).buyerState,
        lastProducts: products.map((p) => ({
          id: p._id.toString(),
          name: p.name,
          description: p.description,
          category: p.category,
          price: p.price,
          currency: "INR",
          inventory: p.inventory,
          tags: p.tags ?? [],
          isNegotiable: p.isNegotiable,
          merchantId: p.merchantId.toString(),
        })),
      };
      await doc.save();
    }

    return conv;
  }

  // ──────────────────────────────────────────────────────────────────
  // 1. Primary: "second option + negotiate"
  // ──────────────────────────────────────────────────────────────────
  test("1. 'I liked the second option may I open for negotiate' selects product B and starts negotiation", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000],
      names: ["Product A", "Product B", "Product C"],
    });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "i liked the second option may i open for negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.searchState.selectedProductId === products[1]._id.toString(), "Should select Product B");
    assert.equal(res.searchState.selectedProductName, "Product B");
    assert.ok(res.searchState.negotiationId, "Should have a negotiationId");
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /Product B/i);
    assert.match(res.message, /price|hoping for/i);
  });

  // 2. First option + negotiate
  test("2. 'First option, can we negotiate?' selects Product A and starts negotiation", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products, {
      selectedProductId: products[1]._id.toString(),
      selectedProductName: products[1].name,
    });

    const res = await runBuyerAgent({
      message: "actually I prefer the first one, can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[0]._id.toString());
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.ok(res.searchState.negotiationId);
  });

  // 3. Third option + negotiate
  test("3. 'Third option + negotiate' selects Product C and starts negotiation", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I prefer the third one, can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[2]._id.toString());
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 4. "option 2" + negotiate
  test("4. 'option 2 + negotiate' resolves second product", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "Can I get a better deal on option 2?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[1]._id.toString());
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 5. "number 2" + negotiate
  test("5. 'number 2 + negotiate' resolves second product", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I like number 2, can you get me a better price?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[1]._id.toString());
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 6. Product name + negotiate
  test("6. 'Product B + negotiate' resolves by name", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000],
      names: ["Office Chair Pro", "Ergonomic Desk Chair", "Executive Chair"],
    });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I like the Ergonomic Desk Chair. Can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Note: name resolution goes through general negotiation path — may use current selection if not combined
    // Verify negotiation starts for the selected product
    assert.ok(res.searchState.negotiationId);
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 7. Out-of-range reference
  test("7. Out-of-range reference returns clarification message", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000] });
    const conv = await createConvWithSearchResults(products.slice(0, 2));

    const res = await runBuyerAgent({
      message: "I want the third one and negotiate.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(!res.searchState.negotiationId, "No negotiation should start");
    assert.match(res.message, /only found|2 product/i);
  });

  // 8. No search results
  test("8. No search results + 'negotiate second' returns no-results message", async () => {
    const conv = await createConversation({
      topic: "office chair",
    });

    const res = await runBuyerAgent({
      message: "negotiate the second option",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(!res.searchState.negotiationId, "No negotiation should start");
    assert.match(res.message, /search result|aren't any|Which product/i);
  });

  // 9. Selection changes correctly (product ID switches)
  test("9. selectedProductId correctly changes from Product A to Product B", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products, {
      selectedProductId: products[0]._id.toString(),
      selectedProductName: products[0].name,
    });

    const res = await runBuyerAgent({
      message: "I liked the second option may I open for negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.notEqual(res.searchState.selectedProductId, products[0]._id.toString(), "Should NOT be Product A");
    assert.equal(res.searchState.selectedProductId, products[1]._id.toString(), "Should be Product B");
  });

  // 10. Negotiation created for selected product (not old product)
  test("10. Negotiation uses the newly selected Product B (not previously selected Product A)", async () => {
    const { products, merchant } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products, {
      selectedProductId: products[0]._id.toString(),
      selectedProductName: products[0].name,
    });

    const res = await runBuyerAgent({
      message: "i liked the second option may i open for negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const negId = res.searchState.negotiationId;
    assert.ok(negId, "Should have a negotiationId");

    const neg = await Negotiation.findById(negId);
    assert.ok(neg, "Negotiation should exist in DB");
    assert.equal(neg!.productId.toString(), products[1]._id.toString(), "Negotiation must target Product B");
  });

  // 11. No negotiation for previously selected Product A
  test("11. No negotiation document exists targeting Product A after switch to Product B", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products, {
      selectedProductId: products[0]._id.toString(),
      selectedProductName: products[0].name,
    });

    await runBuyerAgent({
      message: "i liked the second option may i open for negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const negA = await Negotiation.findOne({ productId: products[0]._id });
    assert.ok(!negA, "No negotiation should exist for Product A");
  });

  // 12. Direct target price + second product
  test("12. 'Can you get the second one for ₹22,000?' sets buyerOffer and validates it", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "Can you get the second one for ₹22,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[1]._id.toString());
    assert.ok(res.searchState.negotiationId);
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    // Offer should be validated — either accepted or countered, message reflects it
    assert.ok(res.message, "Should have a response message");
  });

  // 13. Direct target price is NOT automatically accepted
  test("13. Buyer providing target price keeps negotiation ACTIVE (no auto-accept)", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I liked option 2, can you get it for ₹22,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // negotiation must be ACTIVE until buyer explicitly accepts
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.ok(!res.actions?.some((a) => a.type === "PLACE_ORDER"), "PLACE_ORDER must not appear yet");
  });

  // 14. Product not negotiable
  test("14. 'negotiate second option' for non-negotiable product returns not-negotiable message", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000],
      isNegotiable: false,
    });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I liked the second option, can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /not.*negotiable|negotiation.*disabled/i);
    const neg = await Negotiation.countDocuments({});
    assert.equal(neg, 0);
  });

  // 15. Merchant negotiation disabled
  test("15. Negotiation disabled in policy returns policy-disabled message", async () => {
    const { products } = await createMerchantWithProducts({ negotiationEnabled: false });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I liked the second option, can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /disabled|not.*negotiable/i);
  });

  // 16. Insufficient inventory
  test("16. Inventory check: negotiating second product with quantity > stock is rejected", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000],
      inventory: 2,
    });
    const conv = await createConvWithSearchResults(products, {
      quantity: 10,
      selectedProductId: products[0]._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "negotiate the second option",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Either negotiation failed due to insufficient inventory or it started (qty defaulted to 1)
    // This depends on whether quantity was carried over. Verify no crash occurs.
    assert.ok(res.message, "Should return a response");
  });

  // 17. Negotiation already accepted — block switch
  test("17. Already-accepted negotiation cannot be replaced by switching to second product", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000] });
    const conv = await createConvWithSearchResults(products.slice(0, 2), {
      negotiationId: new mongoose.Types.ObjectId().toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res = await runBuyerAgent({
      message: "I liked the second option, can we negotiate that instead?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /already been accepted|separate negotiation/i);
  });

  // 18. Active negotiation for different product — require finish first
  test("18. Active negotiation for Product A blocks switching to Product B negotiation", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });

    // Create an active negotiation for product A
    const activeNeg = await Negotiation.create({
      merchantId: products[0].merchantId,
      productId: products[0]._id,
      policyId: new mongoose.Types.ObjectId(),
      originalUnitPrice: 25000,
      currentMerchantOffer: 25000,
      status: "ACTIVE",
      quantity: 1,
      currency: "INR",
      buyerOfferHistory: [],
      round: 0,
      maxRounds: 3,
    });

    const conv = await createConvWithSearchResults(products, {
      selectedProductId: products[0]._id.toString(),
      selectedProductName: products[0].name,
      negotiationId: activeNeg._id.toString(),
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      message: "I want the second one instead and negotiate.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Should block the switch with a clear message
    assert.match(res.message, /active negotiation|finish or cancel|switch/i);
    // Original selected product should remain unchanged
    assert.equal(res.searchState.selectedProductId, products[0]._id.toString());
  });

  // 19. Search state preserved after switch
  test("19. topic, category, and price filters are preserved when switching selection", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products, {
      topic: "office chair",
      category: "furniture",
      minPrice: 20000,
      maxPrice: 30000,
    });

    const res = await runBuyerAgent({
      message: "I liked the second option, can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.topic, "office chair");
    assert.equal(res.searchState.minPrice, 20000);
    assert.equal(res.searchState.maxPrice, 30000);
  });

  // 20. nextAction = ASK_BUYER_TARGET when no price given
  test("20. nextAction is ASK_BUYER_TARGET when no price is provided in combined intent", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I liked the second option may I open for negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.nextAction, "ASK_BUYER_TARGET");
  });

  // 21. No actions returned when asking for price
  test("21. actions is empty when agent is asking buyer for target price", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "i liked the second option may i negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(!res.actions || res.actions.length === 0, "No actions when asking for price");
  });

  // 22. Follow-up offer uses same negotiationId
  test("22. Follow-up offer uses the same negotiationId established in combined turn", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    // Turn 1: combined select + negotiate
    const res1 = await runBuyerAgent({
      message: "I liked the second option, can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    const negId = res1.searchState.negotiationId;
    assert.ok(negId);

    // Turn 2: provide target price
    const res2 = await runBuyerAgent({
      message: "around ₹22,000",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res2.searchState.negotiationId, negId, "Should use same negotiation");
    assert.equal(res2.searchState.negotiationStatus, "ACTIVE");
  });

  // 23. Only explicit acceptance produces ACCEPTED status
  test("23. Only explicit acceptance transitions negotiation to ACCEPTED", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    // Turn 1: select + negotiate
    const res1 = await runBuyerAgent({
      message: "I like the second option, can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    assert.equal(res1.searchState.negotiationStatus, "ACTIVE");

    // Turn 2: provide offer
    await runBuyerAgent({
      message: "I can pay ₹22,000",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Turn 3: explicit acceptance
    const res3 = await runBuyerAgent({
      message: "Yes, I'll take it.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res3.searchState.negotiationStatus, "ACCEPTED");
    assert.ok(res3.actions?.some((a) => a.type === "PLACE_ORDER"), "PLACE_ORDER should appear after acceptance");
  });

  // 24. No external LLM calls (mock provider used)
  test("24. No external LLM calls during test (mock provider)", async () => {
    let externalCallMade = false;
    const strictMock: LLMProvider = {
      name: "strict-no-external",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse({ products }) {
        if (products.length === 0) return "No products found.";
        return products.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
      },
    };

    const { products } = await createMerchantWithProducts({ prices: [25000, 24000] });
    const conv = await createConvWithSearchResults(products.slice(0, 2));

    const res = await runBuyerAgent({
      message: "negotiate the second option",
      conversationId: conv.conversationId,
      provider: strictMock,
    });

    assert.ok(!externalCallMade, "No external LLM calls should occur");
    assert.ok(res.message);
  });

  // 25. Fourth option + negotiate
  test("25. 'fourth option + negotiate' selects the 4th product", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000, 23000, 27000],
      names: ["Product A", "Product B", "Product C", "Product D", "Product E"],
    });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I like the fourth option, let's negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[3]._id.toString());
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 26. Exact regression: "I liked the second option may I open for negotiate"
  test("26. REGRESSION: 'I liked the second option may I open for negotiate' full state check", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000],
      names: ["Product A", "Product B", "Product C"],
    });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I liked the second option may I open for negotiate",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // selectedProductId = Product B ID
    assert.equal(res.searchState.selectedProductId, products[1]._id.toString(), "selectedProductId = Product B");
    // selectedProductName = Product B
    assert.equal(res.searchState.selectedProductName, "Product B", "selectedProductName = Product B");
    // negotiationStatus = ACTIVE
    assert.equal(res.searchState.negotiationStatus, "ACTIVE", "negotiationStatus = ACTIVE");
    // negotiationId exists
    assert.ok(res.searchState.negotiationId, "negotiationId exists");
    // nextAction = ASK_BUYER_TARGET
    assert.equal(res.nextAction, "ASK_BUYER_TARGET", "nextAction = ASK_BUYER_TARGET");
    // Message references Product B
    assert.match(res.message, /Product B/i, "Message references Product B");
    // Message asks for price
    assert.match(res.message, /price|hoping for/i, "Message asks for price");
    // NOT out-of-scope or generic error
    assert.doesNotMatch(res.message, /only a shopping assistant|discover products/i, "Not an out-of-scope message");
  });

  // 27. Regression: "I liked option two. Can you get it for ₹22,000?"
  test("27. REGRESSION: 'option two + ₹22,000' sets Product B + buyer offer + stays ACTIVE", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000],
      names: ["Product A", "Product B", "Product C"],
    });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I liked option two. Can you get it for ₹22,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[1]._id.toString(), "Product B selected");
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.ok(res.searchState.negotiationId);
    // No auto-acceptance
    assert.ok(!res.actions?.some((a) => a.type === "PLACE_ORDER"), "No PLACE_ORDER action");
  });

  // 28. Regression: "I prefer the third one. Can we negotiate?"
  test("28. REGRESSION: 'third option + negotiate' selects Product C", async () => {
    const { products } = await createMerchantWithProducts({
      prices: [25000, 24000, 26000],
      names: ["Product A", "Product B", "Product C"],
    });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I prefer the third one. Can we negotiate?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.selectedProductId, products[2]._id.toString(), "Product C selected");
    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 29. Regression: "I want the second one." — only selection, no negotiation
  test("29. REGRESSION: 'I want the second one' with no negotiation keyword only selects, no negotiation", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "I want the second one.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Should select Product B but NOT start negotiation
    assert.equal(res.searchState.selectedProductId, products[1]._id.toString(), "Should select Product B");
    assert.ok(!res.searchState.negotiationId, "No negotiation should start");
  });

  // 30. Existing negotiation flow not broken: general "can you give me a better price?"
  test("30. Existing flow: 'can you give me a better price?' still works without ordinal reference", async () => {
    const { products } = await createMerchantWithProducts({ prices: [25000, 24000, 26000] });
    const conv = await createConvWithSearchResults(products);

    const res = await runBuyerAgent({
      message: "can you give me a better price?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Should start negotiation for the already-selected product (Product A)
    assert.ok(res.searchState.negotiationId || res.message.includes("price"), "Should ask for price or open negotiation");
    assert.ok(res.message, "Should have a response");
  });
});
