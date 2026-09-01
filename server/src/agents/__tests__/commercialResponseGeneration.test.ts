/**
 * commercialResponseGeneration.test.ts
 *
 * Comprehensive tests for refactored commercial response generation:
 * - Natural language response generation with LLM consuming authoritative CommercialResult
 * - Deterministic fallback when LLM fails or produces invalid output
 * - Deterministic fact preservation validation (no second LLM call)
 * - Deterministic backend action button generation
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
import {
  runBuyerAgent,
  generateCommercialResponseFallback,
  type CommercialResult,
} from "../buyerAgent.js";
import {
  buildCommercialResponseContext,
  validateCommercialResponseFacts,
} from "../buildCommercialResponseContext.js";
import { localFallbackIntent } from "../intentNormalizer.js";
import type { LLMProvider, LLMGenerateResponseInput } from "../../llm/llmProvider.js";
import { createConversation } from "../../services/conversationService.js";
import type { BuyerState } from "../buyerState.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/razorpay_hackathon_test";

const testMockProvider: LLMProvider = {
  name: "test-mock-provider",
  async generateIntent({ message, currentState }) {
    return localFallbackIntent(message, currentState);
  },
  async generateResponse(input: LLMGenerateResponseInput) {
    if (input.commercialResult) {
      return generateCommercialResponseFallback(input.commercialResult as any).message;
    }
    if (input.products.length === 0) return "No matching products were found.";
    return `Found ${input.products.length} product(s).`;
  },
};

describe("Commercial Response Generation & Architecture Tests", () => {
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

  // 1. Normal valid response with custom LLM wording
  test("1. Custom LLM generates valid natural response from CommercialResult", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const naturalLLMProvider: LLMProvider = {
      name: "natural-mock-llm",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse({ commercialResult }) {
        if (commercialResult?.decision === "VALID") {
          return `Good news — ₹${commercialResult.commercialTerms.unitPrice.toLocaleString("en-IN")} works, and free delivery is included! Would you like to lock it in?`;
        }
        return "Sure.";
      },
    };

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: naturalLLMProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /Good news/);
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery is included/i);
  });

  // 2. Price + free delivery
  test("2. Commercial response preserves both price and free delivery when approved", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
  });

  // 3. Price without free delivery (delivery below threshold)
  test("3. Commercial response preserves price and explains free delivery is not available", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 25000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery isn't available|without free delivery/i);
  });

  // 4. Counter offer + free delivery
  test("4. Counter offer communicates counter price and free delivery status", async () => {
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

  // 5. Counter offer without free delivery
  test("5. Counter offer communicates counter price and unavailable delivery when below threshold", async () => {
    const { conv } = await createSetup({ price: 25000, freeShippingThreshold: 30000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹15,000 with free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,750/);
    assert.match(res.message, /without free delivery/i);
  });

  // 6. Delivery rejected
  test("6. Standalone delivery request rejected when below threshold", async () => {
    const { conv } = await createSetup({ price: 15000, freeShippingThreshold: 25000 });

    const res = await runBuyerAgent({
      message: "Can you include free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /Free delivery isn't available/i);
  });

  // 7. Expired negotiation
  test("7. Expired negotiation correctly formatted", async () => {
    const result: CommercialResult = {
      decision: "EXPIRED",
      requestedTerms: { quantity: 1, requestedFreeDelivery: false },
      commercialTerms: { unitPrice: 20000, quantity: 1, freeDelivery: false, maxRounds: 3, currency: "INR" },
      negotiationStatus: "EXPIRED",
    };
    const response = generateCommercialResponseFallback(result);
    assert.match(response.message, /Maximum negotiation rounds \(3\) reached/i);
  });

  // 8. Rejected offer
  test("8. Rejected offer response explains limits without exposing private cost", async () => {
    const result: CommercialResult = {
      decision: "REJECT",
      requestedTerms: { buyerOffer: 10000, quantity: 1, requestedFreeDelivery: false },
      commercialTerms: { unitPrice: 20000, quantity: 1, freeDelivery: false, currency: "INR" },
      negotiationStatus: "ACTIVE",
    };
    const response = generateCommercialResponseFallback(result);
    assert.match(response.message, /rules don't allow a lower price/i);
    assert.doesNotMatch(response.message, /costPrice|margin|internal/i);
  });

  // 9. Quantity preserved
  test("9. Quantity > 1 is preserved in response context and message", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 50000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹18,000 with free delivery for 10 units?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /10 units/);
    assert.match(res.message, /18,000/);
  });

  // 10. Discount-derived price preserved
  test("10. Percentage discount proposal calculates price and reflects in response", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "Give me 10% off with free delivery.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
  });

  // 11. Active status remains described as current offer
  test("11. Active negotiation does not claim deal is final", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.doesNotMatch(res.message, /final price|deal confirmed|order placed/i);
  });

  // 12. Accepted status can be described as accepted
  test("12. Accepted status confirms negotiation agreement", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "Yes, I accept.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
    assert.match(res.message, /accepted/i);
  });

  // 13. LLM cannot alter price / validation triggers fallback
  test("13. LLM failure to mention free delivery when requested triggers fallback validation", async () => {
    const faultyProvider: LLMProvider = {
      name: "faulty-llm",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse() {
        // Hallucinates: drops delivery completely
        return "₹18,000 works.";
      },
    };

    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: faultyProvider,
    });

    // Fallback was used because faulty LLM dropped free delivery
    assert.match(res.message, /free delivery/i);
  });

  // 14. LLM cannot claim free delivery when backend said false
  test("14. LLM claiming free delivery when false triggers fallback validation", async () => {
    const hallucinatingProvider: LLMProvider = {
      name: "hallucinating-llm",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse() {
        return "₹18,000 per unit works and free delivery is included!";
      },
    };

    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 30000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: hallucinatingProvider,
    });

    // Fallback was used because LLM falsely claimed free delivery
    assert.match(res.message, /free delivery isn't available|without free delivery/i);
  });

  // 15. LLM cannot claim acceptance early
  test("15. LLM claiming deal confirmed while ACTIVE triggers fallback validation", async () => {
    const prematureProvider: LLMProvider = {
      name: "premature-llm",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse() {
        return "Deal confirmed! Your order placed successfully.";
      },
    };

    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: prematureProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.doesNotMatch(res.message, /deal confirmed|order placed/i);
  });

  // 16. Private merchant data not in CommercialResponseContext
  test("16. buildCommercialResponseContext contains only safe commercial facts", () => {
    const result: CommercialResult = {
      decision: "VALID",
      requestedTerms: { buyerOffer: 18000, quantity: 1, requestedFreeDelivery: true },
      commercialTerms: { unitPrice: 18000, quantity: 1, freeDelivery: true, currency: "INR" },
      negotiationStatus: "ACTIVE",
    };
    const context = buildCommercialResponseContext(result);
    assert.equal((context as any).costPrice, undefined);
    assert.equal((context as any).minMarginPercent, undefined);
    assert.equal((context as any).margin, undefined);
  });

  // 17. Provider throws error -> uses fallback
  test("17. LLM exception safely recovers using deterministic fallback", async () => {
    const throwingProvider: LLMProvider = {
      name: "throwing-llm",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse() {
        throw new Error("OpenRouter 500 Internal Server Error");
      },
    };

    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: throwingProvider,
    });

    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
  });

  // 18. Action buttons remain backend generated
  test("18. Action buttons are strictly backend generated without LLM mutation", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.actions && res.actions.length > 0);
    assert.equal(res.actions[0].type, "ACCEPT_NEGOTIATION");
    assert.equal(res.actions[0].label, "Accept ₹18,000 + Free Delivery");
  });

  // 19. Dynamic button label when free delivery false
  test("19. Dynamic button label without free delivery is exact", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 30000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.actions && res.actions.length > 0);
    assert.equal(res.actions[0].label, "Accept ₹18,000");
  });

  // 20. Exact regression: "ok im ok with 18000 can you provide free delivery"
  test("20. EXACT REGRESSION: 'ok im ok with 18000 can you provide free delivery' communicates all terms and stays ACTIVE", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 15000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
    assert.ok(res.actions?.some((a) => a.type === "ACCEPT_NEGOTIATION" && a.label?.includes("Free Delivery")));
  });

  // 21. No second LLM validation call
  test("21. validateCommercialResponseFacts executes synchronously without network calls", () => {
    const result: CommercialResult = {
      decision: "VALID",
      requestedTerms: { buyerOffer: 18000, quantity: 1, requestedFreeDelivery: true },
      commercialTerms: { unitPrice: 18000, quantity: 1, freeDelivery: true, currency: "INR" },
      negotiationStatus: "ACTIVE",
    };
    const valid = validateCommercialResponseFacts("₹18,000 works and free delivery can be included.", result);
    assert.equal(valid, true);

    const invalid = validateCommercialResponseFacts("Deal confirmed! Order placed.", result);
    assert.equal(invalid, false);
  });

  // 22. Same negotiation ID preserved throughout multi-turn flow
  test("22. Same negotiation ID is preserved across multiple negotiation turns", async () => {
    const { conv, activeNeg } = await createSetup({ price: 25000, freeShippingThreshold: 15000 });

    const res1 = await runBuyerAgent({
      message: "Can you do ₹15,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    assert.equal(res1.searchState.negotiationId, activeNeg._id.toString());

    const res2 = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    assert.equal(res2.searchState.negotiationId, activeNeg._id.toString());
  });
});
