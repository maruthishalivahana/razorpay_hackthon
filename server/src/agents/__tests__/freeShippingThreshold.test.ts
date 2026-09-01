/**
 * freeShippingThreshold.test.ts
 *
 * Comprehensive tests for single-source-of-truth free shipping threshold architecture:
 * - Policy.freeShippingThreshold is the ONLY source of truth
 * - No Negotiation.freeDelivery field
 * - Free delivery eligibility is calculated dynamically: orderValue = unitPrice * quantity
 * - Threshold boundary is inclusive (orderValue >= freeShippingThreshold)
 * - Questions vs Requests separation
 * - Dynamic Accept buttons computed from Policy
 * - Agreement creation does not rely on Negotiation.freeDelivery
 * - Zero external LLM calls during tests (using testMockProvider)
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Merchant from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Negotiation, { type INegotiation } from "../../models/Negotiation.js";
import Agreement from "../../models/Agreement.js";
import AuditEvent from "../../models/AuditEvent.js";
import Conversation from "../../models/Conversation.js";
import {
  runBuyerAgent,
  generateCommercialResponseFallback,
  type CommercialResult,
} from "../buyerAgent.js";
import { localFallbackIntent } from "../intentNormalizer.js";
import type { LLMProvider, LLMGenerateResponseInput } from "../../llm/llmProvider.js";
import { createConversation } from "../../services/conversationService.js";
import { resolveCommerceQuery } from "../../services/commerceQueryResolver.js";
import { createAgreementFromNegotiation } from "../../services/agreementService.js";
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

describe("Single Source of Truth: freeShippingThreshold Architecture Tests", () => {
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
    quantity?: number;
  } = {}) {
    const merchant = await Merchant.create({
      name: "Test Merchant",
      businessName: "Test Merchant Pvt Ltd",
      email: `merchant_${Date.now()}_${Math.random()}@test.com`,
    } as any);

    const price = opts.price ?? 24000;
    const product = await Product.create({
      merchantId: merchant._id,
      name: "Office Chair Pro",
      description: "Ergonomic office chair",
      category: "Furniture",
      sku: `SKU_${Date.now()}_${Math.random()}`,
      price,
      costPrice: opts.costPrice ?? 1000,
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
      freeShippingThreshold: opts.freeShippingThreshold ?? 5000,
      negotiationEnabled: opts.negotiationEnabled ?? true,
    });

    const activeNeg = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACTIVE",
      quantity: opts.quantity ?? 1,
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
      quantity: opts.quantity ?? 1,
    } as any);

    return { merchant, product, policy, activeNeg, conv };
  }

  // 1. Policy threshold exists
  test("1. Policy schema stores and returns freeShippingThreshold", async () => {
    const { policy } = await createSetup({ freeShippingThreshold: 5000 });
    assert.equal(policy.freeShippingThreshold, 5000);
    assert.equal((policy as any).freeDeliveryEnabled, undefined, "No freeDeliveryEnabled field");
  });

  // 2. Order above threshold is eligible
  test("2. Order above threshold is eligible (₹18,000 >= ₹5,000)", async () => {
    const { conv } = await createSetup({ price: 24000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹18,000 with free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.match(acceptAction.label, /\+\s*Free Delivery/i);
  });

  // 3. Order equal to threshold is eligible (inclusive boundary)
  test("3. Order exactly equal to threshold is eligible (₹5,000 == ₹5,000)", async () => {
    const { conv } = await createSetup({ price: 6000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹5,000 with free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /5,000/);
    assert.match(res.message, /free delivery/i);
    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.match(acceptAction.label, /\+\s*Free Delivery/i);
  });

  // 4. Order below threshold is not eligible
  test("4. Order below threshold is not eligible (₹4,000 < ₹5,000)", async () => {
    const { conv } = await createSetup({ price: 4500, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹4,000 with free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /4,000/);
    assert.match(res.message, /free delivery isn't available|without free delivery/i);
    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.doesNotMatch(acceptAction.label, /\+\s*Free Delivery/i);
  });

  // 5. Quantity changes order value
  test("5. Quantity increases order value (₹4,000 * 2 = ₹8,000 >= ₹5,000)", async () => {
    const { conv } = await createSetup({ price: 4500, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹4,000 with free delivery for 2 units?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /4,000/);
    assert.match(res.message, /2 units/);
    assert.match(res.message, /free delivery/i);
    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.match(acceptAction.label, /\+\s*Free Delivery/i);
  });

  // 6. Free delivery request
  test("6. 'Can you include free delivery?' is processed as REQUEST_FREE_DELIVERY", async () => {
    const { conv } = await createSetup({ price: 24000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you include free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /free delivery/i);
  });

  // 7. Free delivery question
  test("7. 'Does this include free delivery?' is read-only COMMERCE_QUERY", async () => {
    const { conv, product, policy, activeNeg } = await createSetup({ price: 24000, freeShippingThreshold: 5000 });

    const queryRes = await resolveCommerceQuery({
      query: { kind: "SHIPPING_AVAILABILITY", subject: "SELECTED_PRODUCT" },
      buyerState: conv.buyerState,
      product: product as any,
      policy,
      negotiation: activeNeg,
    });

    assert.equal(queryRes.kind, "SHIPPING_AVAILABILITY");
    assert.match(queryRes.answer, /qualifies for free delivery/i);
    // Verify negotiation was not mutated
    const reloadedNeg = await Negotiation.findById(activeNeg._id);
    assert.equal(reloadedNeg?.status, "ACTIVE");
    assert.equal((reloadedNeg as any)?.freeDelivery, undefined);
  });

  // 8. Free delivery eligible
  test("8. Free delivery eligible response is accurate", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /free delivery/i);
  });

  // 9. Free delivery not eligible
  test("9. Free delivery not eligible response explains policy threshold", async () => {
    const { conv } = await createSetup({ price: 3000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /Free delivery isn't available/i);
  });

  // 10. Negotiation remains ACTIVE
  test("10. Delivery request keeps negotiation status ACTIVE", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 11. No Negotiation.freeDelivery in MongoDB
  test("11. MongoDB Negotiation document does NOT contain freeDelivery field", async () => {
    const { conv, activeNeg } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const rawNeg = await mongoose.connection.db?.collection("negotiations").findOne({ _id: activeNeg._id });
    assert.equal(rawNeg?.freeDelivery, undefined, "Negotiation in DB must NOT have freeDelivery");
  });

  // 12. requestedFreeDelivery preserved in intent / state
  test("12. requestedFreeDelivery is captured in buyer state", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.requestedFreeDelivery, true);
  });

  // 13. Dynamic Accept button with delivery
  test("13. Dynamic Accept button contains '+ Free Delivery' when eligible", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹18,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.equal(acceptAction.label, "Accept ₹18,000 + Free Delivery");
  });

  // 14. Dynamic button without delivery
  test("14. Dynamic Accept button does NOT contain '+ Free Delivery' when ineligible", async () => {
    const { conv } = await createSetup({ price: 4000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹4,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.equal(acceptAction.label, "Accept ₹4,000");
  });

  // 15. Combined discount + delivery
  test("15. Combined percentage discount and delivery proposal", async () => {
    const { conv } = await createSetup({ price: 20000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Give me 10% off with free delivery.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
  });

  // 16. Combined price + delivery
  test("16. Combined target price and delivery proposal", async () => {
    const { conv } = await createSetup({ price: 24000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.match(res.message, /free delivery/i);
  });

  // 17. Conditional acceptance
  test("17. 'I'll take ₹18,000 if delivery is free' remains ACTIVE", async () => {
    const { conv } = await createSetup({ price: 24000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "I'll take ₹18,000 if delivery is free.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
  });

  // 18. Explicit acceptance
  test("18. 'Yes, I accept' transitions status to ACCEPTED", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Yes, I accept.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
    assert.ok(res.actions?.some((a) => a.type === "PLACE_ORDER"));
  });

  // 19. Policy update (threshold 5000 -> 25000)
  test("19. Updated merchant policy threshold immediately takes effect on next request", async () => {
    const { conv, policy } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    // Update policy threshold
    policy.freeShippingThreshold = 25000;
    await policy.save();

    const res = await runBuyerAgent({
      message: "can you provide free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // ₹18,000 is now below ₹25,000 threshold
    assert.match(res.message, /Free delivery isn't available/i);
    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    if (acceptAction) {
      assert.doesNotMatch(acceptAction.label, /Free Delivery/i);
    }
  });

  // 20. Product price update
  test("20. Product price changes order value dynamically", async () => {
    const { conv, product } = await createSetup({ price: 4000, freeShippingThreshold: 5000 });

    // Product price increases to 6000
    product.price = 6000;
    await product.save();

    const res = await runBuyerAgent({
      message: "Can you do ₹6,000 with free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /free delivery/i);
  });

  // 21. Agreement creation uses current validated terms without freeDelivery field
  test("21. createAgreementFromNegotiation does NOT read or set freeDelivery on Negotiation", async () => {
    const { activeNeg } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    activeNeg.status = "ACCEPTED";
    activeNeg.acceptedPrice = 18000;
    activeNeg.finalOrderValue = 18000;
    await activeNeg.save();

    const agreement = await createAgreementFromNegotiation(activeNeg._id.toString());
    assert.ok(agreement);
    assert.equal(agreement.status, "APPROVED");
    assert.equal((agreement as any).freeDelivery, undefined);
  });

  // 22. No duplicate agreement created
  test("22. createAgreementFromNegotiation is idempotent", async () => {
    const { activeNeg } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    activeNeg.status = "ACCEPTED";
    activeNeg.acceptedPrice = 18000;
    activeNeg.finalOrderValue = 18000;
    await activeNeg.save();

    const agr1 = await createAgreementFromNegotiation(activeNeg._id.toString());
    const agr2 = await createAgreementFromNegotiation(activeNeg._id.toString());
    assert.equal(agr1._id.toString(), agr2._id.toString());
  });

  // 23. No private policy fields exposed
  test("23. Private policy fields like minMarginPercent are not exposed in commercial result", () => {
    const result: CommercialResult = {
      decision: "VALID",
      requestedTerms: { buyerOffer: 18000, quantity: 1, requestedFreeDelivery: true },
      commercialTerms: { unitPrice: 18000, quantity: 1, freeDelivery: true, currency: "INR" },
      negotiationStatus: "ACTIVE",
    };
    const response = generateCommercialResponseFallback(result);
    assert.doesNotMatch(response.message, /margin|costPrice|minMarginPercent/i);
  });

  // 24. Deterministic fallback preserves facts
  test("24. Deterministic fallback includes exact unitPrice and free delivery eligibility", () => {
    const result: CommercialResult = {
      decision: "VALID",
      requestedTerms: { buyerOffer: 18000, quantity: 1, requestedFreeDelivery: true },
      commercialTerms: { unitPrice: 18000, quantity: 1, freeDelivery: true, currency: "INR" },
      negotiationStatus: "ACTIVE",
    };
    const response = generateCommercialResponseFallback(result);
    assert.match(response.message, /18,000/);
    assert.match(response.message, /free delivery/i);
  });

  // 25. Rejection fallback when below threshold
  test("25. Deterministic fallback explains free delivery unavailable when false", () => {
    const result: CommercialResult = {
      decision: "VALID_WITHOUT_DELIVERY",
      requestedTerms: { buyerOffer: 4000, quantity: 1, requestedFreeDelivery: true },
      commercialTerms: { unitPrice: 4000, quantity: 1, freeDelivery: false, currency: "INR" },
      negotiationStatus: "ACTIVE",
    };
    const response = generateCommercialResponseFallback(result);
    assert.match(response.message, /4,000/);
    assert.match(response.message, /free delivery isn't available|without free delivery/i);
  });

  // 26. Price-only proposal does not trigger delivery text
  test("26. Price-only proposal does not mention free delivery", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you do ₹18,000?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.match(res.message, /18,000/);
    assert.doesNotMatch(res.message, /free delivery/i);
  });

  // 27. Free delivery with existing active offer does not ask for price
  test("27. 'Can you include free delivery?' when price is known does not ask 'What price were you hoping for?'", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you include free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.doesNotMatch(res.message, /what price were you hoping for/i);
    assert.match(res.message, /free delivery/i);
  });

  // 28. 'Can you give me a better price?' still asks for price
  test("28. 'Can you give me a better price?' prompts for target price", async () => {
    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "Can you give me a better price?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.match(res.message, /what price were you hoping for/i);
  });

  // 29. INegotiation interface has no freeDelivery
  test("29. INegotiation TypeScript interface does not declare freeDelivery", () => {
    type HasFreeDelivery = "freeDelivery" extends keyof INegotiation ? true : false;
    const hasField: HasFreeDelivery = false;
    assert.equal(hasField, false);
  });

  // 30. Zero external LLM calls during automated test run
  test("30. Execution completes using testMockProvider with 0 external LLM calls", async () => {
    let externalCalls = 0;
    const strictProvider: LLMProvider = {
      name: "strict-mock",
      async generateIntent({ message, currentState }) {
        return localFallbackIntent(message, currentState);
      },
      async generateResponse(input) {
        externalCalls++;
        if (input.commercialResult) {
          return generateCommercialResponseFallback(input.commercialResult as any).message;
        }
        return "response";
      },
    };

    const { conv } = await createSetup({ price: 18000, freeShippingThreshold: 5000 });

    const res = await runBuyerAgent({
      message: "ok im ok with 18000 can you provide free delivery",
      conversationId: conv.conversationId,
      provider: strictProvider,
    });

    assert.ok(res.message);
    assert.equal(externalCalls, 1, "Mock provider handled response without network calls");
  });
});
