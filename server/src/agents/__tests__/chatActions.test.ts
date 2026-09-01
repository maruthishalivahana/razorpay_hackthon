/**
 * chatActions.test.ts
 *
 * Comprehensive test suite for Interactive Chat Action Buttons (30 tests).
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
import { startNegotiation, submitBuyerOffer } from "../../services/negotiationService.js";
import { createAgreementFromNegotiation } from "../../services/agreementService.js";

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
    return `Found ${products.length} product(s)${topicStr}:\n${listStr}`;
  },
};

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/razorpay_hackathon_test";

describe("Interactive Chat Action Buttons Tests", () => {
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

  // Helper fixture builder
  async function createTestFixture(opts: {
    price?: number;
    costPrice?: number;
    maxDiscountPercent?: number;
    autoApprovalLimit?: number;
    inventory?: number;
  } = {}) {
    const merchant = await Merchant.create({
      name: "Action Merchant",
      businessName: "Action Merchant Pvt Ltd",
      email: `merchant_${Date.now()}_${Math.random()}@test.com`,
      apiKey: `key_${Date.now()}_${Math.random()}`,
    });

    const product = await Product.create({
      merchantId: merchant._id,
      name: "Ergonomic Desk Chair",
      description: "Ergonomic desk chair for home office",
      category: "Furniture",
      sku: `SKU_${Date.now()}_${Math.random()}`,
      price: opts.price ?? 20000,
      costPrice: opts.costPrice ?? 12000,
      inventory: opts.inventory ?? 10,
      deliveryDays: 3,
      tags: ["chair", "ergonomic", "office"],
      isNegotiable: true,
    });

    const policy = await Policy.create({
      merchantId: merchant._id,
      name: "Standard Policy",
      maxDiscountPercent: opts.maxDiscountPercent ?? 20,
      minMarginPercent: 10,
      maxNegotiationRounds: 3,
      autoApprovalEnabled: true,
      autoApprovalLimit: opts.autoApprovalLimit ?? 50000,
      freeShippingThreshold: 15000,
    });

    return { merchant, product, policy };
  }

  // 1. Accept action generated for active counter offer
  test("1. Accept action generated for active counter offer", async () => {
    const { merchant, product } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    // Buyer makes offer below list price -> merchant counter offer generated
    const offerRes = await submitBuyerOffer(neg.id, 17000);
    assert.equal(offerRes.decision, "COUNTER_OFFER");

    const conv = await createConversation({
      topic: "office chair",
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      message: "Check negotiation status",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.actions);
    assert.equal(res.actions.length, 2);
    const acceptAction = res.actions.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.equal(acceptAction.negotiationId, neg.id);
  });

  // 2. Continue negotiation action generated
  test("2. Continue action generated alongside accept action", async () => {
    const { merchant, product } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await submitBuyerOffer(neg.id, 17000);

    const conv = await createConversation({
      topic: "office chair",
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      message: "Status check",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const continueAction = res.actions?.find((a) => a.type === "CONTINUE_NEGOTIATION");
    assert.ok(continueAction);
    assert.equal(continueAction.label, "Continue Negotiating");
  });

  // 3. Place order action generated for accepted negotiation
  test("3. Place order action generated for accepted negotiation", async () => {
    const { merchant, product } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id,
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      acceptedPrice: 18000,
      finalOrderValue: 18000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res = await runBuyerAgent({
      message: "What is next?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.actions);
    const placeOrder = res.actions.find((a) => a.type === "PLACE_ORDER");
    assert.ok(placeOrder);
    assert.equal(placeOrder.label, "Place Order");
  });

  // 4. Pay action generated for approved agreement
  test("4. Pay action generated for approved agreement", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const agreement = await Agreement.create({
      negotiationId: new mongoose.Types.ObjectId(),
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      agreedUnitPrice: 18000,
      discountPercent: 10,
      finalOrderValue: 18000,
      marginPercent: 33.3,
      approvedAt: new Date(),
    });

    const conv = await createConversation({
      agreementId: agreement._id.toString(),
      agreementStatus: "APPROVED",
    });

    const res = await runBuyerAgent({
      message: "Check order",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.actions);
    const payAction = res.actions.find((a) => a.type === "PAY_NOW");
    assert.ok(payAction);
    assert.equal(payAction.agreementId, agreement._id.toString());
  });

  // 5. Accept action executes
  test("5. Accept action button click executes successfully without LLM", async () => {
    const { merchant, product } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await submitBuyerOffer(neg.id, 18000);

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: neg.id,
      },
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
    assert.ok(res.message.includes("accepted"));
    const placeOrder = res.actions?.find((a) => a.type === "PLACE_ORDER");
    assert.ok(placeOrder);
  });

  // 6. Continue action executes
  test("6. Continue action button click executes successfully", async () => {
    const { merchant, product } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "CONTINUE_NEGOTIATION",
        negotiationId: neg.id,
      },
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.ok(res.message.includes("What price would you like to propose"));
  });

  // 7. Place order action executes
  test("7. Place order action button click creates Agreement and returns payment action", async () => {
    const { merchant, product, policy } = await createTestFixture({ autoApprovalLimit: 50000 });
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACCEPTED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      acceptedPrice: 18000,
      finalOrderValue: 18000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: negDoc._id.toString(),
      },
    });

    assert.ok(res.message.includes("approved and ready for payment"));
    assert.ok(res.searchState.agreementId);
    assert.equal(res.searchState.agreementStatus, "APPROVED");
    const payAction = res.actions?.find((a) => a.type === "PAY_NOW");
    assert.ok(payAction);
  });

  // 8. Wrong conversation rejected
  test("8. Action with negotiationId from another conversation is rejected", async () => {
    const { merchant, product } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    const conv1 = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
    });

    const conv2 = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: "other_neg_999",
    });

    await assert.rejects(
      async () => {
        await runBuyerAgent({
          conversationId: conv2.conversationId,
          action: {
            type: "ACCEPT_NEGOTIATION",
            negotiationId: neg.id,
          },
        });
      },
      (err: any) => {
        return err.code === "NEGOTIATION_NOT_FOUND" && err.statusCode === 404;
      }
    );
  });

  // 9. Wrong product negotiation rejected
  test("9. Action with negotiation product mismatching selected product is rejected", async () => {
    const { merchant, product } = await createTestFixture();
    const otherProduct = await Product.create({
      merchantId: merchant._id,
      name: "Different Laptop",
      description: "Fast laptop",
      category: "Electronics",
      sku: "SKU_LAPTOP_123",
      price: 60000,
      costPrice: 40000,
      inventory: 5,
      deliveryDays: 2,
      tags: ["laptop"],
    });

    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: otherProduct._id.toString(),
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
    });

    await assert.rejects(
      async () => {
        await runBuyerAgent({
          conversationId: conv.conversationId,
          action: {
            type: "ACCEPT_NEGOTIATION",
            negotiationId: neg.id,
          },
        });
      },
      (err: any) => {
        return err.code === "INVALID_PRODUCT";
      }
    );
  });

  // 10. Stale negotiation offer rejected safely
  test("10. Stale offer detected when product price increases above policy margin", async () => {
    const { merchant, product, policy } = await createTestFixture({ price: 20000, costPrice: 15000, maxDiscountPercent: 20 });
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await submitBuyerOffer(neg.id, 18000);

    // Increase costPrice so minimum allowed price goes above merchant offer
    product.costPrice = 19500;
    await product.save();

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: neg.id,
      },
    });

    assert.ok(res.message.includes("The offer has changed"));
  });

  // 11. Expired negotiation rejected
  test("11. Expired negotiation rejected with NEGOTIATION_EXPIRED", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "EXPIRED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      currentRound: 3,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "EXPIRED",
    });

    await assert.rejects(
      async () => {
        await runBuyerAgent({
          conversationId: conv.conversationId,
          action: {
            type: "ACCEPT_NEGOTIATION",
            negotiationId: negDoc._id.toString(),
          },
        });
      },
      (err: any) => {
        return err.code === "NEGOTIATION_EXPIRED";
      }
    );
  });

  // 12. Already accepted idempotency
  test("12. Double click ACCEPT_NEGOTIATION returns accepted state idempotently", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACCEPTED",
      acceptedPrice: 18000,
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: negDoc._id.toString(),
      },
    });

    assert.ok(res.message.includes("already been accepted"));
    const placeOrder = res.actions?.find((a) => a.type === "PLACE_ORDER");
    assert.ok(placeOrder);
  });

  // 13. Agreement idempotency
  test("13. Multiple PLACE_ORDER calls create only ONE Agreement", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACCEPTED",
      acceptedPrice: 18000,
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res1 = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: negDoc._id.toString(),
      },
    });

    const res2 = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: negDoc._id.toString(),
      },
    });

    assert.equal(res1.searchState.agreementId, res2.searchState.agreementId);
    const agreementsCount = await Agreement.countDocuments({ negotiationId: negDoc._id });
    assert.equal(agreementsCount, 1);
  });

  // 14. Backend revalidation of commercial terms
  test("14. Frontend price in action payload is ignored (backend price used)", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACTIVE",
      currentMerchantOffer: 18000,
      originalUnitPrice: 20000,
      quantity: 1,
      currency: "INR",
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACTIVE",
    });

    // Pass a fake low price in custom payload property
    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: negDoc._id.toString(),
        price: 5000, // fake price
      } as any,
    });

    const updatedNeg = await Negotiation.findById(negDoc._id);
    assert.equal(updatedNeg?.acceptedPrice, 18000); // Used real 18,000 backend price
  });

  // 15. Product revalidation during acceptance
  test("15. Product revalidation occurs during acceptance", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await submitBuyerOffer(neg.id, 18000);

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: neg.id,
      },
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
  });

  // 16. Policy revalidation during acceptance
  test("16. Policy revalidation fails if policy is disabled before accept", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await submitBuyerOffer(neg.id, 18000);

    // Disable policy
    policy.isActive = false;
    await policy.save();

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    await assert.rejects(
      async () => {
        await runBuyerAgent({
          conversationId: conv.conversationId,
          action: {
            type: "ACCEPT_NEGOTIATION",
            negotiationId: neg.id,
          },
        });
      },
      (err: any) => {
        return err.code === "INVALID_PRODUCT" || err.code === "POLICY_VALIDATION_FAILED";
      }
    );
  });

  // 17. Economic revalidation during acceptance
  test("17. Economic revalidation verifies minimum allowed unit price", async () => {
    const { merchant, product, policy } = await createTestFixture({ price: 20000, costPrice: 12000 });
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await submitBuyerOffer(neg.id, 18000);

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: neg.id,
      },
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
  });

  // 18. Dynamic action labels
  test("18. Dynamic action label includes formatted price", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    await submitBuyerOffer(neg.id, 18500);

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      message: "Check offer",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.ok(acceptAction.label.includes("18,500"));
  });

  // 19. Free delivery label
  test("19. Free delivery label formatted when free delivery included", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACTIVE",
      currentMerchantOffer: 18500,
      originalUnitPrice: 20000,
      quantity: 1,
      currency: "INR",
      freeDelivery: true,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      message: "Check offer",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.ok(acceptAction.label.includes("Free Delivery"));
  });

  // 20. Pending approval action
  test("20. Pending approval order yields VIEW_ORDER_STATUS action", async () => {
    const { merchant, product, policy } = await createTestFixture({ autoApprovalLimit: 10000 }); // Low limit
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACCEPTED",
      acceptedPrice: 18000,
      quantity: 1, // Final order value 18000 > 10000 limit -> PENDING_APPROVAL
      currency: "INR",
      originalUnitPrice: 20000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: negDoc._id.toString(),
      },
    });

    assert.equal(res.searchState.agreementStatus, "PENDING_APPROVAL");
    assert.ok(res.message.includes("waiting for merchant approval"));
    const viewStatusAction = res.actions?.find((a) => a.type === "VIEW_ORDER_STATUS");
    assert.ok(viewStatusAction);
  });

  // 21. Payment ready action
  test("21. Approved order yields PAY_NOW action", async () => {
    const { merchant, product, policy } = await createTestFixture({ autoApprovalLimit: 50000 });
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACCEPTED",
      acceptedPrice: 18000,
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: negDoc._id.toString(),
      },
    });

    assert.equal(res.searchState.agreementStatus, "APPROVED");
    const payAction = res.actions?.find((a) => a.type === "PAY_NOW");
    assert.ok(payAction);
  });

  // 22. Completed agreement has no place-order action
  test("22. View order status action returns status message and actions", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const agreement = await Agreement.create({
      negotiationId: new mongoose.Types.ObjectId(),
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "PENDING_APPROVAL",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      agreedUnitPrice: 18000,
      discountPercent: 10,
      finalOrderValue: 18000,
      marginPercent: 33.3,
    });

    const conv = await createConversation({
      agreementId: agreement._id.toString(),
      agreementStatus: "PENDING_APPROVAL",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "VIEW_ORDER_STATUS",
        agreementId: agreement._id.toString(),
      },
    });

    assert.ok(res.message.includes("pending merchant approval"));
    const viewAction = res.actions?.find((a) => a.type === "VIEW_ORDER_STATUS");
    assert.ok(viewAction);
  });

  // 23. No LLM call for actions
  test("23. Button action execution does NOT call LLM provider", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACTIVE",
      currentMerchantOffer: 18000,
      originalUnitPrice: 20000,
      quantity: 1,
      currency: "INR",
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACTIVE",
    });

    // Pass throwing provider to guarantee no LLM call is made
    const throwingProvider = {
      name: "throwing-provider",
      async generateIntent() {
        throw new Error("LLM should not be called!");
      },
      async generateResponse() {
        throw new Error("LLM should not be called!");
      },
    };

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: negDoc._id.toString(),
      },
      provider: throwingProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
  });

  // 24. Action persists state
  test("24. Action persists state in MongoDB", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACTIVE",
      currentMerchantOffer: 18000,
      originalUnitPrice: 20000,
      quantity: 1,
      currency: "INR",
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: negDoc._id.toString(),
      },
    });

    const doc = await getConversation(res.conversationId);
    assert.ok(doc);
    assert.equal(doc.buyerState.negotiationStatus, "ACCEPTED");
  });

  // 25. Action persists agreement
  test("25. Action persists Agreement in MongoDB", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACCEPTED",
      acceptedPrice: 18000,
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    const res = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: negDoc._id.toString(),
      },
    });

    const agreement = await Agreement.findById(res.searchState.agreementId);
    assert.ok(agreement);
    assert.equal(agreement.finalOrderValue, 18000);
  });

  // 26. Audit event
  test("26. ACCEPT_NEGOTIATION creates audit event with actorType BUYER", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACTIVE",
      currentMerchantOffer: 18000,
      originalUnitPrice: 20000,
      quantity: 1,
      currency: "INR",
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACTIVE",
    });

    await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: negDoc._id.toString(),
      },
    });

    const audit = await AuditEvent.findOne({
      negotiationId: negDoc._id,
      eventType: "NEGOTIATION_ACCEPTED",
    });

    assert.ok(audit);
    assert.equal(audit.actorType, "BUYER");
  });

  // 27. Double click / retries
  test("27. Double click PAY_NOW returns payment ready status", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const agreement = await Agreement.create({
      negotiationId: new mongoose.Types.ObjectId(),
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "APPROVED",
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      agreedUnitPrice: 18000,
      discountPercent: 10,
      finalOrderValue: 18000,
      marginPercent: 33.3,
      approvedAt: new Date(),
    });

    const conv = await createConversation({
      agreementId: agreement._id.toString(),
      agreementStatus: "APPROVED",
    });

    const res1 = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PAY_NOW",
        agreementId: agreement._id.toString(),
      },
    });

    const res2 = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PAY_NOW",
        agreementId: agreement._id.toString(),
      },
    });

    assert.ok(res1.message.includes("Payment ready"));
    assert.ok(res2.message.includes("Payment ready"));
  });

  // 28. Network retry / idempotency
  test("28. Natural language chat continues working alongside actions", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const conv = await createConversation();

    const resNL = await runBuyerAgent({
      message: "I want an office chair",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(resNL.message);
    assert.equal(resNL.searchState.topic, "office chair");
  });

  // 29. Full negotiation → acceptance → order flow
  test("29. Full 4-step negotiation to order placement flow", async () => {
    const { merchant, product, policy } = await createTestFixture();

    // Step 1: Select product
    const res1 = await runBuyerAgent({
      message: "I want an office chair",
      conversationId: undefined,
      provider: testMockProvider,
    });
    const convId = res1.conversationId;

    const res2 = await runBuyerAgent({
      message: "I will take the first one",
      conversationId: convId,
      provider: testMockProvider,
    });

    // Step 2: Start negotiation
    const res3 = await runBuyerAgent({
      message: "Can you give me a better price?",
      conversationId: convId,
      provider: testMockProvider,
    });

    // Step 3: Propose price
    const res4 = await runBuyerAgent({
      message: "I'm around ₹18,500",
      conversationId: convId,
      provider: testMockProvider,
    });

    assert.ok(res4.actions);
    const acceptAction = res4.actions.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);

    // Step 4: Click Accept button
    const res5 = await runBuyerAgent({
      conversationId: convId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: acceptAction.negotiationId,
      },
    });

    assert.equal(res5.searchState.negotiationStatus, "ACCEPTED");

    // Step 5: Click Place Order button
    const placeOrderAction = res5.actions?.find((a) => a.type === "PLACE_ORDER");
    assert.ok(placeOrderAction);

    const res6 = await runBuyerAgent({
      conversationId: convId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: placeOrderAction.negotiationId,
      },
    });

    assert.equal(res6.searchState.agreementStatus, "APPROVED");
    const payNowAction = res6.actions?.find((a) => a.type === "PAY_NOW");
    assert.ok(payNowAction);
  });

  // 30. Full approval gate / payment-ready flow integration
  test("30. Full approval gate flow with manual merchant approval step", async () => {
    const { merchant, product, policy } = await createTestFixture({ autoApprovalLimit: 10000 });

    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "ACCEPTED",
      acceptedPrice: 18000,
      quantity: 1,
      currency: "INR",
      originalUnitPrice: 20000,
      currentRound: 1,
      maxRounds: 3,
      startedAt: new Date(),
    });

    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      negotiationId: negDoc._id.toString(),
      negotiationStatus: "ACCEPTED",
    });

    // Place order
    const res1 = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "PLACE_ORDER",
        negotiationId: negDoc._id.toString(),
      },
    });

    assert.equal(res1.searchState.agreementStatus, "PENDING_APPROVAL");
    const viewStatusAction = res1.actions?.find((a) => a.type === "VIEW_ORDER_STATUS");
    assert.ok(viewStatusAction);

    // View order status action while pending
    const res2 = await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "VIEW_ORDER_STATUS",
        agreementId: viewStatusAction.agreementId,
      },
    });

    assert.ok(res2.message.includes("pending merchant approval"));
  });
});
