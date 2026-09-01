/**
 * commerceQuery.test.ts
 *
 * Test suite verifying generic COMMERCE_QUERY resolver capabilities (40+ tests).
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

describe("Generic COMMERCE_QUERY Resolver Tests", () => {
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
    category?: string;
    productName?: string;
    price?: number;
    costPrice?: number;
    inventory?: number;
    deliveryDays?: number;
    isNegotiable?: boolean;
    maxQuantityPerOrder?: number;
    freeShippingThreshold?: number;
  } = {}) {
    const merchant = await Merchant.create({
      name: "Commerce Query Merchant",
      businessName: "CQ Merchant Pvt Ltd",
      email: `merchant_${Date.now()}_${Math.random()}@test.com`,
      apiKey: `key_${Date.now()}_${Math.random()}`,
    });

    const product = await Product.create({
      merchantId: merchant._id,
      name: opts.productName ?? "Ergonomic Desk Chair",
      description: "High quality ergonomic desk chair",
      category: opts.category ?? "Furniture",
      sku: `SKU_${Date.now()}_${Math.random()}`,
      price: opts.price ?? 20000,
      costPrice: opts.costPrice ?? 12000,
      inventory: opts.inventory ?? 50,
      deliveryDays: opts.deliveryDays ?? 4,
      tags: ["chair", "ergonomic", "office"],
      isNegotiable: opts.isNegotiable ?? true,
    });

    const policy = await Policy.create({
      merchantId: merchant._id,
      name: "Standard Policy",
      maxDiscountPercent: 20,
      minMarginPercent: 10,
      maxNegotiationRounds: 3,
      maxQuantityPerOrder: opts.maxQuantityPerOrder ?? 20,
      autoApprovalEnabled: true,
      autoApprovalLimit: 100000,
      freeShippingThreshold: opts.freeShippingThreshold ?? 15000,
    });

    return { merchant, product, policy };
  }

  // 1. Product price query
  test("1. Product price query returns listed price", async () => {
    const { product } = await createTestFixture({ price: 25000 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "What is the price of this?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "PRODUCT_PRICE");
    assert.ok(res.message.includes("25,000"));
  });

  // 2. Current negotiation offer query
  test("2. Current offer query returns active negotiation offer", async () => {
    const { merchant, product, policy } = await createTestFixture({ price: 20000 });
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
      message: "What is your current offer?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "CURRENT_OFFER");
    assert.ok(res.message.includes("18,000"));
  });

  // 3. Inventory query
  test("3. Inventory query returns stock level", async () => {
    const { product } = await createTestFixture({ inventory: 42 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "How many are left in stock?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "PRODUCT_INVENTORY");
    assert.ok(res.message.includes("42"));
  });

  // 4. Delivery time query
  test("4. Delivery time query returns deliveryDays", async () => {
    const { product } = await createTestFixture({ deliveryDays: 5 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "When will it arrive?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "PRODUCT_DELIVERY");
    assert.ok(res.message.includes("5 business days"));
  });

  // 5. Negotiability query
  test("5. Negotiability query returns negotiability status", async () => {
    const { product } = await createTestFixture({ isNegotiable: true });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "Can I negotiate this?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "PRODUCT_NEGOTIABILITY");
    assert.ok(res.message.includes("is negotiable"));
  });

  // 6. Quantity limit query
  test("6. Quantity limit query returns maxQuantityPerOrder", async () => {
    const { product } = await createTestFixture({ maxQuantityPerOrder: 15, inventory: 100 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "How many can I buy?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "ORDER_QUANTITY_LIMIT");
    assert.ok(res.message.includes("15 units"));
  });

  // 7. Discount availability query
  test("7. Discount availability query returns safe policy information", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "Is there any discount allowed?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "DISCOUNT_AVAILABILITY");
    assert.ok(res.message.includes("allow discounts"));
  });

  // 8. Shipping availability query
  test("8. Shipping availability query returns free shipping threshold", async () => {
    const { product } = await createTestFixture({ freeShippingThreshold: 15000 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "Is shipping free?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "SHIPPING_AVAILABILITY");
    assert.ok(res.message.includes("15,000"));
  });

  // 9. Negotiation status query
  test("9. Negotiation status query returns current status", async () => {
    const { merchant, product, policy } = await createTestFixture();
    const neg = await startNegotiation({
      merchantId: merchant._id.toString(),
      productId: product._id.toString(),
      policyId: policy._id.toString(),
      quantity: 1,
      currency: "INR",
    });

    const conv = await createConversation({
      negotiationId: neg.id,
      negotiationStatus: "ACTIVE",
    });

    const res = await runBuyerAgent({
      message: "What is the status of my negotiation?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "NEGOTIATION_STATUS");
    assert.ok(res.message.includes("active"));
  });

  // 10. Agreement status query
  test("10. Agreement status query returns Agreement status", async () => {
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
      message: "Is my order approved?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "AGREEMENT_STATUS");
    assert.ok(res.message.includes("approved and is ready for payment"));
  });

  // 11. Payment readiness query
  test("11. Payment readiness query uses isPaymentReady service", async () => {
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
      message: "Can I pay now?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "PAYMENT_READINESS");
    assert.ok(res.message.includes("ready for payment"));
  });

  // 12. Order total query
  test("12. Order total query calculates total for requested quantity", async () => {
    const { product } = await createTestFixture({ price: 18500 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
      quantity: 10,
    });

    const res = await runBuyerAgent({
      message: "What is the total for 10?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "ORDER_TOTAL");
    assert.ok(res.message.includes("185,000"));
  });

  // 13. Price explanation
  test("13. Price explanation query returns buyer-safe rationale", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "Why can't you go lower?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "PRICE_EXPLANATION");
    assert.ok(res.message.includes("pricing rules"));
  });

  // 14. Policy explanation
  test("14. Policy explanation returns safe merchant rule text", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "Why isn't free shipping available?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.source, "POLICY" || res.commerceQuery.source === "ECONOMIC_ENGINE");
  });

  // 15. No selected product clarification
  test("15. Query without selected product asks for clarification", async () => {
    const conv = await createConversation({});

    const res = await runBuyerAgent({
      message: "How much is it?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.ok(res.message.includes("Which product are you asking about?"));
  });

  // 16. Missing product handling
  test("16. Missing product ID returns clarification", async () => {
    const conv = await createConversation({
      selectedProductId: new mongoose.Types.ObjectId().toString(),
    });

    const res = await runBuyerAgent({
      message: "How much is it?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("Which product are you asking about?"));
  });

  // 17. Missing negotiation handling
  test("17. Negotiation status query with no negotiation returns clear system response", async () => {
    const conv = await createConversation({});

    const res = await runBuyerAgent({
      message: "What's the status of my negotiation?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "NEGOTIATION_STATUS");
    assert.ok(res.message.includes("no active negotiation"));
  });

  // 18. Missing agreement handling
  test("18. Agreement status query with no agreement returns clear message", async () => {
    const conv = await createConversation({});

    const res = await runBuyerAgent({
      message: "Is my order approved?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "AGREEMENT_STATUS");
    assert.ok(res.message.includes("No order agreement"));
  });

  // 19. Unsupported query handling
  test("19. Unsupported question returns polite no-fabrication message", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "Does this come with a 3-year warranty?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "UNSUPPORTED_QUERY");
    assert.ok(res.message.includes("don't have structured information"));
  });

  // 20. Ambiguous product reference
  test("20. Ambiguous query with multiple search results asks for clarification", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({});

    const res = await runBuyerAgent({
      message: "How much is the chair?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("Which product"));
  });

  // 21. Search result index reference (1st option)
  test("21. 'How much is the 1st option?' resolves first search result", async () => {
    const { product } = await createTestFixture({ price: 19000 });
    const conv = await createConversation({
      searchResults: [product._id.toString()],
    });

    const res = await runBuyerAgent({
      message: "How much is the 1st option?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.ok(res.message.includes("19,000"));
  });

  // 22. Second product reference
  test("22. 'How much is the 2nd option?' resolves second search result", async () => {
    const { merchant } = await createTestFixture();
    const prod1 = await Product.create({
      merchantId: merchant._id,
      name: "Chair A",
      description: "Desk chair",
      category: "Furniture",
      sku: "SKU_A",
      price: 15000,
      costPrice: 8000,
      inventory: 10,
    });
    const prod2 = await Product.create({
      merchantId: merchant._id,
      name: "Chair B",
      description: "Pro chair",
      category: "Furniture",
      sku: "SKU_B",
      price: 28000,
      costPrice: 16000,
      inventory: 10,
    });

    const conv = await createConversation({
      searchResults: [prod1._id.toString(), prod2._id.toString()],
    });

    const res = await runBuyerAgent({
      message: "How much is the 2nd option?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.ok(res.message.includes("28,000"));
  });

  // 23. Current price after product price update
  test("23. Query returns updated product price after price change", async () => {
    const { product } = await createTestFixture({ price: 20000 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    // Update product price in DB
    product.price = 22500;
    await product.save();

    const res = await runBuyerAgent({
      message: "What is the price?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("22,500"));
  });

  // 24. Current inventory after inventory update
  test("24. Query returns updated inventory after stock change", async () => {
    const { product } = await createTestFixture({ inventory: 50 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    product.inventory = 12;
    await product.save();

    const res = await runBuyerAgent({
      message: "How many are available?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("12"));
  });

  // 25. Current policy after policy change
  test("25. Query uses updated policy after threshold change", async () => {
    const { product, policy } = await createTestFixture({ freeShippingThreshold: 15000 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    policy.freeShippingThreshold = 5000;
    await policy.save();

    const res = await runBuyerAgent({
      message: "Is shipping free?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("5,000"));
  });

  // 26. Current negotiation offer update
  test("26. Query uses updated negotiation offer after offer update", async () => {
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
      message: "What is your current offer?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("18,000"));
  });

  // 27. Agreement uses agreed price (not list price)
  test("27. Agreement order total query uses agreed price", async () => {
    const { merchant, product, policy } = await createTestFixture({ price: 24000 });
    const agreement = await Agreement.create({
      negotiationId: new mongoose.Types.ObjectId(),
      merchantId: merchant._id,
      productId: product._id,
      policyId: policy._id,
      status: "APPROVED",
      quantity: 5,
      currency: "INR",
      originalUnitPrice: 24000,
      agreedUnitPrice: 18000,
      discountPercent: 25,
      finalOrderValue: 90000,
      marginPercent: 66.6,
      approvedAt: new Date(),
    });

    const conv = await createConversation({
      agreementId: agreement._id.toString(),
      agreementStatus: "APPROVED",
    });

    const res = await runBuyerAgent({
      message: "What is my order total?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.equal(res.commerceQuery.kind, "ORDER_TOTAL");
    assert.ok(res.message.includes("90,000"));
  });

  // 28. Payment readiness uses existing service
  test("28. Payment readiness returns non-ready status for PENDING_APPROVAL agreement", async () => {
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
      message: "Can I pay now?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.commerceQuery);
    assert.ok(res.message.includes("not yet ready for payment"));
  });

  // 29. Zero financial state mutation from query
  test("29. COMMERCE_QUERY does NOT mutate price, negotiation, or agreement state", async () => {
    const { product } = await createTestFixture({ price: 20000 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    await runBuyerAgent({
      message: "What is the price?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const updatedConv = await getConversation(conv.conversationId);
    assert.equal(updatedConv?.buyerState.negotiationId, null);
    assert.equal(updatedConv?.buyerState.agreementId, null);
    const prodCheck = await Product.findById(product._id);
    assert.equal(prodCheck?.price, 20000);
  });

  // 30. Query does not start negotiation
  test("30. COMMERCE_QUERY does not start a new negotiation session", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    await runBuyerAgent({
      message: "Is this negotiable?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const count = await Negotiation.countDocuments({});
    assert.equal(count, 0);
  });

  // 31. Query does not create agreement
  test("31. COMMERCE_QUERY does not create an agreement document", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    await runBuyerAgent({
      message: "What is the total for 5?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    const count = await Agreement.countDocuments({});
    assert.equal(count, 0);
  });

  // 32. Query does not alter BuyerState unnecessarily
  test("32. COMMERCE_QUERY preserves existing selected product and topic", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      topic: "office chair",
      selectedProductId: product._id.toString(),
      selectedProductName: product.name,
    });

    const res = await runBuyerAgent({
      message: "How many are in stock?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.searchState.topic, "office chair");
    assert.equal(res.searchState.selectedProductId, product._id.toString());
  });

  // 33. Private policy fields not exposed
  test("33. Policy query response does NOT expose raw minMarginPercent", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "What is the minimum allowed discount?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.message.includes("minMarginPercent"), false);
    assert.equal(res.message.includes("minimum margin"), false);
  });

  // 34. costPrice not exposed in response message
  test("34. Query response NEVER exposes raw costPrice to the buyer", async () => {
    const { product } = await createTestFixture({ costPrice: 12345 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "Why can't you give a bigger discount?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.message.includes("12345"), false);
    assert.equal(res.message.includes("costPrice"), false);
  });

  // 35. Internal margin not exposed
  test("35. Internal margin percentages are hidden in buyer responses", async () => {
    const { product } = await createTestFixture();
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "How much profit does the merchant make?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.equal(res.message.includes("marginPercent"), false);
  });

  // 36. LLM cannot fabricate answer
  test("36. Backend result drives response message without LLM hallucination", async () => {
    const { product } = await createTestFixture({ deliveryDays: 7 });
    const conv = await createConversation({
      selectedProductId: product._id.toString(),
    });

    const res = await runBuyerAgent({
      message: "When will it arrive?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res.message.includes("7 business days"));
  });

  // 37. Multiple categories tested (Laptop category)
  test("37. Laptop category product query works seamlessly", async () => {
    const { merchant } = await createTestFixture();
    const laptop = await Product.create({
      merchantId: merchant._id,
      name: "UltraBook Pro 15",
      description: "High performance laptop",
      category: "Electronics",
      sku: "SKU_LAPTOP_99",
      price: 85000,
      costPrice: 60000,
      inventory: 15,
      deliveryDays: 2,
      tags: ["laptop", "electronics"],
      isNegotiable: true,
    });

    const conv = await createConversation({
      selectedProductId: laptop._id.toString(),
      selectedProductName: laptop.name,
    });

    const resPrice = await runBuyerAgent({
      message: "How much is this laptop?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    assert.ok(resPrice.message.includes("85,000"));

    const resDelivery = await runBuyerAgent({
      message: "When will this laptop arrive?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    assert.ok(resDelivery.message.includes("2 business days"));
  });

  // 38. Multiple categories tested (Phone category)
  test("38. Phone category product query works seamlessly", async () => {
    const { merchant } = await createTestFixture();
    const phone = await Product.create({
      merchantId: merchant._id,
      name: "SmartPhone X",
      description: "5G Smartphone",
      category: "Mobiles",
      sku: "SKU_PHONE_123",
      price: 45000,
      costPrice: 30000,
      inventory: 25,
      deliveryDays: 3,
      tags: ["phone", "mobile"],
      isNegotiable: true,
    });

    const conv = await createConversation({
      selectedProductId: phone._id.toString(),
      selectedProductName: phone.name,
    });

    const resStock = await runBuyerAgent({
      message: "How many phones are in stock?",
      conversationId: conv.conversationId,
      provider: testMockProvider,
    });
    assert.ok(resStock.message.includes("25"));
  });

  // 39. Multiple conversations isolated
  test("39. Multiple conversations query state independently without cross-leakage", async () => {
    const { product: prod1 } = await createTestFixture({ price: 10000, productName: "Item 1" });
    const { product: prod2 } = await createTestFixture({ price: 50000, productName: "Item 2" });

    const conv1 = await createConversation({ selectedProductId: prod1._id.toString() });
    const conv2 = await createConversation({ selectedProductId: prod2._id.toString() });

    const res1 = await runBuyerAgent({
      message: "What is the price?",
      conversationId: conv1.conversationId,
      provider: testMockProvider,
    });
    const res2 = await runBuyerAgent({
      message: "What is the price?",
      conversationId: conv2.conversationId,
      provider: testMockProvider,
    });

    assert.ok(res1.message.includes("10,000"));
    assert.ok(res2.message.includes("50,000"));
  });

  // 40. Complete commerce-query multi-turn conversation flow
  test("40. Multi-turn conversation preserving context across query follow-ups", async () => {
    const { product } = await createTestFixture({ price: 24000, inventory: 30, deliveryDays: 4 });

    // Turn 1: Search
    const res1 = await runBuyerAgent({
      message: "I want an office chair",
      provider: testMockProvider,
    });
    const convId = res1.conversationId;

    // Turn 2: Select
    const res2 = await runBuyerAgent({
      message: "I will take the first one",
      conversationId: convId,
      provider: testMockProvider,
    });

    // Turn 3: Query price
    const res3 = await runBuyerAgent({
      message: "What does this cost?",
      conversationId: convId,
      provider: testMockProvider,
    });
    assert.ok(res3.message.includes("24,000"));

    // Turn 4: Follow-up query stock (preserves selected chair context)
    const res4 = await runBuyerAgent({
      message: "How many are left in stock?",
      conversationId: convId,
      provider: testMockProvider,
    });
    assert.ok(res4.message.includes("30"));

    // Turn 5: Follow-up query delivery (preserves selected chair context)
    const res5 = await runBuyerAgent({
      message: "When will it arrive?",
      conversationId: convId,
      provider: testMockProvider,
    });
    assert.ok(res5.message.includes("4 business days"));
  });
});
