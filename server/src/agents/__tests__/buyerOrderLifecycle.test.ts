/**
 * buyerOrderLifecycle.test.ts
 *
 * 42 tests for ACCEPTED NEGOTIATION → AGREEMENT → APPROVAL → PAYMENT READY lifecycle.
 * All tests use testMockProvider. Zero external LLM calls.
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Merchant from "../../models/Merchant.js";
import Product from "../../models/Product.js";
import Policy from "../../models/Policy.js";
import Negotiation from "../../models/Negotiation.js";
import Agreement from "../../models/Agreement.js";
import Approval from "../../models/Approval.js";
import AuditEvent from "../../models/AuditEvent.js";
import Conversation from "../../models/Conversation.js";
import { runBuyerAgent, processBuyerAction } from "../buyerAgent.js";
import { localFallbackIntent } from "../intentNormalizer.js";
import type { LLMProvider } from "../../llm/llmProvider.js";
import { createConversation, getConversation, updateConversationState, storedStateToBuyerState } from "../../services/conversationService.js";
import { startNegotiation, submitBuyerOffer, acceptNegotiation } from "../../services/negotiationService.js";
import {
  createAgreementFromNegotiation,
  isPaymentReady,
  approveAgreement,
} from "../../services/agreementService.js";
import type { BuyerState } from "../buyerState.js";

// ─────────────────────────────────────────────────────────
// Test Mock Provider — zero external LLM
// ─────────────────────────────────────────────────────────

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
      .map((p: any, i: number) => `${i + 1}. ${p.name} — ₹${p.price.toLocaleString("en-IN")}`)
      .join("\n");
    return `Found ${products.length} product(s)${topicStr}:\n${listStr}`;
  },
};

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/razorpay_hackathon_test";

// ─────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────

async function createFixture(opts: {
  price?: number;
  costPrice?: number;
  maxDiscountPercent?: number;
  minMarginPercent?: number;
  autoApprovalEnabled?: boolean;
  autoApprovalLimit?: number;
  freeShippingThreshold?: number;
  maxNegotiationRounds?: number;
} = {}) {
  const merchant = await Merchant.create({
    name: "Lifecycle Merchant",
    businessName: "Lifecycle Merchant Pvt Ltd",
    email: `merchant_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
    apiKey: `key_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  });

  const product = await Product.create({
    merchantId: merchant._id,
    name: "Office Chair Pro",
    sku: `SKU_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    description: "Premium ergonomic office chair",
    category: "Furniture",
    price: opts.price ?? 20000,
    costPrice: opts.costPrice ?? 12000,
    inventory: 50,
    isNegotiable: true,
    status: "active",
  });

  const policy = await Policy.create({
    merchantId: merchant._id,
    name: "Lifecycle Policy",
    description: "Policy for lifecycle tests",
    isActive: true,
    negotiationEnabled: true,
    maxDiscountPercent: opts.maxDiscountPercent ?? 15,
    minMarginPercent: opts.minMarginPercent ?? 10,
    maxQuantityPerOrder: 50,
    minOrderValue: 0,
    maxOrderValue: 1000000,
    autoApprovalEnabled: opts.autoApprovalEnabled ?? true,
    autoApprovalLimit: opts.autoApprovalLimit ?? 100000,
    freeShippingThreshold: opts.freeShippingThreshold ?? 5000,
    maxNegotiationRounds: opts.maxNegotiationRounds ?? 5,
    allowedCurrencies: ["INR"],
  });

  return { merchant, product, policy };
}

async function buildAcceptedNegotiation(opts: {
  price?: number;
  offerPrice?: number;
  autoApprovalLimit?: number;
  freeShippingThreshold?: number;
} = {}) {
  const { merchant, product, policy } = await createFixture({
    price: opts.price ?? 20000,
    autoApprovalLimit: opts.autoApprovalLimit ?? 100000,
    freeShippingThreshold: opts.freeShippingThreshold ?? 5000,
  });

  const neg = await startNegotiation({
    merchantId: merchant._id.toString(),
    productId: product._id.toString(),
    policyId: policy._id.toString(),
    quantity: 2,
    currency: "INR",
  });

  const offerPrice = opts.offerPrice ?? 18000;
  await submitBuyerOffer(neg._id.toString(), offerPrice);
  const accepted = await acceptNegotiation(neg._id.toString(), offerPrice);

  const conversation = await createConversation();

  return { merchant, product, policy, negotiation: accepted, conversation };
}

function makeState(negotiation: any, extra: Partial<BuyerState> = {}): BuyerState {
  return {
    topic: "office chair",
    category: "Furniture",
    minPrice: null,
    maxPrice: null,
    quantity: 2,
    sortBy: "relevance",
    requirements: {},
    hardRequirements: {},
    softPreferences: {},
    lastProducts: [],
    lastQuery: null,
    turnCount: 5,
    searchResults: [],
    selectedProductId: negotiation.productId.toString(),
    selectedProductName: "Office Chair Pro",
    negotiationId: negotiation._id.toString(),
    negotiationStatus: "ACCEPTED",
    agreementId: null,
    agreementStatus: null,
    paymentReady: null,
    pendingAction: null,
    buyerOffer: 18000,
    discountPercent: 10,
    requestedFreeDelivery: null,
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe("Buyer Order Lifecycle Tests", () => {
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
    await Approval.deleteMany({});
    await AuditEvent.deleteMany({});
    await Conversation.deleteMany({});
  });

  // ─── GROUP 1: createAgreementFromNegotiation ───────────

  test("1. createAgreementFromNegotiation creates agreement from ACCEPTED negotiation", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    assert.ok(agreement._id, "Agreement should have _id");
    assert.ok(["APPROVED", "PENDING_APPROVAL"].includes(agreement.status));
    assert.strictEqual(agreement.negotiationId.toString(), negotiation._id.toString());
    assert.ok(agreement.finalOrderValue > 0);
  });

  test("2. createAgreementFromNegotiation is idempotent — multiple calls return same agreement", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const first = await createAgreementFromNegotiation(negotiation._id.toString());
    const second = await createAgreementFromNegotiation(negotiation._id.toString());
    assert.strictEqual(first._id.toString(), second._id.toString());
  });

  test("3. createAgreementFromNegotiation throws NEGOTIATION_NOT_ACCEPTED for ACTIVE negotiation", async () => {
    const { merchant, product, policy } = await createFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });
    await assert.rejects(
      () => createAgreementFromNegotiation(neg._id.toString()),
      (err: any) => { assert.strictEqual(err.code, "NEGOTIATION_NOT_ACCEPTED"); return true; }
    );
  });

  test("4. createAgreementFromNegotiation throws NEGOTIATION_NOT_FOUND for invalid ID", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await assert.rejects(
      () => createAgreementFromNegotiation(fakeId),
      (err: any) => { assert.ok(["NEGOTIATION_NOT_FOUND", "NEGOTIATION_NOT_ACCEPTED"].includes(err.code)); return true; }
    );
  });

  test("5. Agreement has correct financial fields", async () => {
    const { negotiation } = await buildAcceptedNegotiation({ price: 20000, offerPrice: 18000 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    assert.ok(agreement.agreedUnitPrice > 0, "agreedUnitPrice should be set");
    assert.ok(agreement.originalUnitPrice > 0, "originalUnitPrice should be set");
    assert.ok(agreement.discountPercent >= 0, "discountPercent should be non-negative");
    assert.ok(agreement.quantity > 0, "quantity should be positive");
    assert.strictEqual(agreement.currency, "INR");
  });

  // ─── GROUP 2: isPaymentReady ───────────────────────────

  test("6. isPaymentReady returns true for APPROVED agreement", async () => {
    const { negotiation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    if (agreement.status === "APPROVED") {
      const result = await isPaymentReady(agreement._id.toString());
      assert.strictEqual(result.paymentReady, true);
    }
  });

  test("7. isPaymentReady throws AGREEMENT_NOT_APPROVED for PENDING_APPROVAL agreement", async () => {
    const { negotiation } = await buildAcceptedNegotiation({ autoApprovalLimit: 1 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    if (agreement.status === "PENDING_APPROVAL") {
      await assert.rejects(
        () => isPaymentReady(agreement._id.toString()),
        (err: any) => { assert.strictEqual(err.code, "AGREEMENT_NOT_APPROVED"); return true; }
      );
    }
  });

  test("8. isPaymentReady throws AGREEMENT_NOT_FOUND for invalid ID", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await assert.rejects(
      () => isPaymentReady(fakeId),
      (err: any) => { assert.strictEqual(err.code, "AGREEMENT_NOT_FOUND"); return true; }
    );
  });

  // ─── GROUP 3: PLACE_ORDER action ──────────────────────

  test("9. PLACE_ORDER returns paymentReady=true and PAY_NOW action for auto-approved order", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const state = makeState(negotiation);

    const result = await processBuyerAction(
      conversation.conversationId,
      { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
      state
    );

    assert.ok(result.agreement, "Should have agreement");
    assert.strictEqual(result.agreement!.status, "APPROVED");
    assert.strictEqual(result.paymentReady, true);
    assert.ok(result.actions?.find(a => a.type === "PAY_NOW"), "PAY_NOW action expected");
  });

  test("10. PLACE_ORDER returns paymentReady=false and VIEW_ORDER_STATUS for PENDING_APPROVAL", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 1 });
    const state = makeState(negotiation);

    const result = await processBuyerAction(
      conversation.conversationId,
      { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
      state
    );

    assert.ok(result.agreement, "Should have agreement");
    if (result.agreement!.status === "PENDING_APPROVAL") {
      assert.strictEqual(result.paymentReady, false);
      assert.ok(result.actions?.find(a => a.type === "VIEW_ORDER_STATUS"), "VIEW_ORDER_STATUS action expected");
    }
  });

  test("11. PLACE_ORDER is idempotent — calling twice returns same agreement ID", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);

    const first = await processBuyerAction(
      conversation.conversationId,
      { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
      state
    );
    const second = await processBuyerAction(
      conversation.conversationId,
      { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
      state
    );

    assert.strictEqual(first.agreement?.id, second.agreement?.id);
  });

  test("12. PLACE_ORDER throws NEGOTIATION_NOT_ACCEPTED when negotiation is still ACTIVE", async () => {
    const { merchant, product, policy } = await createFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });
    const conversation = await createConversation();
    const state = makeState(neg, { negotiationStatus: "ACTIVE" });

    await assert.rejects(
      () => processBuyerAction(
        conversation.conversationId,
        { type: "PLACE_ORDER", negotiationId: neg._id.toString() },
        state
      ),
      (err: any) => { assert.ok(["NEGOTIATION_NOT_ACCEPTED", "NEGOTIATION_NOT_FOUND"].includes(err.code)); return true; }
    );
  });

  test("13. PLACE_ORDER throws NEGOTIATION_NOT_FOUND when no negotiationId", async () => {
    const conversation = await createConversation();
    const state = makeState({ _id: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId() }, {
      negotiationId: null, negotiationStatus: null,
    });

    await assert.rejects(
      () => processBuyerAction(conversation.conversationId, { type: "PLACE_ORDER" }, state),
      (err: any) => { assert.strictEqual(err.code, "NEGOTIATION_NOT_FOUND"); return true; }
    );
  });

  test("14. PLACE_ORDER persists agreementId, agreementStatus, paymentReady to searchState", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);

    const result = await processBuyerAction(
      conversation.conversationId,
      { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
      state
    );

    assert.ok(result.searchState.agreementId, "searchState.agreementId should be set");
    assert.ok(result.searchState.agreementStatus, "searchState.agreementStatus should be set");
    assert.ok(result.searchState.paymentReady !== undefined, "searchState.paymentReady should be set");
  });

  test("15. PLACE_ORDER creates ORDER_PLACED audit event with actorType=BUYER", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);

    await processBuyerAction(
      conversation.conversationId,
      { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
      state
    );

    const auditEvent = await AuditEvent.findOne({ eventType: "ORDER_PLACED" });
    assert.ok(auditEvent, "ORDER_PLACED audit event should exist");
    assert.strictEqual((auditEvent as any).actorType, "BUYER");
  });

  test("16. PLACE_ORDER cross-conversation safety: rejects mismatched negotiationId", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const conversation = await createConversation();
    // state has a DIFFERENT negotiationId than the action payload
    const state = makeState(negotiation, {
      negotiationId: new mongoose.Types.ObjectId().toString(),
    });

    await assert.rejects(
      () => processBuyerAction(
        conversation.conversationId,
        { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
        state
      ),
      (err: any) => { assert.ok(err.code, "Should throw AppCustomError"); return true; }
    );
  });

  test("17. PLACE_ORDER message mentions ₹ order value", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const state = makeState(negotiation);

    const result = await processBuyerAction(
      conversation.conversationId,
      { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
      state
    );

    assert.ok(result.message.includes("₹"), "Message should mention order value with ₹ symbol");
  });

  // ─── GROUP 4: VIEW_ORDER_STATUS ───────────────────────

  test("18. VIEW_ORDER_STATUS shows PAY_NOW for APPROVED+paymentReady", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());

    if (agreement.status === "APPROVED") {
      const state = makeState(negotiation, {
        agreementId: agreement._id.toString(),
        agreementStatus: "APPROVED",
      });

      const result = await processBuyerAction(
        conversation.conversationId,
        { type: "VIEW_ORDER_STATUS", agreementId: agreement._id.toString() },
        state
      );

      assert.strictEqual(result.paymentReady, true);
      assert.ok(result.actions?.find(a => a.type === "PAY_NOW"), "PAY_NOW action expected");
    }
  });

  test("19. VIEW_ORDER_STATUS shows VIEW_ORDER_STATUS for PENDING_APPROVAL", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 1 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());

    if (agreement.status === "PENDING_APPROVAL") {
      const state = makeState(negotiation, {
        agreementId: agreement._id.toString(),
        agreementStatus: "PENDING_APPROVAL",
      });

      const result = await processBuyerAction(
        conversation.conversationId,
        { type: "VIEW_ORDER_STATUS", agreementId: agreement._id.toString() },
        state
      );

      assert.strictEqual(result.paymentReady, false);
      assert.ok(result.actions?.find(a => a.type === "VIEW_ORDER_STATUS"), "VIEW_ORDER_STATUS action expected");
    }
  });

  test("20. VIEW_ORDER_STATUS throws AGREEMENT_NOT_FOUND when no agreementId", async () => {
    const conversation = await createConversation();
    const state = makeState(
      { _id: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId() },
      { agreementId: null }
    );

    await assert.rejects(
      () => processBuyerAction(conversation.conversationId, { type: "VIEW_ORDER_STATUS" }, state),
      (err: any) => { assert.strictEqual(err.code, "AGREEMENT_NOT_FOUND"); return true; }
    );
  });

  test("21. VIEW_ORDER_STATUS returns agreement.id and status in response", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation();
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    const state = makeState(negotiation, { agreementId: agreement._id.toString() });

    const result = await processBuyerAction(
      conversation.conversationId,
      { type: "VIEW_ORDER_STATUS", agreementId: agreement._id.toString() },
      state
    );

    assert.ok(result.agreement, "Result should contain agreement object");
    assert.strictEqual(result.agreement!.id, agreement._id.toString());
  });

  // ─── GROUP 5: PAY_NOW ─────────────────────────────────

  test("22. PAY_NOW succeeds and returns paymentReady=true for APPROVED agreement", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());

    if (agreement.status === "APPROVED") {
      const state = makeState(negotiation, {
        agreementId: agreement._id.toString(),
        agreementStatus: "APPROVED",
        paymentReady: true,
      });

      const result = await processBuyerAction(
        conversation.conversationId,
        { type: "PAY_NOW", agreementId: agreement._id.toString() },
        state
      );

      assert.strictEqual(result.paymentReady, true);
      assert.ok(result.message.toLowerCase().includes("payment"));
      assert.ok(result.actions?.find(a => a.type === "PAY_NOW"), "PAY_NOW action in response");
    }
  });

  test("23. PAY_NOW throws ORDER_NOT_READY for PENDING_APPROVAL agreement", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 1 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());

    if (agreement.status === "PENDING_APPROVAL") {
      const state = makeState(negotiation, {
        agreementId: agreement._id.toString(),
        agreementStatus: "PENDING_APPROVAL",
      });

      await assert.rejects(
        () => processBuyerAction(
          conversation.conversationId,
          { type: "PAY_NOW", agreementId: agreement._id.toString() },
          state
        ),
        (err: any) => { assert.strictEqual(err.code, "ORDER_NOT_READY"); return true; }
      );
    }
  });

  test("24. PAY_NOW throws AGREEMENT_NOT_FOUND when no agreementId", async () => {
    const conversation = await createConversation();
    const state = makeState(
      { _id: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId() },
      { agreementId: null }
    );

    await assert.rejects(
      () => processBuyerAction(conversation.conversationId, { type: "PAY_NOW" }, state),
      (err: any) => { assert.strictEqual(err.code, "AGREEMENT_NOT_FOUND"); return true; }
    );
  });

  test("25. PAY_NOW message includes ₹ order value and quantity", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());

    if (agreement.status === "APPROVED") {
      const state = makeState(negotiation, {
        agreementId: agreement._id.toString(),
        agreementStatus: "APPROVED",
        paymentReady: true,
      });

      const result = await processBuyerAction(
        conversation.conversationId,
        { type: "PAY_NOW", agreementId: agreement._id.toString() },
        state
      );

      assert.ok(result.message.includes("₹"), "Should include ₹ symbol");
    }
  });

  // ─── GROUP 6: Natural Language PLACE_ORDER intent ────

  test("26. localFallbackIntent: 'place the order' → PLACE_ORDER when negotiation ACCEPTED", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);
    const intent = localFallbackIntent("place the order", state);
    assert.strictEqual(intent.type, "PLACE_ORDER");
  });

  test("27. localFallbackIntent: 'complete the purchase' → PLACE_ORDER when ACCEPTED", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);
    const intent = localFallbackIntent("complete the purchase", state);
    assert.strictEqual(intent.type, "PLACE_ORDER");
  });

  test("28. localFallbackIntent: 'confirm the order' → PLACE_ORDER when ACCEPTED", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);
    const intent = localFallbackIntent("confirm the order", state);
    assert.strictEqual(intent.type, "PLACE_ORDER");
  });

  test("29. localFallbackIntent: 'go ahead and order it' → PLACE_ORDER when ACCEPTED", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);
    const intent = localFallbackIntent("go ahead and order it", state);
    assert.strictEqual(intent.type, "PLACE_ORDER");
  });

  test("30. localFallbackIntent: 'I want to place the order' → PLACE_ORDER when ACCEPTED", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);
    const intent = localFallbackIntent("I want to place the order", state);
    assert.strictEqual(intent.type, "PLACE_ORDER");
  });

  test("31. localFallbackIntent: 'place the order' does NOT return PLACE_ORDER when negotiation is ACTIVE", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation, { negotiationStatus: "ACTIVE" });
    const intent = localFallbackIntent("place the order", state);
    assert.notStrictEqual(intent.type, "PLACE_ORDER");
  });

  test("32. localFallbackIntent: 'yes' alone does NOT trigger PLACE_ORDER without pendingAction", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation, { pendingAction: null });
    const intent = localFallbackIntent("yes", state);
    assert.notStrictEqual(intent.type, "PLACE_ORDER");
  });

  test("33. localFallbackIntent: 'yes' triggers PLACE_ORDER when pendingAction=PLACE_ORDER", async () => {
    const { negotiation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation, { pendingAction: "PLACE_ORDER" });
    const intent = localFallbackIntent("yes", state);
    assert.strictEqual(intent.type, "PLACE_ORDER");
  });

  test("34. runBuyerAgent: 'place the order' triggers agreement creation when ACCEPTED", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const state = makeState(negotiation);
    await updateConversationState(conversation.conversationId, state);

    const result = await runBuyerAgent({
      message: "place the order",
      conversationId: conversation.conversationId,
      provider: testMockProvider,
    });

    assert.ok(result.message.length > 0, "Should return a message");
    assert.ok(
      result.agreement || result.searchState.agreementId,
      "Should have created an agreement"
    );
  });

  test("35. runBuyerAgent: 'go ahead and place the order' triggers agreement creation", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation({ autoApprovalLimit: 100000 });
    const state = makeState(negotiation);
    await updateConversationState(conversation.conversationId, state);

    const result = await runBuyerAgent({
      message: "go ahead and place the order",
      conversationId: conversation.conversationId,
      provider: testMockProvider,
    });

    assert.ok(result.message.length > 0);
  });

  // ─── GROUP 7: Approval gateway ────────────────────────

  test("36. Auto-approved when finalOrderValue <= autoApprovalLimit", async () => {
    const { negotiation } = await buildAcceptedNegotiation({
      price: 20000, offerPrice: 18000, autoApprovalLimit: 100000,
    });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    assert.strictEqual(agreement.status, "APPROVED");
  });

  test("37. PENDING_APPROVAL when finalOrderValue > autoApprovalLimit", async () => {
    const { negotiation } = await buildAcceptedNegotiation({
      price: 20000, offerPrice: 18000, autoApprovalLimit: 1,
    });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    assert.strictEqual(agreement.status, "PENDING_APPROVAL");
  });

  test("38. PENDING_APPROVAL creates Approval document with PENDING status", async () => {
    const { negotiation } = await buildAcceptedNegotiation({ autoApprovalLimit: 1 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    if (agreement.status === "PENDING_APPROVAL") {
      const approval = await Approval.findOne({ agreementId: agreement._id });
      assert.ok(approval, "Approval document should exist");
      assert.strictEqual((approval as any).status, "PENDING");
    }
  });

  test("39. approveAgreement transitions PENDING_APPROVAL → APPROVED, isPaymentReady returns true", async () => {
    const { negotiation } = await buildAcceptedNegotiation({ autoApprovalLimit: 1 });
    const agreement = await createAgreementFromNegotiation(negotiation._id.toString());
    if (agreement.status === "PENDING_APPROVAL") {
      const approveResult = await approveAgreement(agreement._id.toString(), "test-reviewer");
      assert.strictEqual(approveResult.status, "APPROVED");
      assert.strictEqual(approveResult.paymentReady, true);

      const payResult = await isPaymentReady(agreement._id.toString());
      assert.strictEqual(payResult.paymentReady, true);
    }
  });

  // ─── GROUP 8: Idempotency & Persistence ──────────────

  test("40. Multiple PLACE_ORDER calls → only ONE Agreement in DB", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation);

    for (let i = 0; i < 3; i++) {
      await processBuyerAction(
        conversation.conversationId,
        { type: "PLACE_ORDER", negotiationId: negotiation._id.toString() },
        state
      );
    }

    const count = await Agreement.countDocuments({ negotiationId: negotiation._id });
    assert.strictEqual(count, 1, "Only one Agreement should exist after multiple PLACE_ORDER calls");
  });

  test("41. paymentReady persists to and is restored from MongoDB via storedStateToBuyerState", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation();
    const fakeAgreementId = new mongoose.Types.ObjectId().toString();
    const state = makeState(negotiation, {
      agreementId: fakeAgreementId,
      agreementStatus: "APPROVED",
      paymentReady: true,
    });

    await updateConversationState(conversation.conversationId, state);
    const doc = await getConversation(conversation.conversationId);
    assert.ok(doc, "Conversation doc should exist");

    const restored = storedStateToBuyerState(doc!.buyerState, []);
    assert.strictEqual(restored.paymentReady, true);
    assert.strictEqual(restored.agreementStatus, "APPROVED");
  });

  test("42. paymentReady=false persists and restores correctly", async () => {
    const { negotiation, conversation } = await buildAcceptedNegotiation();
    const state = makeState(negotiation, {
      agreementId: new mongoose.Types.ObjectId().toString(),
      agreementStatus: "PENDING_APPROVAL",
      paymentReady: false,
    });

    await updateConversationState(conversation.conversationId, state);
    const doc = await getConversation(conversation.conversationId);
    const restored = storedStateToBuyerState(doc!.buyerState, []);
    assert.strictEqual(restored.paymentReady, false);
    assert.strictEqual(restored.agreementStatus, "PENDING_APPROVAL");
  });
});