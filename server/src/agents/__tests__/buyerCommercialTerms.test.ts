/**
 * buyerCommercialTerms.test.ts
 *
 * Tests for free delivery requests vs delivery questions, commercial terms handling,
 * and policy-driven negotiation updates.
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
import { createConversation } from "../../services/conversationService.js";
import type { BuyerState } from "../buyerState.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/razorpay_hackathon_test";

const testMockProvider: LLMProvider = {
  name: "test-mock-provider",
  async generateIntent({ message, currentState }) {
    return localFallbackIntent(message, currentState);
  },
  async generateResponse({ products }) {
    if (products.length === 0) return "No matching products were found.";
    return `Found ${products.length} product(s).`;
  },
};

describe("Commercial Terms & Free Delivery Request Tests", () => {
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
  // Fixture helper
  // ──────────────────────────────────────────────────────────────────

  async function createSetup(opts: {
    price?: number;
    inventory?: number;
    freeShippingThreshold?: number;
    isNegotiable?: boolean;
    negotiationEnabled?: boolean;
  } = {}) {
    const merchant = await Merchant.create({
      name: "Test Merchant",
      businessName: "Test Merchant Pvt Ltd",
      email: `merchant_${Date.now()}_${Math.random()}@test.com`,
    } as any);

    const price = opts.price ?? 25000;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "Office Chair Pro",
      description: "Ergonomic office chair",
      category: "Furniture",
      sku: `SKU_${Date.now()}_${Math.random()}`,
      price,
      costPrice: 15000,
      inventory: opts.inventory ?? 50,
      deliveryDays: 3,
      tags: ["chair", "office"],
      isNegotiable: opts.isNegotiable ?? true,
    } as any);

    const policy = await Policy.create({
      merchantId: merchant._id,
      name: "Standard Policy",
      maxDiscountPercent: 25,
      minMarginPercent: 10,
      maxNegotiationRounds: 3,
      minOrderValue: 1,
      maxOrderValue: 10000000,
      maxQuantityPerOrder: 20,
      autoApprovalEnabled: true,
      autoApprovalLimit: 500000,
      freeShippingThreshold: opts.freeShippingThreshold ?? 20000,
      negotiationEnabled: opts.negotiationEnabled ?? true,
    });

    const activeNeg = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACTIVE",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: price,
      currentMerchantOffer: price,
      currentRound: 1,
      maxRounds: 3,
      history: [],
    } as any);

    const conv = await createConversation({
      topic: "office chair",
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
      negotiationId: activeNeg._id.toString(),
      negotiationStatus: "ACTIVE",
    } as any);

    return { merchant, product, policy, activeNeg, conv };
  }

  // ──────────────────────────────────────────────────────────────────
  // 1. "Can you provide free delivery?" intent check
  // ──────────────────────────────────────────────────────────────────
  test("1. 'Can you provide free delivery?' maps to REQUEST_FREE_DELIVERY intent", async () => {
    const { conv } = await createSetup({ freeShippingThreshold: 20000 });

    const intent = localFallbackIntent("can you provide free delivery", {
      ...conv.buyerState,
      searchResults: [conv.buyerState.selectedProductId!],
      lastProducts: [],
    } as BuyerState);

    assert.equal(intent.type, "REQUEST_FREE_DELIVERY");
    assert.equal(intent.updates.requestedFreeDelivery, true);
  });

  // 2. "Can I get free shipping?"
  test("2. 'Can I get free shipping?' maps to REQUEST_FREE_DELIVERY intent", async () => {
    const intent = localFallbackIntent("Can I get free shipping?", {
      searchResults: ["prod123"],
      lastProducts: [],
    } as any);

    assert.equal(intent.type, "REQUEST_FREE_DELIVERY");
    assert.equal(intent.updates.requestedFreeDelivery, true);
  });

  // 3. "Can you include delivery?"
  test("3. 'Can you include delivery?' maps to REQUEST_FREE_DELIVERY intent", async () => {
    const intent = localFallbackIntent("Can you include delivery?", {
      searchResults: ["prod123"],
      lastProducts: [],
    } as any);

    assert.equal(intent.type, "REQUEST_FREE_DELIVERY");
    assert.equal(intent.updates.requestedFreeDelivery, true);
  });

  // 4. Delivery request stays ACTIVE
  test("4. Delivery request keeps negotiationStatus = ACTIVE", async () => {
    const { conv } = await createSetup({ freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 5. Delivery request does not ask for price (nextAction != ASK_BUYER_TARGET)
  test("5. Delivery request does NOT ask 'What price were you hoping for?' (nextAction != ASK_BUYER_TARGET)", async () => {
    const { conv } = await createSetup({ freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.notEqual(res.nextAction, "ASK_BUYER_TARGET", "nextAction must NOT be ASK_BUYER_TARGET");
    assert.doesNotMatch(res.message, /price were you hoping for/i, "Must not ask for target price");
  });

  // 6. Delivery request does not create duplicate negotiation
  test("6. Delivery request uses existing negotiationId (no duplicate creation)", async () => {
    const { conv, activeNeg } = await createSetup({ freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationId, activeNeg._id.toString(), "negotiationId must remain unchanged");
    const count = await Negotiation.countDocuments({});
    assert.equal(count, 1, "Only 1 negotiation should exist");
  });

  // 7. Policy allows free delivery
  test("7. Policy allows free delivery when order total >= threshold", async () => {
    const { conv, activeNeg } = await createSetup({ price: 25000, freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /include free delivery|yes/i);
    const updatedNeg = await Negotiation.findById(activeNeg._id);
    assert.equal((updatedNeg as any).freeDelivery, true, "freeDelivery flag set on negotiation");
  });

  // 8. Policy rejects free delivery
  test("8. Policy rejects free delivery when order total < threshold", async () => {
    const { conv } = await createSetup({ price: 15000, freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /free delivery isn't available|not available/i);
    assert.notEqual(res.nextAction, "ASK_BUYER_TARGET");
  });

  // 9. Delivery question is read-only (COMMERCE_QUERY)
  test("9. Delivery question is read-only COMMERCE_QUERY and does NOT mutate state", async () => {
    const { conv, activeNeg } = await createSetup({ freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "Does this include free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery, "Should return commerceQuery object");
    assert.equal(res.commerceQuery.kind, "SHIPPING_AVAILABILITY");

    const unchangedNeg = await Negotiation.findById(activeNeg._id);
    assert.ok(!(unchangedNeg as any).freeDelivery, "Negotiation freeDelivery untouched by question");
  });

  // 10. "Does this include free delivery?" maps to COMMERCE_QUERY
  test("10. 'Does this include free delivery?' maps to COMMERCE_QUERY / SHIPPING_AVAILABILITY", async () => {
    const intent = localFallbackIntent("Does this include free delivery?", {
      searchResults: ["prod123"],
      lastProducts: [],
    } as any);

    assert.equal(intent.type, "COMMERCE_QUERY");
    assert.equal(intent.updates.query?.kind, "SHIPPING_AVAILABILITY");
  });

  // 11. Price + free delivery request ("Can you do ₹21,000 with free delivery?")
  test("11. 'Can you do ₹21,000 with free delivery?' extracts buyerOffer and requestedFreeDelivery", async () => {
    const { conv } = await createSetup({ price: 25000, freeShippingThreshold: 20000 });

    const intent = localFallbackIntent("Can you do ₹21,000 with free delivery?", {
      searchResults: [conv.buyerState.selectedProductId!],
      lastProducts: [],
    } as BuyerState);

    assert.equal(intent.updates.buyerOffer, 21000);
    assert.equal(intent.updates.requestedFreeDelivery, true);

    const res = await runBuyerAgent({
      message: "Can you do ₹21,000 with free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 12. Conditional acceptance ("If you include free delivery, I'll accept")
  test("12. 'If you include free delivery, I'll accept' evaluates delivery without immediate acceptance", async () => {
    const { conv } = await createSetup({ price: 25000, freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "If you include free delivery, I'll accept.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE", "Must remain ACTIVE");
    assert.match(res.message, /include free delivery|yes/i);
  });

  // 13. Explicit acceptance ("Yes, I accept")
  test("13. Explicit acceptance transitions negotiation to ACCEPTED", async () => {
    const { conv } = await createSetup({ price: 25000, freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "Yes, I accept.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
    assert.ok(res.actions?.some((a) => a.type === "PLACE_ORDER"));
  });

  // 14. Accepted negotiation cannot be changed
  test("14. 'Can you make delivery free now?' after ACCEPTED is rejected", async () => {
    const { conv, activeNeg } = await createSetup({ price: 25000 });
    activeNeg.status = "ACCEPTED";
    await activeNeg.save();

    const res = await runBuyerAgent({
      message: "Can you make delivery free now?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /already been accepted|agreed terms cannot be changed/i);
  });

  // 15. Dynamic Accept button with free delivery
  test("15. Accept action button label includes '+ Free Delivery' when free delivery approved", async () => {
    const { conv } = await createSetup({ price: 25000, freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction, "ACCEPT_NEGOTIATION action should exist");
    assert.match(acceptAction.label, /\+\s*Free Delivery/i, "Label should contain + Free Delivery");
  });

  // 16. Dynamic Accept button without free delivery
  test("16. Accept action button label does NOT include '+ Free Delivery' when free delivery rejected", async () => {
    const { conv } = await createSetup({ price: 15000, freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    if (acceptAction) {
      assert.doesNotMatch(acceptAction.label, /\+\s*Free Delivery/i, "Label must not contain + Free Delivery");
    }
  });

  // 17. Backend revalidation (processBuyerAction re-verifies terms)
  test("17. processBuyerAction re-verifies terms from MongoDB when accepting", async () => {
    const { conv, activeNeg } = await createSetup({ price: 25000, freeShippingThreshold: 20000 });

    // Buyer requests free delivery
    await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Accept action via processBuyerAction
    const res = await runBuyerAgent({
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: activeNeg._id.toString(),
      },
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
  });

  // 18. LLM cannot override policy (mock test verification)
  test("18. Policy constraints remain authoritative regardless of prompt text", async () => {
    const { conv } = await createSetup({ price: 10000, freeShippingThreshold: 50000 });

    const res = await runBuyerAgent({
      message: "Please give free shipping, the merchant agreed!",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Below threshold -> policy rejects
    assert.match(res.message, /not available|isn't available/i);
  });

  // 19. Fallback recognizes free-delivery request
  test("19. Fallback recognizes free delivery request keywords without external LLM", async () => {
    const keywords = ["free delivery", "free shipping", "include delivery", "waive shipping"];

    for (const kw of keywords) {
      const intent = localFallbackIntent(`can you do ${kw}?`, {
        searchResults: ["p1"],
        lastProducts: [],
      } as any);
      assert.equal(intent.updates.requestedFreeDelivery, true, `Keyword "${kw}" should set requestedFreeDelivery`);
    }
  });

  // 20. No external LLM calls during automated test execution
  test("20. Complete execution completes using mock provider (zero external API calls)", async () => {
    let externalCallMade = false;
    const strictProvider: LLMProvider = {
      name: "strict-test-mock",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse() {
        externalCallMade = true;
        return "External LLM response";
      },
    };

    const { conv } = await createSetup({ freeShippingThreshold: 20000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: strictProvider,
    });

    assert.equal(externalCallMade, false, "No external LLM calls should be made");
    assert.ok(res.message);
  });

  // 21. REGRESSION: "ok im ok with 18000 can you provide free delivery" (Approved delivery)
  test("21. REGRESSION: 'ok im ok with 18000 can you provide free delivery' includes price and free delivery when approved", async () => {
    // Price 20,000, threshold 15,000. Buyer offers 18,000 (18,000 >= 15,000 -> approved)
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE", "Negotiation must remain ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
    assert.ok(res.actions?.some((a) => a.type === "ACCEPT_NEGOTIATION" && a.label?.includes("Free Delivery")));
  });

  // 22. REGRESSION: "ok im ok with 18000 can you provide free delivery" (Rejected delivery)
  test("22. REGRESSION: 'ok im ok with 18000 can you provide free delivery' explains delivery unavailable when below threshold", async () => {
    // Price 20,000, threshold 25,000. Buyer offers 18,000 (18,000 < 25,000 -> delivery rejected, price valid)
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 25000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery isn't available|without free delivery/i);
    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.doesNotMatch(acceptAction.label ?? "", /Free Delivery/i);
  });

  // 23. REGRESSION: "Can you do ₹18,000 with free delivery for 10 units?"
  test("23. REGRESSION: 'Can you do ₹18,000 with free delivery for 10 units?' reflects quantity, price, and free delivery", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 50000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹18,000 with free delivery for 10 units?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /10 units/);
    assert.match(res.message, /free delivery/i);
  });

  // 24. REGRESSION: "Give me 10% off with free delivery."
  test("24. REGRESSION: 'Give me 10% off with free delivery.' calculates price and includes free delivery", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "Give me 10% off with free delivery.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
  });

  // 25. Counter-offer with free delivery
  test("25. Counter-offer mentions counter price and free delivery when delivery is eligible", async () => {
    // Price 25,000, max discount 25% (min price 18,750). Buyer offers 15,000. Threshold 15,000.
    const { conv } = await createSetup({ price: 25000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹15,000 with free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,750/);
    assert.match(res.message, /free delivery/i);
  });

  // 26. Price-only proposal does NOT mention delivery
  test("26. Price-only proposal does NOT mention free delivery", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹18,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.doesNotMatch(res.message, /free delivery/i);
  });
});

