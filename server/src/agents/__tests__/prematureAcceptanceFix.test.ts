/**
 * prematureAcceptanceFix.test.ts
 *
 * Test suite verifying premature negotiation acceptance fix & commercial term handling.
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
import { localFallbackIntent, isExplicitAcceptance } from "../intentNormalizer.js";
import type { LLMProvider } from "../../llm/llmProvider.js";
import { createConversation, getConversation } from "../../services/conversationService.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/razorpay_hackathon_test";

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

describe("Premature Negotiation Acceptance Fix Tests", () => {
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

  async function createTestFixture(opts: {
    price?: number;
    costPrice?: number;
    inventory?: number;
    freeShippingThreshold?: number;
  } = {}) {
    const merchant = await Merchant.create({
      name: "Ergo Merchant",
      businessName: "Ergo Merchant Pvt Ltd",
      email: `merchant_${Date.now()}_${Math.random()}@test.com`,
      apiKey: `key_${Date.now()}_${Math.random()}`,
    });

    const product = await Product.create({
      merchantId: merchant._id,
      name: "Office Chair Pro",
      description: "Ergonomic office chair with adjustable height",
      category: "Office Furniture",
      sku: `SKU_${Date.now()}_${Math.random()}`,
      price: opts.price ?? 24000,
      costPrice: opts.costPrice ?? 6000,
      inventory: opts.inventory ?? 100,
      deliveryDays: 3,
      tags: ["office", "chair", "ergonomic"],
      isNegotiable: true,
    });

    const policy = await Policy.create({
      merchantId: merchant._id,
      name: "Standard Policy",
      maxDiscountPercent: 20,
      minMarginPercent: 10,
      maxNegotiationRounds: 3,
      autoApprovalEnabled: true,
      autoApprovalLimit: 500000,
      freeShippingThreshold: opts.freeShippingThreshold ?? 15000,
    });

    return { merchant, product, policy };
  }

  // 1. "I'm thinking around ₹22k." -> BUYER_OFFER -> ACTIVE
  test("1. 'I'm thinking around ₹22k' produces BUYER_OFFER and remains ACTIVE", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "I'm thinking around 22k",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.ok(res.actions);
    const placeOrderAction = res.actions.find((a) => a.type === "PLACE_ORDER");
    assert.equal(placeOrderAction, undefined);
    const acceptAction = res.actions.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
  });

  // 2. "₹22k with free delivery." -> BUYER_OFFER -> requestedFreeDelivery = true -> ACTIVE
  test("2. '₹22k with free delivery' sets requestedFreeDelivery and remains ACTIVE", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "22k with free delivery",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.ok(res.message.includes("free delivery is available"));
    const acceptAction = res.actions?.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.ok(acceptAction.label.includes("Free Delivery"));
  });

  // 3. "22k for 10 units, is this okay?" -> buyerOffer=22000, quantity=10 -> ACTIVE
  test("3. '22k for 10 units, is this okay?' parses price 22000 and quantity 10, remaining ACTIVE", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "22k for 10 units, is this okay?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.equal(res.searchState.quantity, 10);
    const placeOrderAction = res.actions?.find((a) => a.type === "PLACE_ORDER");
    assert.equal(placeOrderAction, undefined);
  });

  // 4. "22k with free delivery for 10 units, is this okay?" -> price=22000, quantity=10, requestedFreeDelivery=true -> ACTIVE
  test("4. '22k with free delivery for 10 units, is this okay?' parses all commercial terms and stays ACTIVE", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "yeah im thinking around 22k with free delivery 10 units is this work",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
    assert.equal(res.searchState.quantity, 10);
    assert.ok(res.message.includes("free delivery is available"));
    assert.ok(res.actions);
    const acceptAction = res.actions.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction);
    assert.ok(acceptAction.label.includes("Accept ₹22,000 + Free Delivery"));
    const placeOrderAction = res.actions.find((a) => a.type === "PLACE_ORDER");
    assert.equal(placeOrderAction, undefined);
  });

  // 5. "Yes, I'll take it." after confirmation -> ACCEPTED
  test("5. 'Yes, I'll take it' transitions active negotiation to ACCEPTED", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    // Step A: Send offer proposal
    const resProp = await runBuyerAgent({
      message: "22k for 10 units",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    assert.equal(resProp.searchState.negotiationStatus, "ACTIVE");

    // Step B: Explicit acceptance
    const resAccept = await runBuyerAgent({
      message: "Yes, I'll take it.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(resAccept.searchState.negotiationStatus, "ACCEPTED");
    const placeOrderAction = resAccept.actions?.find((a) => a.type === "PLACE_ORDER");
    assert.ok(placeOrderAction);
  });

  // 6. Isolated "yes" with no pending acceptance -> NOT ACCEPTED
  test("6. Helper isExplicitAcceptance distinguishes proposal questions from explicit accept", () => {
    assert.equal(isExplicitAcceptance("yeah im thinking around 22k with free delivery 10 units is this work"), false);
    assert.equal(isExplicitAcceptance("can you do 22k?"), false);
    assert.equal(isExplicitAcceptance("would 22k work?"), false);
    assert.equal(isExplicitAcceptance("Yes, I'll take it."), true);
    assert.equal(isExplicitAcceptance("That works for me."), true);
    assert.equal(isExplicitAcceptance("Deal."), true);
    assert.equal(isExplicitAcceptance("Alright, I'll accept those terms."), true);
  });

  // 7. "That works for me" after confirmation request -> ACCEPTED
  test("7. 'That works for me' transitions negotiation to ACCEPTED", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    await runBuyerAgent({
      message: "Can you do 22k?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const resAccept = await runBuyerAgent({
      message: "That works for me",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(resAccept.searchState.negotiationStatus, "ACCEPTED");
  });

  // 8. "Can you do 21k instead?" -> BUYER_OFFER -> ACTIVE
  test("8. 'Can you do 21k instead?' returns counter/valid offer and remains ACTIVE", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "Can you do 21k instead?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 9. "Can you also include free delivery?" -> ACTIVE
  test("9. 'Can you also include free delivery?' remains ACTIVE and updates delivery request", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "Can you also include free delivery?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACTIVE");
  });

  // 10. "I'll accept 22k with free delivery." -> ACCEPTED
  test("10. 'I'll accept 22k with free delivery' sets ACCEPTED", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    await runBuyerAgent({
      message: "22k with free delivery for 10 units",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const res = await runBuyerAgent({
      message: "I'll accept 22k with free delivery.",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.negotiationStatus, "ACCEPTED");
    const placeOrder = res.actions?.find((a) => a.type === "PLACE_ORDER");
    assert.ok(placeOrder);
  });

  // 11. Required End-to-End Test (Turn 1 to Turn 5)
  test("11. Required End-to-End 5-Turn Conversation Flow", async () => {
    const { merchant, product } = await createTestFixture();

    // Turn 1: "I want an office chair."
    const turn1 = await runBuyerAgent({
      message: "I want an office chair.",
      provider: testMockProvider,
    });
    const convId = turn1.conversationId;
    assert.ok(turn1.products.length > 0);

    // Turn 2: "I'll take the first one."
    const turn2 = await runBuyerAgent({
      message: "I'll take the first one.",
      conversationId: convId,
      provider: testMockProvider,
    });
    assert.equal(turn2.searchState.selectedProductName, "Office Chair Pro");

    // Turn 3: "Can you give me a better price?"
    const turn3 = await runBuyerAgent({
      message: "Can you give me a better price?",
      conversationId: convId,
      provider: testMockProvider,
    });
    assert.equal(turn3.nextAction, "ASK_BUYER_TARGET");
    assert.ok(turn3.message.includes("What price were you hoping for?"));

    // Turn 4: "yeah I'm thinking around 22k with free delivery, 10 units. Is this okay?"
    const turn4 = await runBuyerAgent({
      message: "yeah I'm thinking around 22k with free delivery, 10 units. Is this okay?",
      conversationId: convId,
      provider: testMockProvider,
    });
    assert.equal(turn4.searchState.negotiationStatus, "ACTIVE");
    assert.equal(turn4.searchState.quantity, 10);
    assert.ok(turn4.actions);
    const acceptAction4 = turn4.actions.find((a) => a.type === "ACCEPT_NEGOTIATION");
    assert.ok(acceptAction4);
    const placeOrder4 = turn4.actions.find((a) => a.type === "PLACE_ORDER");
    assert.equal(placeOrder4, undefined);

    // Turn 5: "Alright, I'll accept those terms."
    const turn5 = await runBuyerAgent({
      message: "Alright, I'll accept those terms.",
      conversationId: convId,
      provider: testMockProvider,
    });
    assert.equal(turn5.searchState.negotiationStatus, "ACCEPTED");
    assert.ok(turn5.actions);
    const placeOrder5 = turn5.actions.find((a) => a.type === "PLACE_ORDER");
    assert.ok(placeOrder5);
  });

  // 12. Inventory check for 10 units (insufficient inventory)
  test("12. Inventory limit check rejects negotiation when inventory is insufficient", async () => {
    const { merchant, product } = await createTestFixture({ inventory: 5 }); // Only 5 in stock
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "22k for 10 units, is this okay?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("only 5 units available"));
    assert.equal(res.searchState.negotiationId, null); // Negotiation did not start
  });

  // 13. Attempting to modify terms on ACCEPTED negotiation returns informative message
  test("13. Modifying terms on already ACCEPTED negotiation returns clear error message", async () => {
    const { merchant, product } = await createTestFixture();
    const negDoc = await Negotiation.create({
      merchantId: merchant._id,
      productId: product._id,
      policyId: (await Policy.findOne({ merchantId: merchant._id }))!._id,
      status: "ACCEPTED",
      acceptedPrice: 22000,
      quantity: 10,
      currency: "INR",
      originalUnitPrice: 24000,
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
      message: "Can you do 20k instead?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("already been accepted"));
    assert.ok(res.message.includes("Start a new negotiation"));
  });

  // 14. Audit chronology verification
  test("14. Audit trail reflects correct chronology without duplicate ACCEPTED events", async () => {
    const { merchant, product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    // Proposal
    await runBuyerAgent({
      message: "22k for 10 units",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    // Accept button click
    const storedConv = await getConversation(conv.conversationId);
    await runBuyerAgent({
      conversationId: conv.conversationId,
      action: {
        type: "ACCEPT_NEGOTIATION",
        negotiationId: storedConv?.buyerState.negotiationId || undefined,
      },
    });

    const acceptAudits = await AuditEvent.find({
      negotiationId: storedConv?.buyerState.negotiationId,
      eventType: "NEGOTIATION_ACCEPTED",
    });

    assert.equal(acceptAudits.length, 1);
    assert.equal(acceptAudits[0].actorType, "BUYER");
  });
});
